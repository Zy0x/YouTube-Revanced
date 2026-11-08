use crate::state::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde_json::{json, Value};
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
#[allow(dead_code)]
pub(crate) struct StorageSelectionInput {
    workspace_id: Option<String>,
    output_id: Option<String>,
    workspace_path: Option<String>,
    output_path: Option<String>,
    storage_id: Option<String>,
    storage_path: Option<String>,
}

#[derive(serde::Deserialize)]
pub(crate) struct StorageBrowseQuery {
    kind: String,
    path: Option<String>,
}

pub(crate) fn storage_defaults(state: &AppState) -> (PathBuf, PathBuf) {
    // A non-root Android wrapper can build inside its own sandbox without
    // requesting broad access to shared storage at startup.
    if std::env::var("RVX_STANDALONE_APP").as_deref() == Ok("1") && !runtime_has_root_access() {
        let private = state.modpath.join("storage");
        return (private.clone(), private);
    }
    let rvx_dir = PathBuf::from("/sdcard/RVX-Patcher");
    let xisr_dir = PathBuf::from("/sdcard/Revancify-Xisr");
    let dl_dir = PathBuf::from("/sdcard/Download/RVX-Patcher");

    let unified = if rvx_dir.exists() {
        rvx_dir
    } else if xisr_dir.exists() {
        xisr_dir
    } else if Path::new("/sdcard").exists() {
        rvx_dir
    } else if Path::new("/sdcard/Download").exists() {
        dl_dir
    } else if let Ok(profile) = std::env::var("USERPROFILE") {
        PathBuf::from(profile).join("Downloads").join("RVX-Patcher")
    } else {
        state.modpath.join("storage")
    };
    (unified.clone(), unified)
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
    if path
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("Alamat folder tidak boleh memuat '..'".to_string());
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
    if path.starts_with(&web) || path.starts_with(&webroot) {
        return Err("Folder kerja dan hasil tidak boleh berada di webroot publik".to_string());
    }
    Ok(path)
}

pub(crate) async fn ensure_writable_directory(path: &Path) -> Result<(), String> {
    tokio::fs::create_dir_all(path)
        .await
        .map_err(|error| format!("Tidak dapat membuat folder {}: {}", path.display(), error))?;
    let marker = path.join(format!(".rvx-write-check-{}", std::process::id()));
    tokio::fs::write(&marker, b"ok").await.map_err(|error| {
        format!(
            "Folder {} tidak dapat ditulis oleh mesin build: {}",
            path.display(),
            error
        )
    })?;
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
    let standalone = std::env::var("RVX_STANDALONE_APP").as_deref() == Ok("1");
    let selection = read_storage_selection(&state).await;
    let mut locations = vec![json!({
        "id": "rvx-unified", "kind": "storage", "label": if standalone && default_workspace.starts_with(&state.modpath) { "Folder privat aplikasi (disarankan)" } else { "Folder RVX-Patcher (disarankan)" },
        "path": default_workspace.to_string_lossy(), "recommended": true,
        "writable": storage_path_is_available(&default_workspace),
        "availableBytes": path_available_bytes(&default_workspace)
    })];
    if Path::new("/sdcard/Revancify-Xisr").exists() {
        let xisr = PathBuf::from("/sdcard/Revancify-Xisr");
        locations.push(json!({
            "id": "xisr-unified", "kind": "storage", "label": "Folder Revancify-Xisr",
            "path": xisr.to_string_lossy(), "recommended": true,
            "writable": storage_path_is_available(&xisr),
            "availableBytes": path_available_bytes(&xisr)
        }));
    }
    if Path::new("/sdcard/Download").exists() {
        let dl = PathBuf::from("/sdcard/Download/RVX-Patcher");
        locations.push(json!({
            "id": "downloads-unified", "kind": "storage", "label": "Folder Unduhan (/sdcard/Download)",
            "path": dl.to_string_lossy(), "recommended": false,
            "writable": storage_path_is_available(&dl),
            "availableBytes": path_available_bytes(&dl)
        }));
    }
    let mod_storage = state.modpath.join("storage");
    locations.push(json!({
        "id": "module-storage", "kind": "storage", "label": if standalone { "Folder privat aplikasi" } else { "Penyimpanan modul" },
        "path": mod_storage.to_string_lossy(), "recommended": false,
        "writable": storage_path_is_available(&mod_storage),
        "availableBytes": path_available_bytes(&state.modpath)
    }));

    // Backward compatible workspace and output entries
    locations.push(json!({
        "id": "module-workspace", "kind": "workspace", "label": "Workspace modul",
        "path": default_workspace.to_string_lossy(), "recommended": true,
        "writable": storage_path_is_available(&default_workspace),
        "availableBytes": path_available_bytes(&default_workspace)
    }));
    locations.push(json!({
        "id": "downloads", "kind": "output", "label": "Folder unduhan",
        "path": default_output.to_string_lossy(), "recommended": true,
        "writable": storage_path_is_available(&default_output),
        "availableBytes": path_available_bytes(&default_output)
    }));
    locations.push(json!({
        "id": "module-output", "kind": "output", "label": "Hasil di modul",
        "path": state.modpath.join("output").to_string_lossy(), "recommended": false,
        "writable": storage_path_is_available(&state.modpath.join("output")),
        "availableBytes": path_available_bytes(&state.modpath)
    }));

    if let Some(saved) = selection.as_ref() {
        if let Some(path) = saved
            .get("storagePath")
            .or_else(|| saved.get("outputPath"))
            .and_then(Value::as_str)
        {
            let path_buf = PathBuf::from(path);
            locations.push(json!({
                "id": "custom-storage", "kind": "storage", "label": "Lokasi tersimpan",
                "path": path, "recommended": false, "writable": storage_path_is_available(&path_buf),
                "availableBytes": path_available_bytes(path_buf.parent().unwrap_or(&path_buf))
            }));
        }
    }

    let selection_valid = selection.as_ref().is_some_and(|saved| {
        ["workspacePath", "outputPath"].iter().all(|key| {
            saved
                .get(*key)
                .or_else(|| saved.get("storagePath"))
                .and_then(Value::as_str)
                .is_some_and(|raw| {
                    let path = PathBuf::from(raw);
                    path.is_dir() && storage_path_is_available(&path)
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
        if kind == "workspace" || kind == "storage" {
            roots.push(state.modpath.clone());
        }
        if let Ok(profile) = std::env::var("USERPROFILE") {
            roots.push(PathBuf::from(profile).join("Downloads"));
        }
    }

    #[cfg(not(windows))]
    {
        roots.push(PathBuf::from("/sdcard"));
        roots.push(PathBuf::from("/sdcard/Download"));
        let xisr = PathBuf::from("/sdcard/Revancify-Xisr");
        if xisr.exists() {
            roots.push(xisr);
        }
        let rvx = PathBuf::from("/sdcard/RVX-Patcher");
        if rvx.exists() {
            roots.push(rvx);
        }
        roots.push(state.modpath.clone());
        if runtime_has_root_access() {
            roots.push(PathBuf::from("/data/adb"));
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
    if query.kind != "workspace" && query.kind != "output" && query.kind != "storage" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Jenis lokasi tidak dikenal"})),
        )
            .into_response();
    }

    let roots = storage_browse_roots(&state, &query.kind);
    let root_items: Vec<Value> = roots
        .iter()
        .map(|path| {
            let name = if path == Path::new("/sdcard") {
                "Penyimpanan perangkat"
            } else if path == Path::new("/sdcard/Download") {
                "Unduhan"
            } else if path == &state.modpath {
                if std::env::var("RVX_STANDALONE_APP").as_deref() == Ok("1") {
                    "Data aplikasi"
                } else {
                    "Modul RVX"
                }
            } else {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .filter(|name| !name.is_empty())
                    .unwrap_or_else(|| path.to_str().unwrap_or("/"))
            };
            json!({
                "name": name,
                "path": storage_path_text(path),
                "writable": storage_path_is_available(path),
                "availableBytes": path_available_bytes(path),
            })
        })
        .collect();

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
    let resolved = if input.storage_id.is_none()
        && (input.workspace_path.is_some() || input.output_path.is_some())
    {
        match (
            input.workspace_path.as_deref(),
            input.output_path.as_deref(),
        ) {
            (Some(workspace), Some(output)) => safe_storage_path(&state, workspace, "Workspace")
                .and_then(|workspace| {
                    safe_storage_path(&state, output, "Output").map(|output| (workspace, output))
                }),
            _ => Err("Pilih folder Workspace dan Output terlebih dahulu".to_string()),
        }
    } else {
        let unified = match input
            .storage_id
            .as_deref()
            .or(input.workspace_id.as_deref())
        {
            Some("custom-storage") => input
                .storage_path
                .as_deref()
                .ok_or_else(|| "Pilih folder penyimpanan".to_string())
                .and_then(|path| safe_storage_path(&state, path, "Storage")),
            Some("module-storage" | "module-workspace") => Ok(state.modpath.join("storage")),
            Some("xisr-unified") => Ok(PathBuf::from("/sdcard/Revancify-Xisr")),
            Some("downloads-unified" | "downloads") => {
                Ok(PathBuf::from("/sdcard/Download/RVX-Patcher"))
            }
            Some("rvx-unified") | None => Ok(default_workspace.clone()),
            Some(_) => Err("Pilihan penyimpanan tidak dikenal".to_string()),
        };
        unified.map(|path| {
            (
                path.clone(),
                if input.storage_id.is_none() {
                    default_output
                } else {
                    path
                },
            )
        })
    };
    let (workspace, output) = match resolved {
        Ok(paths) => paths,
        Err(error) => {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response()
        }
    };
    for path in [&workspace, &output] {
        if let Err(error) = ensure_writable_directory(path).await {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": error, "code": "storage_unwritable"})),
            )
                .into_response();
        }
    }
    let value = json!({
        "storageId": input.storage_id.as_deref().unwrap_or("split-storage"),
        "storagePath": workspace.to_string_lossy(),
        "workspaceId": input.workspace_id.as_deref().or(input.storage_id.as_deref()).unwrap_or("custom-workspace"),
        "workspacePath": workspace.to_string_lossy(),
        "outputId": input.output_id.as_deref().or(input.storage_id.as_deref()).unwrap_or("custom-output"),
        "outputPath": output.to_string_lossy(),
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
            "storageAvailableBytes": path_available_bytes(&workspace),
            "workspaceAvailableBytes": path_available_bytes(&workspace),
            "outputAvailableBytes": path_available_bytes(&output)
        })),
    )
        .into_response()
}

#[derive(serde::Deserialize)]
pub(crate) struct FileOpRequest {
    pub source_path: String,
    pub target_dir: String,
    pub action: String,
}

pub(crate) async fn file_operation(
    State(state): State<AppState>,
    Json(payload): Json<FileOpRequest>,
) -> impl IntoResponse {
    let src = PathBuf::from(&payload.source_path);
    if !src.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("Berkas sumber tidak ditemukan: {}", payload.source_path) })),
        )
            .into_response();
    }
    let filename = match src.file_name() {
        Some(name) => name,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Nama berkas tidak valid" })),
            )
                .into_response();
        }
    };
    let dest_dir = PathBuf::from(&payload.target_dir);
    if let Err(_) = tokio::fs::create_dir_all(&dest_dir).await {
        let _ =
            crate::utils::run_shell_command(&format!("mkdir -p \"{}\"", dest_dir.display())).await;
    }

    let dest_file = dest_dir.join(filename);
    let is_move = payload.action.trim().eq_ignore_ascii_case("move");

    let op_res = if is_move {
        state.log(format!(
            "📦 Memindahkan {} ke {}",
            src.display(),
            dest_file.display()
        ));
        match tokio::fs::rename(&src, &dest_file).await {
            Ok(_) => Ok(()),
            Err(_) => {
                let cmd = format!("mv -f \"{}\" \"{}\"", src.display(), dest_file.display());
                crate::utils::run_shell_command(&cmd).await.map(|_| ())
            }
        }
    } else {
        state.log(format!(
            "📋 Menyalin {} ke {}",
            src.display(),
            dest_file.display()
        ));
        match tokio::fs::copy(&src, &dest_file).await {
            Ok(_) => Ok(()),
            Err(_) => {
                let cmd = format!("cp -f \"{}\" \"{}\"", src.display(), dest_file.display());
                crate::utils::run_shell_command(&cmd).await.map(|_| ())
            }
        }
    };

    match op_res {
        Ok(_) => {
            state.log(format!(
                "✅ Berkas berhasil di-{}: {}",
                if is_move { "pindahkan" } else { "salin" },
                dest_file.display()
            ));
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "action": if is_move { "move" } else { "copy" },
                    "path": dest_file.to_string_lossy()
                })),
            )
                .into_response()
        }
        Err(e) => {
            state.log(format!("❌ Gagal memproses berkas: {}", e));
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": format!("Gagal memproses berkas: {}", e)
                })),
            )
                .into_response()
        }
    }
}

#[derive(serde::Deserialize)]
pub(crate) struct CleanCacheRequest {
    pub all: Option<bool>,
}

pub(crate) async fn clean_storage_cache(
    State(state): State<AppState>,
    Json(payload): Json<CleanCacheRequest>,
) -> impl IntoResponse {
    let (ws, _) = storage_defaults(&state);
    let cache_dir = ws.join("cache");
    let mut freed_bytes: u64 = 0;

    if let Ok(mut entries) = tokio::fs::read_dir(&cache_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "patches.mpp"
                || name == "patches.mpp.url"
                || name == "morphe-cli.jar"
                || name == "keystore.jks"
            {
                continue;
            }
            if let Ok(meta) = entry.metadata().await {
                let len = meta.len();
                if meta.is_dir() {
                    let dir_size = directory_size(&path).await.unwrap_or(0);
                    if tokio::fs::remove_dir_all(&path).await.is_ok() {
                        freed_bytes = freed_bytes.saturating_add(dir_size);
                    }
                } else if name.ends_with(".tmp")
                    || name.ends_with(".dex")
                    || name.contains("temp")
                    || (payload.all.unwrap_or(false)
                        && name.ends_with(".apk")
                        && !name.starts_with("stock-"))
                {
                    if tokio::fs::remove_file(&path).await.is_ok() {
                        freed_bytes = freed_bytes.saturating_add(len);
                    }
                }
            }
        }
    }

    #[cfg(unix)]
    {
        let _ = crate::utils::run_shell_command("rm -f /data/local/tmp/install_temp.apk").await;
    }

    let formatted = if freed_bytes >= 1024 * 1024 * 1024 {
        format!("{:.2} GB", freed_bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else {
        format!("{:.1} MB", freed_bytes as f64 / (1024.0 * 1024.0))
    };

    state.log(format!(
        "🧹 Pembersihan berkas sampah selesai: {} dibebaskan",
        formatted
    ));

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "freedBytes": freed_bytes,
            "freedFormatted": formatted
        })),
    )
        .into_response()
}

#[cfg(test)]
mod storage_tests {
    use super::*;

    fn test_state() -> AppState {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        AppState::new(
            std::env::temp_dir().join(format!(
                "rvx-storage-test-{}-{}",
                std::process::id(),
                unique
            )),
            String::new(),
            vec![],
        )
    }

    async fn select_paths(state: &AppState, workspace: &Path, output: &Path) -> Response {
        let input: StorageSelectionInput = serde_json::from_value(json!({
            "workspaceId": "custom-workspace", "outputId": "custom-output",
            "workspacePath": workspace.to_string_lossy(), "outputPath": output.to_string_lossy()
        }))
        .unwrap();
        save_storage_selection(State(state.clone()), Json(input)).await
    }

    #[tokio::test]
    async fn separate_workspace_and_output_are_preserved() {
        let state = test_state();
        let workspace = state.modpath.join("Workspace");
        let output = state.modpath.join("Output");
        assert_eq!(
            select_paths(&state, &workspace, &output).await.status(),
            StatusCode::OK
        );
        let saved = read_storage_selection(&state).await.unwrap();
        assert_eq!(saved["workspacePath"], workspace.to_string_lossy().as_ref());
        assert_eq!(saved["outputPath"], output.to_string_lossy().as_ref());
        assert_eq!(saved["workspaceId"], "custom-workspace");
        assert_eq!(saved["outputId"], "custom-output");
        assert!(workspace.is_dir() && output.is_dir());
        assert!(state.modpath.starts_with(std::env::temp_dir()));
        tokio::fs::remove_dir_all(&state.modpath).await.unwrap();
    }

    #[tokio::test]
    async fn invalid_output_does_not_replace_a_valid_saved_selection() {
        let state = test_state();
        let workspace = state.modpath.join("Workspace");
        let output = state.modpath.join("Output");
        assert_eq!(
            select_paths(&state, &workspace, &output).await.status(),
            StatusCode::OK
        );
        let before = read_storage_selection(&state).await;
        let invalid_output = state.modpath.join("a-file");
        tokio::fs::write(&invalid_output, b"keep").await.unwrap();
        assert_eq!(
            select_paths(&state, &workspace, &invalid_output)
                .await
                .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(read_storage_selection(&state).await, before);
        assert_eq!(tokio::fs::read(&invalid_output).await.unwrap(), b"keep");
        assert!(safe_storage_path(
            &state,
            &state.modpath.join("web").join("output").to_string_lossy(),
            "Output"
        )
        .is_err());
        assert!(state.modpath.starts_with(std::env::temp_dir()));
        tokio::fs::remove_dir_all(&state.modpath).await.unwrap();
    }
}
