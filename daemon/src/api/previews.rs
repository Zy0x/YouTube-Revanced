use super::sources::valid_android_package;
use super::storage::read_storage_selection;
use crate::state::AppState;
use axum::{
    extract::{Multipart, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

fn safe_upload_path(raw: &str, fallback: &str) -> std::path::PathBuf {
    let mut clean = std::path::PathBuf::new();
    for component in std::path::Path::new(raw).components() {
        if let std::path::Component::Normal(part) = component {
            let value = part.to_string_lossy();
            let sanitized: String = value
                .chars()
                .map(|ch| {
                    if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
                        '_'
                    } else {
                        ch
                    }
                })
                .collect();
            if !sanitized.is_empty() {
                clean.push(sanitized);
            }
        }
    }
    if clean.as_os_str().is_empty() {
        clean.push(fallback);
    }
    clean
}

#[derive(serde::Deserialize)]
pub(crate) struct OptionPreviewQuery {
    source: String,
    tag: String,
    package: String,
    patch: String,
    refresh: Option<bool>,
}

fn repository_for_source(source: &str) -> Option<String> {
    if source.split('/').count() == 2
        && source
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '-' | '_' | '.'))
    {
        return Some(source.to_string());
    }
    let config: Value =
        serde_json::from_str(include_str!("../../../web/config/sources.json")).ok()?;
    config
        .as_array()?
        .iter()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some(source))?
        .get("repository")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn raw_github_url(repository: &str, commit: &str, path: &str) -> Option<String> {
    let mut url = reqwest::Url::parse("https://raw.githubusercontent.com").ok()?;
    let mut segments = url.path_segments_mut().ok()?;
    for part in repository
        .split('/')
        .chain(std::iter::once(commit))
        .chain(path.split('/'))
    {
        segments.push(part);
    }
    drop(segments);
    Some(url.to_string())
}

pub(crate) async fn get_option_previews(
    State(state): State<AppState>,
    Query(query): Query<OptionPreviewQuery>,
) -> Response {
    if !valid_android_package(query.package.trim())
        || query.tag.is_empty()
        || query.tag.len() > 160
        || !query
            .tag
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | '/'))
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Invalid preview request"})),
        )
            .into_response();
    }
    let repository = match repository_for_source(query.source.trim()) {
        Some(value) => value,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error":"Repository source tidak tersedia", "choices":[]})),
            )
                .into_response()
        }
    };
    let patch_name = query.patch.to_ascii_lowercase();
    let (option_key, base_path, suffix, media_type) = if patch_name
        .contains("shorts action buttons")
    {
        (
            "iconType",
            "patches/src/main/resources/youtube/shorts/actionbuttons",
            "drawable-hdpi/ic_right_like_off_shadowed.webp",
            "image/webp",
        )
    } else if patch_name.contains("visual preferences icons") {
        (
            "settingsMenuIcon",
            "patches/src/main/resources/youtube/visual/icons",
            "drawable/revanced_settings_key_icon.xml",
            "android-vector",
        )
    } else if patch_name.contains("app icon") || patch_name.contains("branding") {
        (
            "appIcon",
            "patches/src/main/resources/youtube/branding",
            "launcher/mipmap-xxxhdpi/adaptiveproduct_youtube_foreground_color_108.png",
            "image/png",
        )
    } else {
        return Json(json!({"source":query.source, "repository":repository, "tag":query.tag, "sourceCommit":null, "choices":[]})).into_response();
    };
    let key = format!("{}@{}:{}", repository, query.tag, option_key);
    if !query.refresh.unwrap_or(false) {
        if let Some(cached) = state.preview_trees.read().await.get(&key).cloned() {
            return Json(cached).into_response();
        }
    }
    let mut contents_url = reqwest::Url::parse("https://api.github.com").unwrap();
    {
        let mut segments = contents_url.path_segments_mut().unwrap();
        segments.push("repos");
        for part in repository.split('/') {
            segments.push(part);
        }
        segments.push("contents");
        for part in base_path.split('/') {
            segments.push(part);
        }
    }
    contents_url
        .query_pairs_mut()
        .append_pair("ref", &query.tag);
    let directories = match state.client.get(contents_url).header("Accept", "application/vnd.github+json").send().await {
        Ok(response) if response.status().is_success() => response.json::<Value>().await.unwrap_or(Value::Array(vec![])),
        Ok(response) => return (StatusCode::BAD_GATEWAY, Json(json!({"error":format!("GitHub contents returned {}", response.status()), "choices":[]}))).into_response(),
        Err(error) => return (StatusCode::BAD_GATEWAY, Json(json!({"error":error.to_string(), "choices":[]}))).into_response(),
    };
    let mut commit_url = reqwest::Url::parse("https://api.github.com").unwrap();
    {
        let mut segments = commit_url.path_segments_mut().unwrap();
        segments.push("repos");
        for part in repository.split('/') {
            segments.push(part);
        }
        segments.push("commits");
        segments.push(&query.tag);
    }
    let commit = state
        .client
        .get(commit_url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()
        .and_then(|response| {
            if response.status().is_success() {
                Some(response)
            } else {
                None
            }
        });
    let commit = match commit {
        Some(response) => response
            .json::<Value>()
            .await
            .ok()
            .and_then(|value| value.get("sha").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| query.tag.clone()),
        None => query.tag.clone(),
    };
    let candidates = directories
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            if entry.get("type").and_then(Value::as_str) != Some("dir") {
                return None;
            }
            let value = entry.get("name").and_then(Value::as_str)?.to_string();
            let path = format!("{}/{}/{}", base_path, value, suffix);
            let url = raw_github_url(&repository, &commit, &path)?;
            Some((value, path, url))
        })
        .collect::<Vec<_>>();
    let checks = candidates.into_iter().map(|(value, path, url)| {
        let client = state.client.clone();
        let commit = commit.clone();
        async move {
            let exists = client
                .head(&url)
                .send()
                .await
                .ok()
                .is_some_and(|response| response.status().is_success());
            exists.then(|| json!({
                "optionKey": option_key, "value": value, "status": "verified", "assetPath": path,
                "mediaType": media_type, "sourceCommit": commit, "url": url
            }))
        }
    });
    let mut choices = futures_util::future::join_all(checks)
        .await
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    choices.sort_by(|left, right| {
        left.get("value")
            .and_then(Value::as_str)
            .cmp(&right.get("value").and_then(Value::as_str))
    });
    let result = json!({"source":query.source, "repository":repository, "tag":query.tag, "sourceCommit":commit, "choices":choices});
    state
        .preview_trees
        .write()
        .await
        .insert(key, result.clone());
    Json(result).into_response()
}

#[cfg(unix)]
use crate::utils::run_shell_command;



pub(crate) async fn upload_option_assets(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    const MAX_TOTAL: usize = 64 * 1024 * 1024;
    let upload_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "current".to_string());
    let workspace = read_storage_selection(&state).await.and_then(|value| {
        value
            .get("workspacePath")
            .and_then(Value::as_str)
            .map(PathBuf::from)
    });
    let workspace = match workspace {
        Some(path) => path,
        None => {
            return (
                StatusCode::PRECONDITION_REQUIRED,
                Json(json!({ "error": "Pilih lokasi workspace sebelum mengunggah aset" })),
            )
        }
    };
    let upload_root = workspace.join("uploads").join(upload_id);
    let mut mode = "file".to_string();
    let mut paths: Vec<String> = Vec::new();
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut total_bytes = 0_usize;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "mode" {
            mode = field.text().await.unwrap_or_else(|_| "file".to_string());
            continue;
        }
        if name == "relativePaths" {
            let raw = field.text().await.unwrap_or_default();
            paths = serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default();
            continue;
        }
        if name != "files" {
            continue;
        }
        let fallback = field.file_name().unwrap_or("asset.bin").to_string();
        match field.bytes().await {
            Ok(bytes) => {
                total_bytes = total_bytes.saturating_add(bytes.len());
                if total_bytes > MAX_TOTAL {
                    return (
                        StatusCode::PAYLOAD_TOO_LARGE,
                        Json(json!({ "error": "Total aset konfigurasi melebihi 64 MB" })),
                    );
                }
                files.push((fallback, bytes.to_vec()));
            }
            Err(error) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("Gagal membaca aset: {}", error) })),
                );
            }
        }
    }

    if files.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Tidak ada berkas yang dipilih" })),
        );
    }
    if let Err(error) = tokio::fs::create_dir_all(&upload_root).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error.to_string() })),
        );
    }

    let mut saved: Vec<PathBuf> = Vec::new();
    for (index, (fallback, bytes)) in files.into_iter().enumerate() {
        let raw_path = paths.get(index).map(String::as_str).unwrap_or(&fallback);
        let relative = safe_upload_path(raw_path, &fallback);
        let target = upload_root.join(relative);
        if let Some(parent) = target.parent() {
            if let Err(error) = tokio::fs::create_dir_all(parent).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": error.to_string() })),
                );
            }
        }
        if let Err(error) = tokio::fs::write(&target, bytes).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": error.to_string() })),
            );
        }
        saved.push(target);
    }

    let resolved = if mode == "folder" {
        upload_root
    } else {
        saved.first().cloned().unwrap_or(upload_root)
    };
    (
        StatusCode::OK,
        Json(json!({
            "path": resolved.to_string_lossy(),
            "file_count": saved.len(),
            "total_bytes": total_bytes
        })),
    )
}





