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
        .route("/system/youtube-info", get(get_youtube_info))
        .route("/setup/install-jre", post(install_jre))
        .route("/patch/start", post(start_patch))
        .route("/patch/stream", get(stream_logs))
        .route("/patch/mount", post(mount_youtube))
        .route("/patch/export-zip", post(export_zip))
        .with_state(state)
}

async fn get_status(State(state): State<AppState>) -> impl IntoResponse {
    let jre_ready = get_java_binary(&state.modpath).is_some();
    let is_patching = state.is_patching();

    Json(json!({
        "status": "online",
        "daemon_version": "2.1.4",
        "is_patching": is_patching,
        "jre_ready": jre_ready,
        "is_android": cfg!(target_os = "android") || cfg!(target_family = "unix"),
        "modpath": state.modpath.to_string_lossy()
    }))
}

async fn get_youtube_info() -> impl IntoResponse {
    #[allow(unused_mut)]
    let mut installed_version = "Unknown".to_string();
    #[allow(unused_mut)]
    let mut stock_apk = "Not found".to_string();

    #[cfg(unix)]
    {
        if let Ok(ver) = run_shell_command("dumpsys package com.google.android.youtube 2>/dev/null | grep versionName | cut -d= -f2 | head -n 1").await {
            let v = ver.trim();
            if !v.is_empty() {
                installed_version = v.to_string();
            }
        }
        if let Ok(path) = run_shell_command("pm path com.google.android.youtube 2>/dev/null | grep base | cut -d: -f2 | head -n 1").await {
            let p = path.trim();
            if !p.is_empty() {
                stock_apk = p.to_string();
            }
        }
    }

    Json(json!({
        "installed_version": installed_version,
        "stock_apk_path": stock_apk
    }))
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

async fn mount_youtube(State(state): State<AppState>) -> impl IntoResponse {
    let patched_apk = state.modpath.join("app").join("YouTubeRevanced.apk");

    if !patched_apk.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Patched APK not found in module directory. Please patch first." })),
        );
    }

    #[cfg(unix)]
    {
        let cmd = format!(
            "STOCKAPK=$(pm path com.google.android.youtube 2>/dev/null | grep base | cut -d: -f2 | head -n 1); \
             if [ -n \"$STOCKAPK\" ]; then \
                 chcon u:object_r:apk_data_file:s0 \"{}\"; \
                 mount -o bind \"{}\" \"$STOCKAPK\"; \
                 am force-stop com.google.android.youtube; \
                 am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity; \
                 echo 'MOUNT_SUCCESS'; \
             else \
                 echo 'STOCK_NOT_FOUND'; \
             fi",
            patched_apk.display(),
            patched_apk.display()
        );

        match run_shell_command(&cmd).await {
            Ok(out) if out.contains("MOUNT_SUCCESS") => {
                state.log("🎉 Successfully hot-mounted YouTube RVX without rebooting!");
                (
                    StatusCode::OK,
                    Json(json!({ "success": true, "message": "YouTube RVX hot-mounted and restarted successfully!" })),
                )
            }
            Ok(out) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Mount script output: {}", out) })),
            ),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Failed to run mount command: {}", e) })),
            ),
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

async fn export_zip(State(state): State<AppState>) -> impl IntoResponse {
    let patched_apk = state.modpath.join("app").join("YouTubeRevanced.apk");
    if !patched_apk.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Patched APK not found. Please patch first." })),
        );
    }

    let download_dir = Path::new("/sdcard/Download");
    let export_path = if download_dir.exists() {
        download_dir.join("YouTube-RVX-Flashable.zip")
    } else {
        state.modpath.join("YouTube-RVX-Flashable.zip")
    };

    #[cfg(unix)]
    {
        let cmd = format!(
            "cd \"{}\" && zip -r9 \"{}\" module.prop service.sh action.sh customize.sh app META-INF >/dev/null 2>&1",
            state.modpath.display(),
            export_path.display()
        );
        let _ = run_shell_command(&cmd).await;
    }

    state.log(format!("💾 Exported flashable module ZIP to: {}", export_path.display()));
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "path": export_path.to_string_lossy()
        })),
    )
}
