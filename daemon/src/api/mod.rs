mod downloads;
mod patch;
mod previews;
mod releases;
mod sources;
pub(crate) mod storage;

use crate::state::AppState;
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post, put},
    Router,
};
use serde_json::json;

use downloads::create_download_plan;
use patch::{
    export_zip, get_app_info, get_mount_status, get_status, get_youtube_info, install_jre,
    mount_apps, start_patch, stream_logs, umount_apps,
};
use previews::{get_option_previews, upload_option_assets};
use releases::get_source_releases;
use sources::{
    get_app_icon, get_app_versions, get_source_catalog, get_source_catalog_apps,
    get_source_catalog_patches,
};
use storage::{browse_storage_directories, get_storage_locations, save_storage_selection};

pub fn router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/storage/locations", get(get_storage_locations))
        .route("/storage/browse", get(browse_storage_directories))
        .route("/storage/selection", put(save_storage_selection))
        .route("/downloads/plan", post(create_download_plan))
        .route("/setup/install-jre", post(install_jre))
        .route(
            "/assets/upload",
            post(upload_option_assets).layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route("/patch/start", post(start_patch))
        .route("/patch/stream", get(stream_logs))
        .route("/patch/mount", post(mount_apps))
        .route("/patch/umount", post(umount_apps))
        .route("/patch/mount-status", get(get_mount_status))
        .route("/patch/export-zip", post(export_zip))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            require_daemon_token,
        ));
    Router::new()
        .route("/system/status", get(get_status))
        .route("/session/bootstrap", get(bootstrap_session))
        .route("/system/app-info", get(get_app_info))
        .route("/system/youtube-info", get(get_youtube_info))
        .route("/apps/icon", get(get_app_icon))
        .route("/apps/versions", get(get_app_versions))
        .route("/sources/catalog", get(get_source_catalog))
        .route("/sources/catalog/apps", get(get_source_catalog_apps))
        .route("/sources/catalog/patches", get(get_source_catalog_patches))
        .route("/sources/releases", get(get_source_releases))
        .route("/sources/option-previews", get(get_option_previews))
        .merge(protected)
        .with_state(state)
}

async fn require_daemon_token(
    State(state): State<AppState>,
    request: axum::http::Request<Body>,
    next: Next,
) -> Response {
    let provided = request
        .headers()
        .get("x-rvx-token")
        .and_then(|value| value.to_str().ok());
    if provided != Some(state.token.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(
                json!({"error":"Sesi perangkat lokal diperlukan", "code":"local_session_required"}),
            ),
        )
            .into_response();
    }
    next.run(request).await
}

fn request_is_same_origin(headers: &HeaderMap) -> bool {
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    origin.is_none()
        || origin.is_some_and(|value| {
            reqwest::Url::parse(value)
                .ok()
                .and_then(|url| {
                    url.host_str().map(|name| {
                        let origin_host = url
                            .port()
                            .map(|port| format!("{}:{}", name, port))
                            .unwrap_or_else(|| name.to_string());
                        origin_host.eq_ignore_ascii_case(host)
                    })
                })
                .unwrap_or(false)
        })
}

fn request_origin<'a>(headers: &'a HeaderMap) -> Option<&'a str> {
    headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
}

async fn bootstrap_session(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !request_is_same_origin(&headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"Buka WebUI lokal untuk mengakses perangkat ini", "code":"local_ui_required"})),
        )
            .into_response();
    }
    Json(json!({"token":state.token, "paired":true, "automatic":true, "scope":"same-origin-root-webui"}))
        .into_response()
}


