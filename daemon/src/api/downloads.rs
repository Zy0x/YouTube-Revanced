use super::storage::{directory_size, ensure_writable_directory, path_available_bytes, read_storage_selection};
use crate::patcher::PatchRequest;
use crate::state::AppState;
use crate::utils::get_java_binary_in;
use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

async fn remote_content_length(client: &reqwest::Client, url: &str) -> Option<u64> {
    let response = client.head(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    response
        .headers()
        .get(header::CONTENT_LENGTH)?
        .to_str()
        .ok()?
        .parse()
        .ok()
}

pub(crate) async fn create_download_plan(
    State(state): State<AppState>,
    Json(request): Json<PatchRequest>,
) -> Response {
    let selection = match read_storage_selection(&state).await {
        Some(value) => value,
        None => return (StatusCode::PRECONDITION_REQUIRED, Json(json!({"error": "Pilih lokasi workspace dan hasil terlebih dahulu", "code": "storage_required"}))).into_response(),
    };
    let workspace_id = request.workspace_location_id.as_deref().unwrap_or_default();
    let output_id = request.output_location_id.as_deref().unwrap_or_default();
    let sel_storage_id = selection.get("storageId").and_then(Value::as_str);
    let sel_ws_id = selection.get("workspaceId").and_then(Value::as_str).or(sel_storage_id);
    let sel_out_id = selection.get("outputId").and_then(Value::as_str).or(sel_storage_id);
    if (!workspace_id.is_empty() && sel_ws_id != Some(workspace_id) && sel_storage_id != Some(workspace_id))
        || (!output_id.is_empty() && sel_out_id != Some(output_id) && sel_storage_id != Some(output_id))
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error": "Pilihan penyimpanan berubah", "code": "storage_changed"})),
        )
            .into_response();
    }
    let workspace = PathBuf::from(
        selection
            .get("workspacePath")
            .or_else(|| selection.get("storagePath"))
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    let output = PathBuf::from(
        selection
            .get("outputPath")
            .or_else(|| selection.get("storagePath"))
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    if ensure_writable_directory(&workspace).await.is_err()
        || ensure_writable_directory(&output).await.is_err()
    {
        return (StatusCode::PRECONDITION_FAILED, Json(json!({"error": "Lokasi penyimpanan tidak dapat ditulis", "code": "storage_unwritable"}))).into_response();
    }
    let cache = workspace.join("cache");
    let runtime = workspace.join("runtime");
    let _ = tokio::fs::create_dir_all(&cache).await;
    let bundle_url = request.patch_bundle_url.as_deref().unwrap_or_default();
    if bundle_url.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Bundle source belum tersedia"})),
        )
            .into_response();
    }
    let bundle_path = cache.join("patches.mpp");
    let bundle_marker = cache.join("patches.mpp.url");
    let cached_bundle_url = tokio::fs::read_to_string(&bundle_marker)
        .await
        .unwrap_or_default();
    let bundle_cached = bundle_path.is_file() && cached_bundle_url.trim() == bundle_url;
    let cli_path = cache.join("morphe-cli.jar");
    let cli_cached = cli_path.is_file();
    let jre_cached = get_java_binary_in(&state.modpath, Some(&workspace)).is_some();
    let app_alias = match request.package_name.as_str() {
        "com.google.android.youtube" => "YouTube",
        "com.google.android.apps.youtube.music" => "YouTubeMusic",
        "com.reddit.frontpage" => "Reddit",
        "com.twitter.android" => "Twitter",
        "com.zhiliaoapp.musically" => "TikTok",
        _ => request.package_name.split('.').last().unwrap_or("App"),
    };
    let apk_candidates = [
        cache.join(format!("{}-{}.apk", app_alias, request.target_version)),
        cache.join(format!(
            "{}-{}.apk",
            request.package_name, request.target_version
        )),
    ];
    #[allow(unused_mut)]
    let mut apk_local = apk_candidates.iter().find(|path| path.is_file()).cloned();
    #[cfg(unix)]
    if apk_local.is_none() {
        let command = format!(
            "pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n 1",
            request.package_name
        );
        if let Ok(path) = crate::utils::run_shell_command(&command).await {
            let candidate = PathBuf::from(path.trim());
            if candidate.is_file() {
                apk_local = Some(candidate);
            }
        }
    }

    let (bundle_size, cli_size, jre_size) = tokio::join!(
        async {
            if bundle_cached {
                tokio::fs::metadata(&bundle_path)
                    .await
                    .ok()
                    .map(|m| m.len())
            } else {
                remote_content_length(&state.client, bundle_url).await
            }
        },
        async {
            if cli_cached {
                tokio::fs::metadata(&cli_path).await.ok().map(|m| m.len())
            } else {
                remote_content_length(&state.client, crate::patcher::MORPHE_CLI_URL).await
            }
        },
        async {
            if jre_cached {
                None
            } else {
                remote_content_length(&state.client, crate::jre::JRE_DOWNLOAD_URL).await
            }
        },
    );
    let apk_size = match apk_local.as_ref() {
        Some(path) => tokio::fs::metadata(path).await.ok().map(|m| m.len()),
        None => None,
    };
    let jre_stored_size = directory_size(&runtime.join("jre")).await;
    let mut known_download_bytes = 0_u64;
    let mut unknown_size_count = 0_u64;
    let mut item = |id: &str,
                    label: &str,
                    state_name: &str,
                    download_size: Option<u64>,
                    stored_size: Option<u64>,
                    destination: &Path,
                    network_required: bool| {
        if network_required {
            if let Some(size) = download_size {
                known_download_bytes = known_download_bytes.saturating_add(size);
            } else {
                unknown_size_count += 1;
            }
        }
        json!({
            "id": id, "label": label, "state": state_name,
            "downloadBytes": download_size, "storedBytes": stored_size,
            "destination": destination.to_string_lossy(),
            "sizeSource": if stored_size.is_some() { "local-file" } else if download_size.is_some() { "remote-head" } else { "unavailable" }
        })
    };
    let items = vec![
        json!({"id":"metadata", "label":"Metadata kompatibilitas", "state":"ready", "downloadBytes":0, "storedBytes":0, "destination":"Memori sesi", "sizeSource":"manifest"}),
        item(
            "bundle",
            "Bundle patch",
            if bundle_cached { "cached" } else { "download" },
            if bundle_cached { Some(0) } else { bundle_size },
            if bundle_cached { bundle_size } else { None },
            &bundle_path,
            !bundle_cached,
        ),
        item(
            "cli",
            "Mesin Morphe",
            if cli_cached { "cached" } else { "download" },
            if cli_cached { Some(0) } else { cli_size },
            if cli_cached { cli_size } else { None },
            &cli_path,
            !cli_cached,
        ),
        item(
            "jre",
            "Java Runtime",
            if jre_cached { "ready" } else { "download" },
            if jre_cached { Some(0) } else { jre_size },
            jre_stored_size,
            &runtime.join("jre"),
            !jre_cached,
        ),
        item(
            "apk",
            &format!("APK {}", app_alias),
            if apk_local.is_some() {
                "cached"
            } else {
                "required"
            },
            if apk_local.is_some() { Some(0) } else { None },
            apk_size,
            apk_local.as_deref().unwrap_or(&cache),
            apk_local.is_none(),
        ),
        json!({"id":"module-copy", "label":"Salinan aktif modul", "state": if request.is_root {"generated"} else {"not-needed"}, "downloadBytes":0, "storedBytes":null, "destination":state.modpath.join("app").to_string_lossy(), "sizeSource":"generated-after-patch"}),
        json!({"id":"output", "label":"Hasil akhir", "state":"generated", "downloadBytes":0, "storedBytes":null, "destination":output.to_string_lossy(), "sizeSource":"generated-after-patch"}),
    ];
    let workspace_available = path_available_bytes(&workspace);
    if workspace_available > 0 && known_download_bytes > workspace_available {
        return (StatusCode::from_u16(507).unwrap(), Json(json!({
            "error":"Ruang workspace tidak cukup untuk ukuran unduhan yang sudah diketahui",
            "requiredBytes":known_download_bytes, "availableBytes":workspace_available, "code":"insufficient_storage"
        }))).into_response();
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let plan_id = format!("{:x}{:x}", now.as_nanos(), std::process::id());
    let expires_at = now.as_secs() + 600;
    let record = json!({
        "planId": plan_id, "expiresAt": expires_at,
        "packageName": request.package_name, "targetVersion": request.target_version,
        "patchBundleUrl": request.patch_bundle_url,
        "workspaceLocationId": workspace_id, "outputLocationId": output_id,
    });
    let mut plans = state.download_plans.write().await;
    plans.retain(|_, value| {
        value
            .get("expiresAt")
            .and_then(Value::as_u64)
            .is_some_and(|expires| expires >= now.as_secs())
    });
    plans.insert(plan_id.clone(), record);
    drop(plans);
    (StatusCode::OK, Json(json!({
        "planId": plan_id, "expiresAt": expires_at, "items": items,
        "knownDownloadBytes": known_download_bytes, "unknownSizeCount": unknown_size_count,
        "workspace": {"id": workspace_id, "path": workspace.to_string_lossy(), "availableBytes": workspace_available},
        "output": {"id": output_id, "path": output.to_string_lossy(), "availableBytes": path_available_bytes(&output)},
        "storage": {"id": sel_storage_id.unwrap_or(workspace_id), "path": workspace.to_string_lossy(), "availableBytes": workspace_available}
    }))).into_response()
}

