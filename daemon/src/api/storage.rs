use crate::state::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const STORAGE_CONFIG_FILE: &str = "config/storage.json";


pub(crate) fn runtime_has_root_access() -> bool {
    #[cfg(unix)]
    {
        std::process::Command::new("id")
            .arg("-u")
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .is_some_and(|uid| uid.trim() == "0")
    }
    #[cfg(not(unix))]
    {
        false
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageSelectionInput {
    workspace_id: String,
    output_id: String,
    workspace_path: Option<String>,
    output_path: Option<String>,
}

#[derive(serde::Deserialize)]
pub(crate) struct StorageBrowseQuery {
    kind: String,
    path: Option<String>,
}

pub(crate) fn storage_defaults(state: &AppState) -> (PathBuf, PathBuf) {
    let workspace = state.modpath.join("workspace");
    let android_downloads = PathBuf::from("/sdcard/Download/RVX-Patcher");
    let output = if Path::new("/sdcard/Download").exists() {
        android_downloads
    } else if let Ok(profile) = std::env::var("USERPROFILE") {
        PathBuf::from(profile).join("Downloads").join("RVX-Patcher")
    } else {
        state.modpath.join("output")
    };
    (workspace, output)
}

fn storage_config_path(state: &AppState) -> PathBuf {
    state.modpath.join(STORAGE_CONFIG_FILE)
}

pub(crate) async fn read_storage_selection(state: &AppState) -> Option<Value> {
    tokio::fs::read(storage_config_path(state))
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
}

pub(crate) fn path_available_bytes(path: &Path) -> u64 {
    fs2::available_space(path).unwrap_or(0)
}

pub(crate) async fn directory_size(path: &Path) -> Option<u64> {
    if !path.exists() {
        return None;
    }
    let mut total = 0_u64;
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let mut entries = tokio::fs::read_dir(directory).await.ok()?;
        while let Some(entry) = entries.next_entry().await.ok()? {
            let metadata = entry.metadata().await.ok()?;
            if metadata.is_dir() {
                pending.push(entry.path());
            } else {
                total = total.saturating_add(metadata.len());
            }
        }
    }
    Some(total)
}

fn safe_storage_path(state: &AppState, raw: &str, kind: &str) -> Result<PathBuf, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err(format!("{} path is empty", kind));
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(format!("{} path must be absolute", kind));
    }
    let text = path.to_string_lossy().replace('\\', "/");
    if text == "/"
        || text.starts_with("/proc/")
        || text.starts_with("/sys/")
        || text.starts_with("/dev/")
    {
        return Err(format!("{} path is not a writable storage location", kind));
    }
    let web = state.modpath.join("web");
    let webroot = state.modpath.join("webroot");
    if kind == "Workspace" && (path.starts_with(&web) || path.starts_with(&webroot)) {
        return Err("Workspace cannot be stored inside the public webroot".to_string());
    }
    Ok(path)
}

pub(crate) async fn ensure_writable_directory(path: &Path) -> Result<(), String> {
    tokio::fs::create_dir_all(path)
        .await
        .map_err(|e| format!("Cannot create {}: {}", path.display(), e))?;
    let marker = path.join(format!(".rvx-write-check-{}", std::process::id()));
    tokio::fs::write(&marker, b"ok")
        .await
        .map_err(|e| format!("{} is not writable: {}", path.display(), e))?;
    let _ = tokio::fs::remove_file(marker).await;
    Ok(())
}

fn storage_path_is_available(path: &Path) -> bool {
    if path.exists() {
        return path.is_dir()
            && std::fs::metadata(path)
                .map(|metadata| !metadata.permissions().readonly())
                .unwrap_or(false);
    }
    let mut parent = path.parent();
    while let Some(candidate) = parent {
        if candidate.exists() {
            return candidate.is_dir()
                && std::fs::metadata(candidate)
                    .map(|metadata| !metadata.permissions().readonly())
                    .unwrap_or(false);
        }
        parent = candidate.parent();
    }
    false
}

pub(crate) async fn get_storage_locations(State(state): State<AppState>) -> impl IntoResponse {
    let (default_workspace, default_output) = storage_defaults(&state);
    let selection = read_storage_selection(&state).await;
    let mut locations = vec![
        json!({
            "id": "module-workspace", "kind": "workspace", "label": "Workspace modul",
            "path": default_workspace.to_string_lossy(), "recommended": true,
            "writable": storage_path_is_available(&default_workspace),
            "availableBytes": path_available_bytes(default_workspace.parent().unwrap_or(&state.modpath))
        }),
        json!({
            "id": "downloads", "kind": "output", "label": "Folder unduhan",
            "path": default_output.to_string_lossy(), "recommended": true,
            "writable": storage_path_is_available(&default_output),
            "availableBytes": path_available_bytes(default_output.parent().unwrap_or(&state.modpath))
        }),
        json!({
            "id": "module-output", "kind": "output", "label": "Hasil di modul",
            "path": state.modpath.join("output").to_string_lossy(), "recommended": false,
            "writable": storage_path_is_available(&state.modpath.join("output")),
            "availableBytes": path_available_bytes(&state.modpath)
        }),
    ];
    if let Some(saved) = selection.as_ref() {
        for (id_key, path_key, kind, label) in [
            (
                "workspaceId",
                "workspacePath",
                "workspace",
                "Workspace tersimpan",
            ),
            ("outputId", "outputPath", "output", "Lokasi hasil tersimpan"),
        ] {
            if saved
                .get(id_key)
                .and_then(Value::as_str)
                .is_some_and(|id| id.starts_with("custom-"))
            {
                if let Some(path) = saved.get(path_key).and_then(Value::as_str) {
                    let path_buf = PathBuf::from(path);
                    locations.push(json!({
                        "id": saved.get(id_key).and_then(Value::as_str), "kind": kind, "label": label,
                        "path": path, "recommended": false, "writable": storage_path_is_available(&path_buf),
                        "availableBytes": path_available_bytes(path_buf.parent().unwrap_or(&path_buf))
                    }));
                }
            }
        }
    }
    let selection_valid = selection.as_ref().is_some_and(|saved| {
        ["workspacePath", "outputPath"].iter().all(|key| {
            saved.get(key).and_then(Value::as_str).is_some_and(|raw| {
                let path = PathBuf::from(raw);
                path.exists() && storage_path_is_available(&path)
            })
        })
    });
    Json(
        json!({ "locations": locations, "selection": selection, "requiresSelection": !selection_valid }),
    )
}

fn storage_browse_roots(state: &AppState, kind: &str) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let root = PathBuf::from(format!("{}:\\", letter as char));
            if root.is_dir() {
                roots.push(root);
            }
        }
        if kind == "workspace" {
            roots.push(state.modpath.clone());
        } else if let Ok(profile) = std::env::var("USERPROFILE") {
            roots.push(PathBuf::from(profile).join("Downloads"));
        }
    }

    #[cfg(not(windows))]
    {
        if kind == "workspace" {
            roots.push(state.modpath.clone());
            if runtime_has_root_access() {
                roots.push(PathBuf::from("/data/adb"));
            }
            roots.push(PathBuf::from("/sdcard"));
        } else {
            roots.push(PathBuf::from("/sdcard/Download"));
            roots.push(PathBuf::from("/sdcard"));
            roots.push(state.modpath.clone());
        }
    }

    roots.retain(|path| path.is_dir());
    roots.sort();
    roots.dedup();
    roots
}

fn path_within_roots(path: &Path, roots: &[PathBuf]) -> bool {
    roots.iter().any(|root| {
        std::fs::canonicalize(root)
            .map(|canonical_root| path.starts_with(canonical_root))
            .unwrap_or(false)
    })
}

fn storage_path_text(path: &Path) -> String {
    let text = path.to_string_lossy().to_string();
    #[cfg(windows)]
    {
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{}", rest);
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return rest.to_string();
        }
    }
    text
}

pub(crate) async fn browse_storage_directories(
    State(state): State<AppState>,
    Query(query): Query<StorageBrowseQuery>,
) -> Response {
    if query.kind != "workspace" && query.kind != "output" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Jenis lokasi tidak dikenal"})),
        )
            .into_response();
    }

    let roots = storage_browse_roots(&state, &query.kind);
    let root_items: Vec<Value> = roots.iter().map(|path| json!({
        "name": path.file_name().and_then(|name| name.to_str()).filter(|name| !name.is_empty()).unwrap_or_else(|| path.to_str().unwrap_or("/")),
        "path": storage_path_text(path),
        "writable": storage_path_is_available(path),
        "availableBytes": path_available_bytes(path),
    })).collect();

    let Some(raw_path) = query
        .path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    else {
        return Json(json!({
            "kind": query.kind,
            "roots": root_items,
            "current": null,
            "parent": null,
            "directories": [],
            "canSelect": false,
        }))
        .into_response();
    };

    let requested = PathBuf::from(raw_path);
    let current = match tokio::fs::canonicalize(&requested).await {
        Ok(path) if path.is_dir() => path,
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Folder tidak ditemukan"})),
            )
                .into_response()
        }
    };
    if !path_within_roots(&current, &roots) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Folder berada di luar lokasi yang diizinkan"})),
        )
            .into_response();
    }

    let mut directories = Vec::new();
    match tokio::fs::read_dir(&current).await {
        Ok(mut entries) => {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let path = entry.path();
                if entry
                    .file_type()
                    .await
                    .map(|kind| kind.is_dir())
                    .unwrap_or(false)
                {
                    directories.push(json!({
                        "name": name,
                        "path": storage_path_text(&path),
                        "writable": storage_path_is_available(&path),
                        "availableBytes": path_available_bytes(&path),
                    }));
                }
            }
        }
        Err(error) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": format!("Folder tidak dapat dibaca: {}", error)})),
            )
                .into_response()
        }
    }
    directories.sort_by(|left, right| {
        left.get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_lowercase()
            .cmp(
                &right
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_lowercase(),
            )
    });

    let parent = current
        .parent()
        .filter(|parent| path_within_roots(parent, &roots))
        .map(storage_path_text);
    Json(json!({
        "kind": query.kind,
        "roots": root_items,
        "current": storage_path_text(&current),
        "parent": parent,
        "directories": directories,
        "canSelect": storage_path_is_available(&current),
        "availableBytes": path_available_bytes(&current),
    }))
    .into_response()
}

pub(crate) async fn save_storage_selection(
    State(state): State<AppState>,
    Json(input): Json<StorageSelectionInput>,
) -> Response {
    let (default_workspace, default_output) = storage_defaults(&state);
    let workspace = match input.workspace_id.as_str() {
        "module-workspace" => default_workspace,
        "custom-workspace" => match input
            .workspace_path
            .as_deref()
            .map(|p| safe_storage_path(&state, p, "Workspace"))
        {
            Some(Ok(path)) => path,
            Some(Err(error)) => {
                return (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response()
            }
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Custom workspace path is required"})),
                )
                    .into_response()
            }
        },
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Unknown workspace location"})),
            )
                .into_response()
        }
    };
    let output = match input.output_id.as_str() {
        "downloads" => default_output,
        "module-output" => state.modpath.join("output"),
        "custom-output" => match input
            .output_path
            .as_deref()
            .map(|p| safe_storage_path(&state, p, "Output"))
        {
            Some(Ok(path)) => path,
            Some(Err(error)) => {
                return (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response()
            }
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Custom output path is required"})),
                )
                    .into_response()
            }
        },
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Unknown output location"})),
            )
                .into_response()
        }
    };
    if workspace == output {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Workspace and output must use different directories"})),
        )
            .into_response();
    }
    if let Err(error) = ensure_writable_directory(&workspace).await {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response();
    }
    if let Err(error) = ensure_writable_directory(&output).await {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response();
    }
    let value = json!({
        "workspaceId": input.workspace_id, "workspacePath": workspace.to_string_lossy(),
        "outputId": input.output_id, "outputPath": output.to_string_lossy(),
        "updatedAt": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
    });
    let config_path = storage_config_path(&state);
    if let Some(parent) = config_path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    if let Err(error) = tokio::fs::write(
        &config_path,
        serde_json::to_vec_pretty(&value).unwrap_or_default(),
    )
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": error.to_string()})),
        )
            .into_response();
    }
    (
        StatusCode::OK,
        Json(json!({
            "selection": value,
            "workspaceAvailableBytes": path_available_bytes(&workspace),
            "outputAvailableBytes": path_available_bytes(&output)
        })),
    )
        .into_response()

}
