use std::path::PathBuf;
use axum::{
    body::Body,
    http::{header, HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../web/"]
pub struct WebAssets;

fn find_file_on_disk(rel_path: &str) -> Option<PathBuf> {
    let clean = rel_path.trim_start_matches('/').trim_start_matches('\\');

    let mut candidate_dirs: Vec<PathBuf> = Vec::new();

    // 1. Check MODPATH first (always points to module root on Android / local repo on PC)
    if let Ok(modpath_env) = std::env::var("MODPATH") {
        let mp = PathBuf::from(modpath_env);
        candidate_dirs.push(mp.join("web"));
        candidate_dirs.push(mp.join("webroot"));
        candidate_dirs.push(mp);
    }

    // 2. Direct candidates relative to CWD and standard directories
    candidate_dirs.push(PathBuf::from("web"));
    candidate_dirs.push(PathBuf::from("webroot"));
    candidate_dirs.push(PathBuf::from("..").join("web"));
    candidate_dirs.push(PathBuf::from("."));

    // 3. Check relative to current executable directory
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidate_dirs.push(parent.join("web"));
            candidate_dirs.push(parent.join("webroot"));
            candidate_dirs.push(parent.join("..").join("web"));
            candidate_dirs.push(parent.join("../..").join("web"));
            candidate_dirs.push(parent.join("../../..").join("web"));
        }
    }

    for dir in candidate_dirs {
        let file_path = dir.join(clean);
        if file_path.is_file() {
            return Some(file_path);
        }
    }

    None
}

pub async fn static_handler(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();

    if path.is_empty() {
        path = "index.html".to_string();
    }

    // 1. Check disk first for instant live updates without recompilation
    if let Some(disk_path) = find_file_on_disk(&path) {
        if let Ok(bytes) = tokio::fs::read(&disk_path).await {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            return Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref())
                        .unwrap_or(HeaderValue::from_static("application/octet-stream")),
                )
                .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate, max-age=0")
                .header(header::PRAGMA, "no-cache")
                .header(header::EXPIRES, "0")
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    }

    // 2. Fallback to embedded WebAssets if not found on disk
    match WebAssets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref())
                        .unwrap_or(HeaderValue::from_static("application/octet-stream")),
                )
                .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate, max-age=0")
                .header(header::PRAGMA, "no-cache")
                .header(header::EXPIRES, "0")
                .body(Body::from(content.data))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        None => {
            if path.contains('.') {
                return StatusCode::NOT_FOUND.into_response();
            }
            // SPA fallback: return index.html for extensionless routes
            if let Some(index_disk) = find_file_on_disk("index.html") {
                if let Ok(bytes) = tokio::fs::read(&index_disk).await {
                    return Response::builder()
                        .status(StatusCode::OK)
                        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                        .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate, max-age=0")
                        .header(header::PRAGMA, "no-cache")
                        .header(header::EXPIRES, "0")
                        .body(Body::from(bytes))
                        .unwrap_or_else(|_| StatusCode::NOT_FOUND.into_response());
                }
            }

            if let Some(content) = WebAssets::get("index.html") {
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                    .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate, max-age=0")
                    .header(header::PRAGMA, "no-cache")
                    .header(header::EXPIRES, "0")
                    .body(Body::from(content.data))
                    .unwrap_or_else(|_| StatusCode::NOT_FOUND.into_response())
            } else {
                StatusCode::NOT_FOUND.into_response()
            }
        }
    }
}
