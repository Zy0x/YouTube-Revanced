use std::convert::Infallible;
use std::path::Path;
use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json,
    },
    routing::{get, post},
    Router,
};
use futures_util::stream::Stream;
use serde_json::json;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use crate::patcher::{execute_patch_job, PatchRequest};
use crate::state::AppState;
use crate::utils::get_java_binary;

#[cfg(unix)]
use crate::utils::run_shell_command;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/system/status", get(get_status))
        .route("/system/app-info", get(get_app_info))
        .route("/system/youtube-info", get(get_youtube_info))
        .route("/setup/install-jre", post(install_jre))
        .route("/patch/start", post(start_patch))
        .route("/patch/stream", get(stream_logs))
        .route("/patch/mount", post(mount_apps))
        .route("/patch/export-zip", post(export_zip))
        .with_state(state)
}

#[derive(serde::Deserialize)]
struct AppQuery {
    pkg: Option<String>,
}

async fn get_status(State(state): State<AppState>) -> impl IntoResponse {
    let jre_ready = get_java_binary(&state.modpath).is_some();
    let is_patching = state.is_patching();

    Json(json!({
        "status": "online",
        "daemon_version": env!("CARGO_PKG_VERSION"),
        "is_patching": is_patching,
        "jre_ready": jre_ready,
        "is_android": cfg!(target_os = "android") || cfg!(target_family = "unix"),
        "modpath": state.modpath.to_string_lossy()
    }))
}

async fn get_app_info(axum::extract::Query(query): axum::extract::Query<AppQuery>) -> impl IntoResponse {
    let pkg = query.pkg.unwrap_or_else(|| "com.google.android.youtube".to_string());
    #[allow(unused_mut)]
    let mut installed_version = "Unknown".to_string();
    #[allow(unused_mut)]
    let mut stock_apk = "Not found".to_string();

    #[cfg(unix)]
    {
        let ver_cmd = format!("dumpsys package {} 2>/dev/null | grep versionName | cut -d= -f2 | head -n 1", pkg);
        if let Ok(ver) = run_shell_command(&ver_cmd).await {
            let v = ver.trim();
            if !v.is_empty() {
                installed_version = v.to_string();
            }
        }
        let path_cmd = format!("pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n 1", pkg);
        if let Ok(path) = run_shell_command(&path_cmd).await {
            let p = path.trim();
            if !p.is_empty() {
                stock_apk = p.to_string();
            }
        }
    }

    Json(json!({
        "package_name": pkg,
        "installed_version": installed_version,
        "stock_apk_path": stock_apk
    }))
}

async fn get_youtube_info() -> impl IntoResponse {
    get_app_info(axum::extract::Query(AppQuery { pkg: Some("com.google.android.youtube".to_string()) })).await
}

async fn install_jre(State(state): State<AppState>) -> impl IntoResponse {
    let state_clone = state.clone();
    tokio::spawn(async move {
        let _ = crate::jre::ensure_jre_installed(&state_clone, None).await;
    });

    (StatusCode::ACCEPTED, Json(json!({ "message": "JRE installation started" })))
}

async fn start_patch(
    State(state): State<AppState>,
    Json(payload): Json<PatchRequest>,
) -> impl IntoResponse {
    if state.is_patching() {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": "A patching job is already currently running." })),
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

async fn stream_logs(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.log_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|item| match item {
        Ok(line) => Some(Ok(Event::default().data(line))),
        Err(_) => None,
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn mount_apps(State(state): State<AppState>) -> impl IntoResponse {
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
                    let file_name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let pkg = resolve_pkg_from_filename(&file_name);
                    let cmd = format!(
                        "STOCKAPK=$(pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n 1); \
                         if [ -n \"$STOCKAPK\" ]; then \
                             chcon u:object_r:apk_data_file:s0 \"{}\"; \
                             mount -o bind \"{}\" \"$STOCKAPK\"; \
                             am force-stop {}; \
                             echo 'MOUNT_SUCCESS'; \
                         else \
                             echo 'STOCK_NOT_FOUND'; \
                         fi",
                        pkg,
                        p.display(),
                        p.display(),
                        pkg
                    );
                    if let Ok(out) = run_shell_command(&cmd).await {
                        if out.contains("MOUNT_SUCCESS") {
                            state.log(format!("🎉 Hot-mounted {} ({}) successfully!", pkg, file_name));
                            mounted_count += 1;
                        }
                    }
                }
            }
        }

        if mounted_count > 0 {
            (
                StatusCode::OK,
                Json(json!({ "success": true, "message": format!("Successfully mounted {} app(s)!", mounted_count) })),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "No patched apps could be mounted. Ensure target app is installed on device." })),
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

async fn export_zip(State(state): State<AppState>) -> impl IntoResponse {
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

    let download_dir = Path::new("/sdcard/Download");
    let export_path = if download_dir.exists() {
        download_dir.join("RVX-MultiApp-Flashable.zip")
    } else {
        state.modpath.join("RVX-MultiApp-Flashable.zip")
    };

    match crate::cli::run_pack(state.modpath.clone(), Some(export_path.clone())).await {
        Ok(_) => {
            state.log(format!("💾 Native Rust pack complete: {}", export_path.display()));
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
