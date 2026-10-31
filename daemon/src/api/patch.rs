use super::storage::{ensure_writable_directory, read_storage_selection, runtime_has_root_access, storage_defaults};
use crate::patcher::{execute_patch_job, PatchRequest};
use crate::state::AppState;
use crate::utils::get_java_binary_in;
#[cfg(unix)]
use crate::utils::run_shell_command;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
};
use futures_util::stream::Stream;
use serde_json::{json, Value};
use std::convert::Infallible;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

#[derive(serde::Deserialize)]
pub(crate) struct AppQuery {
    pub(crate) pkg: Option<String>,
}

pub(crate) async fn get_status(State(state): State<AppState>) -> impl IntoResponse {
    let storage = read_storage_selection(&state).await;
    let workspace = storage
        .as_ref()
        .and_then(|value| value.get("workspacePath"))
        .and_then(Value::as_str)
        .map(PathBuf::from);
    let jre_ready = get_java_binary_in(&state.modpath, workspace.as_deref()).is_some();
    let is_patching = state.is_patching();
    let build_dir = workspace
        .as_ref()
        .map(|path| path.join("cache"))
        .unwrap_or_else(|| state.modpath.join("build_out"));
    let cli_ready = build_dir.join("morphe-cli.jar").exists();
    let cached_patch_bundle_url = tokio::fs::read_to_string(build_dir.join("patches.mpp.url"))
        .await
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let root_available = runtime_has_root_access();

    let is_android = cfg!(target_os = "android");
    let is_standalone_app = std::env::var("RVX_STANDALONE_APP").map(|v| v == "1").unwrap_or(false)
        || state.modpath.to_string_lossy().contains("com.rvx.patcher");
    let access_mode = if is_android && root_available {
        "root-integrated"
    } else if is_standalone_app {
        "nonroot-app"
    } else if is_android {
        "local-companion"
    } else {
        "desktop-local"
    };

    Json(json!({
        "status": "online",
        "daemon_version": env!("CARGO_PKG_VERSION"),
        "is_patching": is_patching,
        "jre_ready": jre_ready,
        "cli_ready": cli_ready,
        "cached_patch_bundle_url": cached_patch_bundle_url,
        "storage_selection": storage,
        "is_android": is_android,
        "root_available": root_available,
        "access_mode": access_mode,
        "web_runtime": "local-daemon",
        "pairing_required_for_local_web": false,
        "modpath": state.modpath.to_string_lossy()
    }))
}

pub(crate) async fn get_app_info(
    axum::extract::Query(query): axum::extract::Query<AppQuery>,
) -> impl IntoResponse {
    let pkg = query
        .pkg
        .unwrap_or_else(|| "com.google.android.youtube".to_string());
    #[allow(unused_mut)]
    let mut installed_version = "Unknown".to_string();
    #[allow(unused_mut)]
    let mut stock_apk = "Not found".to_string();

    #[cfg(unix)]
    {
        let ver_cmd = format!(
            "/system/bin/su -c 'dumpsys package {pkg} 2>/dev/null | grep versionName | cut -d= -f2 | head -n 1' 2>/dev/null || su -c 'dumpsys package {pkg} 2>/dev/null | grep versionName | cut -d= -f2 | head -n 1' 2>/dev/null || dumpsys package {pkg} 2>/dev/null | grep versionName | cut -d= -f2 | head -n 1",
            pkg = pkg
        );
        if let Ok(ver) = run_shell_command(&ver_cmd).await {
            let v = ver.trim();
            if !v.is_empty() {
                installed_version = v.to_string();
            }
        }
        let path_cmd = format!(
            "/system/bin/su -c 'pm path {pkg} 2>/dev/null | grep base | cut -d: -f2 | head -n 1' 2>/dev/null || su -c 'pm path {pkg} 2>/dev/null | grep base | cut -d: -f2 | head -n 1' 2>/dev/null || pm path {pkg} 2>/dev/null | grep base | cut -d: -f2 | head -n 1",
            pkg = pkg
        );
        if let Ok(path) = run_shell_command(&path_cmd).await {
            let p = path.trim();
            if !p.is_empty() {
                stock_apk = p.to_string();
            }
        }

        // Fallback: Check local storage and cache directories for stock APKs
        if stock_apk == "Not found" {
            let app_alias = match pkg.as_str() {
                "com.google.android.youtube" => "youtube",
                "com.google.android.apps.youtube.music" => "ytmusic",
                _ => pkg.split('.').last().unwrap_or("app"),
            };
            let search_dirs = [
                "/sdcard/Revancify-Xisr/cache",
                "/sdcard/Revancify-Xisr/apps/YouTube",
                "/sdcard/Revancify-Xisr",
                "/sdcard/RVX-Patcher/cache",
                "/sdcard/RVX-Patcher",
                "/sdcard/Download",
                "/data/data/com.termux/files/home/Revancify-Xisr/apps/YouTube",
                "/data/data/com.termux/files/home/Revancify-Xisr/cache",
            ];
            for dir in &search_dirs {
                if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if (name.contains(app_alias) || name.starts_with("21.") || name.starts_with("stock"))
                            && name.ends_with(".apk")
                            && !name.contains("test-")
                            && !name.contains("-Anddea")
                            && !name.contains("-Patched")
                        {
                            let p = entry.path();
                            if let Ok(true) = crate::apkmirror::validate_apk_file(&p) {
                                stock_apk = p.to_string_lossy().to_string();
                                if installed_version == "Unknown" {
                                    let mut clean = name.replace(".apk", "");
                                    if let Some(pos) = clean.rfind('-') {
                                        clean = clean[pos + 1..].to_string();
                                    }
                                    if clean.chars().any(|c| c.is_ascii_digit()) {
                                        installed_version = clean;
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
                if stock_apk != "Not found" {
                    break;
                }
            }
        }
    }

    Json(json!({
        "package_name": pkg,
        "installed_version": installed_version,
        "stock_apk_path": stock_apk
    }))
}

pub(crate) async fn get_youtube_info() -> impl IntoResponse {
    get_app_info(axum::extract::Query(AppQuery {
        pkg: Some("com.google.android.youtube".to_string()),
    }))
    .await
}

pub(crate) async fn install_jre(State(state): State<AppState>) -> impl IntoResponse {
    let state_clone = state.clone();
    tokio::spawn(async move {
        let selection = read_storage_selection(&state_clone).await;
        let workspace = selection
            .as_ref()
            .and_then(|value| value.get("workspacePath"))
            .and_then(Value::as_str)
            .map(PathBuf::from);
        let _ = crate::jre::ensure_jre_installed(&state_clone, None, workspace.as_deref()).await;
    });

    (
        StatusCode::ACCEPTED,
        Json(json!({ "message": "JRE installation started" })),
    )
}

pub(crate) async fn start_patch(
    State(state): State<AppState>,
    Json(payload): Json<PatchRequest>,
) -> impl IntoResponse {
    if state.is_patching() {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": "A patching job is already currently running." })),
        );
    }

    let plan_id = match payload.download_plan_id.as_deref() {
        Some(value) if !value.is_empty() => value,
        _ => {
            return (
                StatusCode::PRECONDITION_REQUIRED,
                Json(json!({"error":"Download preflight is required"})),
            )
        }
    };
    let plan = state.download_plans.write().await.remove(plan_id);
    let plan = match plan {
        Some(value) => value,
        None => {
            return (
                StatusCode::PRECONDITION_FAILED,
                Json(json!({"error":"Download plan is missing or already used"})),
            )
        }
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let valid = plan
        .get("expiresAt")
        .and_then(Value::as_u64)
        .is_some_and(|expires| expires >= now)
        && plan.get("packageName").and_then(Value::as_str) == Some(payload.package_name.as_str())
        && plan.get("targetVersion").and_then(Value::as_str)
            == Some(payload.target_version.as_str())
        && plan.get("patchBundleUrl").and_then(Value::as_str)
            == payload.patch_bundle_url.as_deref()
        && plan.get("workspaceLocationId").and_then(Value::as_str)
            == payload.workspace_location_id.as_deref()
        && plan.get("outputLocationId").and_then(Value::as_str)
            == payload.output_location_id.as_deref();
    if !valid {
        return (
            StatusCode::PRECONDITION_FAILED,
            Json(json!({"error":"Download plan expired or no longer matches this build"})),
        );
    }

    let state_clone = state.clone();
    tokio::spawn(async move {
        execute_patch_job(state_clone, payload).await;
    });

    (
        StatusCode::OK,
        Json(json!({ "message": "Patch process initiated successfully." })),
    )
}

pub(crate) async fn stream_logs(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.log_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|item| match item {
        Ok(line) => Some(Ok(Event::default().data(line))),
        Err(_) => None,
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

pub(crate) async fn mount_apps(State(state): State<AppState>) -> impl IntoResponse {
    let app_dir = state.modpath.join("app");
    if !app_dir.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "No app directory found. Please patch an application first." })),
        );
    }

    #[cfg(unix)]
    {
        let mut mounted_count = 0;
        if let Ok(mut entries) = tokio::fs::read_dir(&app_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "apk") {
                    let file_name = p
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let pkg = resolve_pkg_from_filename(&file_name);
                    let cmd = format!(
                        "STOCKAPK=$(pm path {pkg} 2>/dev/null | grep base | cut -d: -f2 | head -n 1); \
                         if [ -n \"$STOCKAPK\" ]; then \
                             chcon u:object_r:apk_data_file:s0 \"{apk}\"; \
                             mount -o bind \"{apk}\" \"$STOCKAPK\"; \
                             am force-stop {pkg}; \
                             mkdir -p /data/adb/service.d /data/adb/post-fs-data.d; \
                             printf '#!/system/bin/sh\\nuntil [ \"$(getprop sys.boot_completed)\" = \"1\" ]; do sleep 2; done\\nS=$(pm path %s 2>/dev/null | grep base | cut -d: -f2 | head -n 1)\\nif [ -n \"$S\" ] && [ -f \"%s\" ]; then\\n  chcon u:object_r:apk_data_file:s0 \"%s\"\\n  mount -o bind \"%s\" \"$S\"\\nfi\\n' \"{pkg}\" \"{apk}\" \"{apk}\" \"{apk}\" > /data/adb/service.d/mount_{pkg}.sh; \
                             chmod 755 /data/adb/service.d/mount_{pkg}.sh; \
                             printf '#!/system/bin/sh\\nS=$(pm path %s 2>/dev/null | grep base | cut -d: -f2 | head -n 1)\\nif [ -n \"$S\" ]; then\\n  umount -l \"$S\" 2>/dev/null\\nfi\\n' \"{pkg}\" > /data/adb/post-fs-data.d/umount_{pkg}.sh; \
                             chmod 755 /data/adb/post-fs-data.d/umount_{pkg}.sh; \
                             echo 'MOUNT_SUCCESS'; \
                         else \
                             echo 'STOCK_NOT_FOUND'; \
                         fi",
                        pkg = pkg,
                        apk = p.display()
                    );
                    if let Ok(out) = run_shell_command(&cmd).await {
                        if out.contains("MOUNT_SUCCESS") {
                            state.log(format!(
                                "🎉 Hot-mounted {} ({}) successfully + dual persistence scripts installed!",
                                pkg, file_name
                            ));
                            mounted_count += 1;
                        }
                    }
                }
            }
        }

        if mounted_count > 0 {
            (
                StatusCode::OK,
                Json(
                    json!({ "success": true, "message": format!("Successfully mounted {} app(s) with boot persistence!", mounted_count) }),
                ),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "error": "No patched apps could be mounted. Ensure target app is installed on device." }),
                ),
            )
        }
    }

    #[cfg(not(unix))]
    {
        state.log("ℹ️ Mount command simulated on non-Android platform.");
        (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Mount simulated (Non-Android host)" })),
        )
    }
}

pub(crate) async fn umount_apps(State(state): State<AppState>) -> impl IntoResponse {
    let _app_dir = state.modpath.join("app");
    #[cfg(unix)]
    {
        let mut unmounted_count = 0;
        if let Ok(mut entries) = tokio::fs::read_dir(&_app_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "apk") {
                    let file_name = p
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let pkg = resolve_pkg_from_filename(&file_name);
                    let cmd = format!(
                        "STOCKAPK=$(pm path {pkg} 2>/dev/null | grep base | cut -d: -f2 | head -n 1); \
                         if [ -n \"$STOCKAPK\" ]; then \
                             umount -l \"$STOCKAPK\" 2>/dev/null; \
                             am force-stop {pkg}; \
                             rm -f /data/adb/service.d/mount_{pkg}.sh /data/adb/post-fs-data.d/umount_{pkg}.sh; \
                             echo 'UMOUNT_SUCCESS'; \
                         fi",
                        pkg = pkg
                    );
                    if let Ok(out) = run_shell_command(&cmd).await {
                        if out.contains("UMOUNT_SUCCESS") {
                            state.log(format!("🧹 Unmounted {} successfully and removed boot persistence.", pkg));
                            unmounted_count += 1;
                        }
                    }
                }
            }
        }
        (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "message": format!("Berhasil melepas mount {} aplikasi.", unmounted_count)
            })),
        )
    }

    #[cfg(not(unix))]
    {
        state.log("ℹ️ Umount command simulated on non-Android platform.");
        (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Umount simulated (Non-Android host)" })),
        )
    }
}

pub(crate) async fn get_mount_status(State(state): State<AppState>) -> impl IntoResponse {
    let _app_dir = state.modpath.join("app");
    #[allow(unused_mut)]
    let mut mounted_apps: Vec<String> = Vec::new();

    #[cfg(unix)]
    {
        if let Ok(mounts) = tokio::fs::read_to_string("/proc/mounts").await {
            if let Ok(mut entries) = tokio::fs::read_dir(&_app_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let p = entry.path();
                    if p.extension().map_or(false, |ext| ext == "apk") {
                        let path_str = p.to_string_lossy();
                        if mounts.contains(path_str.as_ref()) {
                            let file_name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let pkg = resolve_pkg_from_filename(&file_name);
                            mounted_apps.push(pkg);
                        }
                    }
                }
            }
        }
    }

    let is_mounted = !mounted_apps.is_empty();
    (
        StatusCode::OK,
        Json(json!({
            "mounted": is_mounted,
            "apps": mounted_apps
        })),
    )
}

#[allow(dead_code)]
fn resolve_pkg_from_filename(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("music") || lower.contains("ytmusic") {
        "com.google.android.apps.youtube.music".to_string()
    } else if lower.contains("youtube") {
        "com.google.android.youtube".to_string()
    } else if lower.contains("reddit") {
        "com.reddit.frontpage".to_string()
    } else if lower.contains("twitter") {
        "com.twitter.android".to_string()
    } else if lower.contains("tiktok") {
        "com.zhiliaoapp.musically".to_string()
    } else if name.starts_with("com.") {
        name.trim_end_matches(".apk").to_string()
    } else {
        "com.google.android.youtube".to_string()
    }
}

pub(crate) async fn export_zip(State(state): State<AppState>) -> impl IntoResponse {
    let app_dir = state.modpath.join("app");
    let mut has_apk = false;
    if app_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(&app_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if entry.path().extension().map_or(false, |ext| ext == "apk") {
                    has_apk = true;
                    break;
                }
            }
        }
    }

    if !has_apk {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "No patched APK found in app directory. Please patch first." })),
        );
    }

    let selection = read_storage_selection(&state).await;
    let output_dir = selection
        .as_ref()
        .and_then(|value| value.get("outputPath"))
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .unwrap_or_else(|| storage_defaults(&state).1);
    if let Err(error) = ensure_writable_directory(&output_dir).await {
        return (
            StatusCode::PRECONDITION_FAILED,
            Json(json!({"error": error})),
        );
    }
    let export_path = output_dir.join("RVX-MultiApp-Flashable.zip");

    match crate::cli::run_pack(state.modpath.clone(), Some(export_path.clone())).await {
        Ok(_) => {
            state.log(format!(
                "💾 Native Rust pack complete: {}",
                export_path.display()
            ));
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "path": export_path.to_string_lossy()
                })),
            )
        }
        Err(e) => {
            state.log(format!("❌ Native Rust pack failed: {}", e));
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Pack failed: {}", e) })),
            )
        }
    }
}
