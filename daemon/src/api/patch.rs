use super::storage::{
    ensure_writable_directory, path_available_bytes, read_storage_selection,
    runtime_has_root_access, storage_defaults,
};
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
    let java = get_java_binary_in(&state.modpath, workspace.as_deref());
    let jre_ready = match &java {
        Some(path) => {
            if crate::dependencies::last_verified("java", path) {
                true
            } else if path.exists() {
                crate::dependencies::probe_java(path).await.is_ok()
            } else {
                false
            }
        }
        None => false,
    };
    let is_patching = state.is_patching();
    let build_dir = workspace
        .as_ref()
        .map(|path| path.join("cache"))
        .unwrap_or_else(|| state.modpath.join("build_out"));
    let cli = build_dir.join("morphe-cli.jar");
    let cli_ready = if crate::dependencies::last_verified("cli", &cli) {
        true
    } else if cli.exists() {
        crate::dependencies::cli_valid(&cli).await.is_ok()
    } else {
        false
    };
    let cached_patch_bundle_url = tokio::fs::read_to_string(build_dir.join("patches.mpp.url"))
        .await
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let root_available = runtime_has_root_access();

    let fallback_path = PathBuf::from("/sdcard");
    let check_path = workspace.as_deref().unwrap_or(&fallback_path);
    let storage_available_bytes = path_available_bytes(check_path);
    let storage_available_formatted = if storage_available_bytes >= 1024 * 1024 * 1024 {
        format!(
            "{:.1} GB",
            storage_available_bytes as f64 / (1024.0 * 1024.0 * 1024.0)
        )
    } else {
        format!(
            "{:.0} MB",
            storage_available_bytes as f64 / (1024.0 * 1024.0)
        )
    };

    #[allow(unused_mut)]
    let mut microg_installed = false;
    #[allow(unused_mut)]
    let mut microg_package = String::new();
    #[allow(unused_mut)]
    let mut microg_variant = String::new();

    #[cfg(unix)]
    {
        let mg_packages = [
            ("app.revanced.android.gms", "ReVanced GmsCore"),
            ("com.mgoogle.android.gms", "Vanced MicroG / mMicroG"),
        ];
        for (pkg, name) in mg_packages {
            let cmd = format!("pm path {} 2>/dev/null", pkg);
            if let Ok(res) = crate::utils::run_shell_command(&cmd).await {
                if res.trim().starts_with("package:") {
                    microg_installed = true;
                    microg_package = pkg.to_string();
                    microg_variant = name.to_string();
                    break;
                }
            }
        }
    }

    let is_android = cfg!(target_os = "android");
    let is_standalone_app = std::env::var("RVX_STANDALONE_APP")
        .map(|v| v == "1")
        .unwrap_or(false)
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
        "jre_present": java.is_some(),
        "cli_ready": cli_ready,
        "cli_present": cli.is_file(),
        "cached_patch_bundle_url": cached_patch_bundle_url,
        "storage_selection": storage,
        "storage_available_bytes": storage_available_bytes,
        "storage_available_formatted": storage_available_formatted,
        "microg_installed": microg_installed,
        "microg_package": microg_package,
        "microg_variant": microg_variant,
        "is_android": is_android,
        "root_available": root_available,
        "root_installer_available": root_available || crate::root_install::installer_present(),
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
                        if (name.contains(app_alias)
                            || name.starts_with("21.")
                            || name.starts_with("stock"))
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
    Json(mut payload): Json<PatchRequest>,
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
    let selection = read_storage_selection(&state).await.unwrap_or(Value::Null);
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
            == payload.output_location_id.as_deref()
        && plan.get("inputApkPath").and_then(Value::as_str) == payload.input_apk_path.as_deref()
        && plan.get("workspacePath").and_then(Value::as_str)
            == selection.get("workspacePath").and_then(Value::as_str)
        && plan.get("outputPath").and_then(Value::as_str)
            == selection.get("outputPath").and_then(Value::as_str);
    if !valid {
        return (
            StatusCode::PRECONDITION_FAILED,
            Json(
                json!({"error":"Rencana resource sudah kedaluwarsa atau folder/input berubah. Periksa resource kembali sebelum memulai.", "code":"plan_changed"}),
            ),
        );
    }

    payload.prepared_workspace = plan
        .get("workspacePath")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    payload.prepared_output = plan
        .get("outputPath")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    if state
        .is_patching
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"Proses lain masih berjalan", "code":"job_running"})),
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

    let stream = futures_util::stream::once(async {
        Ok::<_, Infallible>(Event::default().data("STREAM_READY"))
    })
    .chain(stream);
    Sse::new(stream).keep_alive(KeepAlive::default())
}

pub(crate) async fn mount_apps(
    State(state): State<AppState>,
    Json(payload): Json<InstallRootRequest>,
) -> impl IntoResponse {
    let Some(path) = payload.apk_path else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Pilih satu APK hasil build yang akan dipasang"})),
        );
    };
    match crate::root_install::install(&state, &path).await {
        Ok(result) => (StatusCode::OK, Json(result)),
        Err(error) => (
            StatusCode::PRECONDITION_FAILED,
            Json(json!({"success":false,"verified":false,"error":error})),
        ),
    }
}

pub(crate) async fn umount_apps(State(state): State<AppState>) -> impl IntoResponse {
    match crate::root_install::inspect_install(&state, true).await {
        Ok(result) => (StatusCode::OK, Json(result)),
        Err(error) => (
            StatusCode::PRECONDITION_FAILED,
            Json(json!({"error":error,"success":false})),
        ),
    }
}

pub(crate) async fn get_mount_status(State(state): State<AppState>) -> impl IntoResponse {
    match crate::root_install::inspect_install(&state, false).await {
        Ok(result) => (StatusCode::OK, Json(result)),
        Err(error) => (
            StatusCode::PRECONDITION_FAILED,
            Json(json!({"error":error,"verified":false})),
        ),
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

#[derive(serde::Deserialize)]
pub(crate) struct InstallRootRequest {
    pub apk_path: Option<String>,
}

pub(crate) async fn install_root(
    state: State<AppState>,
    payload: Json<InstallRootRequest>,
) -> impl IntoResponse {
    mount_apps(state, payload).await
}
