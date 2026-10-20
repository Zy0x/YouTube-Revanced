use super::storage::read_storage_selection;
use super::releases::html_meta_content;
use crate::state::AppState;
use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Json, Response},
};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

#[derive(Clone)]
struct TimedJson {
    fetched_at: Instant,
    value: Value,
}

static REGISTRY_CATALOG_CACHE: OnceLock<RwLock<Option<TimedJson>>> = OnceLock::new();
static REGISTRY_APP_CATALOG_CACHE: OnceLock<RwLock<Option<TimedJson>>> = OnceLock::new();
static REGISTRY_PATCH_CACHE: OnceLock<RwLock<HashMap<String, TimedJson>>> = OnceLock::new();

fn registry_catalog_cache() -> &'static RwLock<Option<TimedJson>> {
    REGISTRY_CATALOG_CACHE.get_or_init(|| RwLock::new(None))
}

fn registry_patch_cache() -> &'static RwLock<HashMap<String, TimedJson>> {
    REGISTRY_PATCH_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn registry_app_catalog_cache() -> &'static RwLock<Option<TimedJson>> {
    REGISTRY_APP_CATALOG_CACHE.get_or_init(|| RwLock::new(None))
}

async fn fetch_registry_page(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    let response = client
        .get(url)
        .header("User-Agent", "RVX-Setup-Wizard/2.1")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Patch registry returned {}", response.status()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())
}

async fn fetch_registry_collection(
    client: &reqwest::Client,
    endpoint: &str,
    filters: &str,
) -> Result<RegistryCollection, String> {
    let base = "https://patch-bundles.api.jmancentral.com";
    let separator = if filters.is_empty() { "" } else { "&" };
    let first_url = format!("{base}{endpoint}?limit=100&offset=0{separator}{filters}");
    let first_response = client
        .get(&first_url)
        .header("User-Agent", "RVX-Setup-Wizard/2.1")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !first_response.status().is_success() {
        return Err(format!(
            "Patch registry returned {}",
            first_response.status()
        ));
    }
    let etag = first_response
        .headers()
        .get(header::ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let generation = first_response
        .headers()
        .get("x-catalog-generation")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let first = first_response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    let total = first.get("total").and_then(Value::as_u64).unwrap_or(0) as usize;
    let mut rows = first
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if rows.len() == 100 && total > 100 {
        let max_total = total.min(300);
        let requests = (100..max_total).step_by(100).map(|offset| {
            let client = client.clone();
            let url = format!("{base}{endpoint}?limit=100&offset={offset}{separator}{filters}");
            async move { fetch_registry_page(&client, &url).await }
        });
        for page in futures_util::future::join_all(requests).await {
            if let Ok(page) = page {
                if let Some(data) = page.get("data").and_then(Value::as_array) {
                    rows.extend(data.iter().cloned());
                }
            }
        }
    }
    Ok(RegistryCollection {
        rows,
        etag,
        generation,
    })
}

struct RegistryCollection {
    rows: Vec<Value>,
    etag: Option<String>,
    generation: Option<String>,
}

enum RegistryProbe {
    Unchanged,
    Current {
        etag: Option<String>,
        generation: Option<String>,
    },
}

async fn probe_registry_catalog(
    client: &reqwest::Client,
    known_etag: Option<&str>,
) -> Result<RegistryProbe, String> {
    let url = "https://patch-bundles.api.jmancentral.com/bundles?limit=1&offset=0&ecosystem=morphe&channel=latest&metadata_status=verified";
    let mut request = client.get(url).header("User-Agent", "RVX-Setup-Wizard/2.1");
    if let Some(etag) = known_etag {
        request = request.header(header::IF_NONE_MATCH, etag);
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if response.status() == StatusCode::NOT_MODIFIED {
        return Ok(RegistryProbe::Unchanged);
    }
    if !response.status().is_success() {
        return Err(format!("Patch registry returned {}", response.status()));
    }
    Ok(RegistryProbe::Current {
        etag: response
            .headers()
            .get(header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string),
        generation: response
            .headers()
            .get("x-catalog-generation")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string),
    })
}

#[derive(serde::Deserialize, Default)]
pub(crate) struct CatalogQuery {
    refresh: Option<bool>,
}

fn catalog_response(value: Value, request_headers: &HeaderMap) -> Response {
    let etag = value
        .get("catalogEtag")
        .and_then(Value::as_str)
        .map(str::to_string);
    let client_etag = request_headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok());
    if etag.as_deref().is_some() && etag.as_deref() == client_etag {
        let mut response = StatusCode::NOT_MODIFIED.into_response();
        if let Some(etag) = etag
            .as_deref()
            .and_then(|value| HeaderValue::from_str(value).ok())
        {
            response.headers_mut().insert(header::ETAG, etag);
        }
        return response;
    }

    let generation = value
        .get("catalogGeneration")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut response = Json(value).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    if let Some(etag) = etag
        .as_deref()
        .and_then(|value| HeaderValue::from_str(value).ok())
    {
        response.headers_mut().insert(header::ETAG, etag);
    }
    if let Some(generation) = generation.and_then(|value| HeaderValue::from_str(&value).ok()) {
        response
            .headers_mut()
            .insert("x-catalog-generation", generation);
    }
    response
}

pub(crate) async fn get_source_catalog(
    State(state): State<AppState>,
    Query(query): Query<CatalogQuery>,
    headers: HeaderMap,
) -> Response {
    const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
    const DISK_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
    let force_refresh = query.refresh.unwrap_or(false);
    let memory_cache = registry_catalog_cache().read().await.as_ref().cloned();
    if let Some(cached) = memory_cache.as_ref() {
        if !force_refresh && cached.fetched_at.elapsed() < CACHE_TTL {
            return catalog_response(cached.value.clone(), &headers);
        }
    }

    let cache_root = read_storage_selection(&state)
        .await
        .and_then(|value| {
            value
                .get("workspacePath")
                .and_then(Value::as_str)
                .map(PathBuf::from)
        })
        .map(|path| path.join("metadata"))
        .unwrap_or_else(|| state.modpath.join("build_out"));
    let _ = tokio::fs::create_dir_all(&cache_root).await;
    let disk_cache_path = cache_root.join("registry-catalog-cache-v2.json");
    let disk_cache_age = tokio::fs::metadata(&disk_cache_path)
        .await
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.elapsed().ok())
        .unwrap_or(Duration::MAX);
    let mut cached_value = memory_cache.map(|cached| cached.value);
    if cached_value.is_none() && (force_refresh || disk_cache_age < DISK_CACHE_TTL) {
        if let Ok(bytes) = tokio::fs::read(&disk_cache_path).await {
            if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                *registry_catalog_cache().write().await = Some(TimedJson {
                    fetched_at: Instant::now(),
                    value: value.clone(),
                });
                cached_value = Some(value);
            }
        }
    }

    if force_refresh {
        if let Some(cached) = cached_value.as_ref() {
            let known_etag = cached.get("catalogEtag").and_then(Value::as_str);
            let known_generation = cached.get("catalogGeneration").and_then(Value::as_str);
            match probe_registry_catalog(&state.client, known_etag).await {
                Ok(RegistryProbe::Unchanged) => {
                    return catalog_response(cached.clone(), &headers);
                }
                Ok(RegistryProbe::Current { etag, generation }) => {
                    let same_generation = generation.as_deref().is_some()
                        && generation.as_deref() == known_generation;
                    let same_etag = etag.as_deref().is_some() && etag.as_deref() == known_etag;
                    if same_generation || same_etag {
                        return catalog_response(cached.clone(), &headers);
                    }
                }
                Err(_) => {
                    return catalog_response(cached.clone(), &headers);
                }
            }
        }
    } else if let Some(cached) = cached_value {
        return catalog_response(cached, &headers);
    }

    let collection = match fetch_registry_collection(
        &state.client,
        "/bundles",
        "ecosystem=morphe&channel=latest&metadata_status=verified",
    )
    .await
    {
        Ok(collection) => collection,
        Err(error) => {
            if let Some(cached) = registry_catalog_cache().read().await.as_ref() {
                return catalog_response(cached.value.clone(), &headers);
            }
            return (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response();
        }
    };
    let RegistryCollection {
        rows: bundles,
        etag,
        generation,
    } = collection;
    let mut latest_by_source: HashMap<String, Value> = HashMap::new();
    let mut supported_packages: HashSet<String> = HashSet::new();
    for bundle in bundles {
        let Some(download_url) = bundle.get("download_url").and_then(Value::as_str) else {
            continue;
        };
        if !download_url.to_ascii_lowercase().ends_with(".mpp") {
            continue;
        }
        if bundle.get("patch_list_available").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let Some(source) = bundle.get("source") else {
            continue;
        };
        if source.get("enabled").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let Some(source_url) = source.get("url").and_then(Value::as_str) else {
            continue;
        };
        let source_id = source.get("id").and_then(Value::as_str).unwrap_or_default();
        if source_id.is_empty() {
            continue;
        }
        let metadata = source.get("source_metadatum").unwrap_or(&Value::Null);
        if let Some(packages) = bundle.get("packages").and_then(Value::as_array) {
            for package in packages {
                if let Some(package_name) = package.as_str() {
                    supported_packages.insert(package_name.to_string());
                }
            }
        }
        let host = source
            .get("host")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let namespace = source
            .get("namespace")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let repo = source
            .get("repo")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let repository =
            if host.eq_ignore_ascii_case("github.com") && !namespace.is_empty() && !repo.is_empty()
            {
                format!("{namespace}/{repo}")
            } else {
                String::new()
            };
        let candidate = json!({
            "id": source_id,
            "name": metadata.get("repo_name").and_then(Value::as_str).unwrap_or(repo),
            "repository": repository,
            "sourceUrl": source_url,
            "description": metadata.get("repo_description").and_then(Value::as_str).unwrap_or("Community Morphe patch source"),
            "stars": metadata.get("repo_stars").and_then(Value::as_u64).unwrap_or(0),
            "bundleId": bundle.get("id").and_then(Value::as_str).unwrap_or_default(),
            "bundleUrl": download_url,
            "version": bundle.get("version").and_then(Value::as_str).unwrap_or_default(),
            "publishedAt": bundle.get("created_at").and_then(Value::as_str).unwrap_or_default(),
            "prerelease": bundle.get("is_prerelease").and_then(Value::as_bool).unwrap_or(false),
            "patchCount": bundle.get("patch_count").and_then(Value::as_u64).unwrap_or(0),
            "packages": bundle.get("packages").and_then(Value::as_array).cloned().unwrap_or_default(),
            "iconUrl": bundle.get("icon_url").and_then(Value::as_str),
            "ownerAvatarUrl": bundle.get("owner_avatar_url").and_then(Value::as_str),
            "metadataStatus": bundle.get("metadata_status").and_then(Value::as_str).unwrap_or_default()
        });
        let should_replace = latest_by_source
            .get(source_url)
            .and_then(|current| current.get("publishedAt").and_then(Value::as_str))
            .map(|current_date| {
                candidate
                    .get("publishedAt")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    > current_date
            })
            .unwrap_or(true);
        if should_replace {
            latest_by_source.insert(source_url.to_string(), candidate);
        }
    }

    let mut sources: Vec<Value> = latest_by_source.into_values().collect();
    sources.sort_by(|a, b| {
        let stars_a = a.get("stars").and_then(Value::as_u64).unwrap_or(0);
        let stars_b = b.get("stars").and_then(Value::as_u64).unwrap_or(0);
        stars_b.cmp(&stars_a).then_with(|| {
            a.get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .cmp(b.get("name").and_then(Value::as_str).unwrap_or_default())
        })
    });
    let mut package_names: Vec<String> = supported_packages.into_iter().collect();
    package_names.sort();
    let app_rows: Vec<Value> = package_names
        .iter()
        .map(|package_name| {
            json!({
                "packageName": package_name,
                "name": package_name,
                "iconUrl": null,
                "versions": []
            })
        })
        .collect();
    let payload = json!({
        "sources": sources,
        "apps": app_rows,
        "sourceCount": sources.len(),
        "appCount": app_rows.len(),
        "provider": "Patch Bundle Registry",
        "catalogEtag": etag,
        "catalogGeneration": generation
    });
    *registry_catalog_cache().write().await = Some(TimedJson {
        fetched_at: Instant::now(),
        value: payload.clone(),
    });
    if let Ok(bytes) = serde_json::to_vec(&payload) {
        if let Some(parent) = disk_cache_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let _ = tokio::fs::write(&disk_cache_path, bytes).await;
    }
    catalog_response(payload, &headers)
}

pub(crate) async fn get_source_catalog_apps(
    State(state): State<AppState>,
    Query(query): Query<CatalogQuery>,
) -> Response {
    match load_registry_app_catalog(&state, query.refresh.unwrap_or(false)).await {
        Ok(payload) => {
            let apps = payload
                .get("apps")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|app| json!({
                    "packageName": app.get("packageName").and_then(Value::as_str).unwrap_or_default(),
                    "name": app.get("name").and_then(Value::as_str).unwrap_or_default(),
                    "iconUrl": app.get("iconUrl").cloned().unwrap_or(Value::Null),
                    "versionCount": app.get("versions").and_then(Value::as_array).map(Vec::len).unwrap_or(0)
                }))
                .collect::<Vec<_>>();
            Json(json!({ "apps": apps })).into_response()
        }
        Err(error) => (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response(),
    }
}

async fn load_registry_app_catalog(state: &AppState, force_refresh: bool) -> Result<Value, String> {
    const CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
    if let Some(cached) = registry_app_catalog_cache().read().await.as_ref() {
        if !force_refresh && cached.fetched_at.elapsed() < CACHE_TTL {
            return Ok(cached.value.clone());
        }
    }

    let cache_root = read_storage_selection(state)
        .await
        .and_then(|value| {
            value
                .get("workspacePath")
                .and_then(Value::as_str)
                .map(PathBuf::from)
        })
        .map(|path| path.join("metadata"))
        .unwrap_or_else(|| state.modpath.join("build_out"));
    let _ = tokio::fs::create_dir_all(&cache_root).await;
    let disk_cache_path = cache_root.join("registry-apps-cache.json");
    let disk_cache_is_fresh = tokio::fs::metadata(&disk_cache_path)
        .await
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.elapsed().ok())
        .map(|age| age < CACHE_TTL)
        .unwrap_or(false);
    if !force_refresh && disk_cache_is_fresh {
        if let Ok(bytes) = tokio::fs::read(&disk_cache_path).await {
            if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                *registry_app_catalog_cache().write().await = Some(TimedJson {
                    fetched_at: Instant::now(),
                    value: value.clone(),
                });
                return Ok(value);
            }
        }
    }

    let packages = match fetch_registry_collection(&state.client, "/packages", "").await {
        Ok(collection) => collection.rows,
        Err(error) => {
            if let Some(cached) = registry_app_catalog_cache().read().await.as_ref() {
                return Ok(cached.value.clone());
            }
            return Err(error);
        }
    };
    let apps: Vec<Value> = packages.into_iter().filter_map(|package| {
        let package_name = package.get("name").and_then(Value::as_str)?;
        Some(json!({
            "packageName": package_name,
            "name": package.get("app_name").and_then(Value::as_str).unwrap_or(package_name),
            "iconUrl": package.get("icon_url").and_then(Value::as_str),
            "versions": package.get("versions").and_then(Value::as_array).cloned().unwrap_or_default()
        }))
    }).collect();
    let payload = json!({ "apps": apps });

    *registry_app_catalog_cache().write().await = Some(TimedJson {
        fetched_at: Instant::now(),
        value: payload.clone(),
    });
    if let Ok(bytes) = serde_json::to_vec(&payload) {
        if let Some(parent) = disk_cache_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let _ = tokio::fs::write(&disk_cache_path, bytes).await;
    }
    Ok(payload)
}

#[derive(serde::Deserialize, Default)]
pub(crate) struct AppVersionsQuery {
    package: String,
    offset: Option<usize>,
    limit: Option<usize>,
    q: Option<String>,
    channel: Option<String>,
    refresh: Option<bool>,
}

pub(crate) fn valid_android_package(package: &str) -> bool {
    !package.is_empty()
        && package.len() <= 255
        && package.contains('.')
        && package
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_'))
}

fn version_numbers(value: &str) -> Vec<u64> {
    value
        .split(|ch: char| !ch.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

pub(crate) async fn get_app_versions(
    State(state): State<AppState>,
    Query(query): Query<AppVersionsQuery>,
) -> Response {
    let package = query.package.trim();
    if !valid_android_package(package) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid Android package name." })),
        )
            .into_response();
    }

    let payload = match load_registry_app_catalog(&state, query.refresh.unwrap_or(false)).await {
        Ok(value) => value,
        Err(error) => {
            return (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response()
        }
    };
    let mut versions: HashMap<String, Value> = HashMap::new();
    if let Some(app) = payload
        .get("apps")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|app| app.get("packageName").and_then(Value::as_str) == Some(package))
    {
        for raw in app
            .get("versions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let version = raw
                .as_str()
                .or_else(|| raw.get("version").and_then(Value::as_str))
                .or_else(|| raw.get("name").and_then(Value::as_str))
                .unwrap_or_default()
                .trim();
            if version.is_empty() {
                continue;
            }
            let title = raw.get("title").and_then(Value::as_str).unwrap_or(version);
            let is_beta = raw
                .get("isBeta")
                .and_then(Value::as_bool)
                .unwrap_or_else(|| {
                    let text = format!("{version} {title}").to_ascii_lowercase();
                    text.contains("beta") || text.contains("alpha") || text.contains("rc")
                });
            versions.insert(
                version.to_string(),
                json!({
                    "version": version,
                    "title": title,
                    "isBeta": is_beta,
                    "origin": "patch-registry"
                }),
            );
        }
    }

    if package == "com.google.android.youtube" {
        if let Ok(local) =
            serde_json::from_str::<Value>(include_str!("../../../web/config/youtube-versions.json"))
        {
            for raw in local.as_array().into_iter().flatten() {
                let version = raw
                    .get("version")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim();
                if version.is_empty() {
                    continue;
                }
                let title = raw.get("title").and_then(Value::as_str).unwrap_or(version);
                let is_beta = raw.get("isBeta").and_then(Value::as_bool).unwrap_or(false);
                versions.entry(version.to_string()).or_insert_with(|| {
                    json!({
                        "version": version,
                        "title": title,
                        "isBeta": is_beta,
                        "origin": "local-youtube-catalog"
                    })
                });
            }
        }
    }

    let query_text = query.q.unwrap_or_default().trim().to_ascii_lowercase();
    let channel = query
        .channel
        .unwrap_or_else(|| "all".to_string())
        .to_ascii_lowercase();
    let mut items = versions
        .into_values()
        .filter(|item| {
            let is_beta = item.get("isBeta").and_then(Value::as_bool).unwrap_or(false);
            let channel_matches = match channel.as_str() {
                "stable" => !is_beta,
                "beta" => is_beta,
                _ => true,
            };
            let haystack = format!(
                "{} {}",
                item.get("version")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
                item.get("title")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
            )
            .to_ascii_lowercase();
            channel_matches && (query_text.is_empty() || haystack.contains(&query_text))
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        let left_version = left
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let right_version = right
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or_default();
        version_numbers(right_version)
            .cmp(&version_numbers(left_version))
            .then_with(|| right_version.cmp(left_version))
    });

    let total = items.len();
    let offset = query.offset.unwrap_or(0).min(total);
    let limit = query.limit.unwrap_or(30).clamp(1, 30);
    let end = (offset + limit).min(total);
    let page = items[offset..end].to_vec();
    let refreshed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    Json(json!({
        "packageName": package,
        "items": page,
        "total": total,
        "nextOffset": if end < total { Some(end) } else { None },
        "refreshedAt": refreshed_at
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
pub(crate) struct CatalogPatchQuery {
    bundle: String,
}

pub(crate) async fn get_source_catalog_patches(
    State(state): State<AppState>,
    Query(query): Query<CatalogPatchQuery>,
) -> Response {
    let bundle_id = query.bundle.trim();
    if bundle_id.is_empty() || bundle_id.len() > 64 || !bundle_id.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid registry bundle ID." })),
        )
            .into_response();
    }
    const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
    if let Some(cached) = registry_patch_cache().read().await.get(bundle_id) {
        if cached.fetched_at.elapsed() < CACHE_TTL {
            return Json(cached.value.clone()).into_response();
        }
    }

    let endpoint = "/patches";
    let filter = format!("bundle={bundle_id}");
    let rows = match fetch_registry_collection(&state.client, endpoint, &filter).await {
        Ok(collection) => collection.rows,
        Err(error) => {
            return (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response()
        }
    };
    let patches: Vec<Value> = rows.into_iter().filter_map(|patch| {
        let name = patch.get("name").and_then(Value::as_str)?;
        let compatible_packages: Vec<Value> = patch
            .get("compatiblePackages")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|package| {
                let package_name = package.get("name").and_then(Value::as_str)?;
                Some(json!({
                    "packageName": package_name,
                    "name": package.get("app_name").and_then(Value::as_str).unwrap_or(package_name),
                    "versions": package.get("versions").and_then(Value::as_array).cloned().unwrap_or_default()
                }))
            })
            .collect();
        Some(json!({
            "name": name,
            "description": patch.get("description").and_then(Value::as_str).unwrap_or_default(),
            "default": patch.get("use").and_then(Value::as_bool).unwrap_or(true),
            "use": patch.get("use").and_then(Value::as_bool).unwrap_or(true),
            "hidden": patch.get("hidden").and_then(Value::as_bool).unwrap_or(false),
            "dependencies": patch.get("dependencies").and_then(Value::as_array).cloned().unwrap_or_default(),
            "options": patch.get("options").and_then(Value::as_array).cloned().unwrap_or_default(),
            "compatiblePackages": compatible_packages
        }))
    }).collect();
    let payload = json!(patches);
    registry_patch_cache().write().await.insert(
        bundle_id.to_string(),
        TimedJson {
            fetched_at: Instant::now(),
            value: payload.clone(),
        },
    );
    Json(payload).into_response()
}

pub(crate) async fn get_app_icon(
    State(state): State<AppState>,
    Query(query): Query<AppIconQuery>,
) -> Response {
    let package = query.package.trim();
    let valid_package = !package.is_empty()
        && package.len() <= 255
        && package.contains('.')
        && package
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_'));
    if !valid_package {
        return (StatusCode::BAD_REQUEST, "Invalid Android package name.").into_response();
    }

    let store_response = match state
        .client
        .get("https://play.google.com/store/apps/details")
        .query(&[("id", package), ("hl", "en"), ("gl", "US")])
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response,
        Ok(response) if response.status() == StatusCode::NOT_FOUND => {
            return (StatusCode::NOT_FOUND, "App is not listed on Google Play.").into_response();
        }
        Ok(response) => {
            return (
                StatusCode::BAD_GATEWAY,
                format!("Google Play returned {}.", response.status()),
            )
                .into_response();
        }
        Err(error) => {
            return (StatusCode::BAD_GATEWAY, error.to_string()).into_response();
        }
    };

    let store_html = match store_response.text().await {
        Ok(html) => html,
        Err(error) => return (StatusCode::BAD_GATEWAY, error.to_string()).into_response(),
    };
    let Some(icon_url) = html_meta_content(&store_html, "og:image") else {
        return (StatusCode::NOT_FOUND, "App icon was not found.").into_response();
    };
    if !icon_url.starts_with("https://play-lh.googleusercontent.com/") {
        return (StatusCode::BAD_GATEWAY, "Unexpected app icon host.").into_response();
    }

    let icon_response = match state.client.get(icon_url).send().await {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            return (
                StatusCode::BAD_GATEWAY,
                format!("App icon host returned {}.", response.status()),
            )
                .into_response();
        }
        Err(error) => return (StatusCode::BAD_GATEWAY, error.to_string()).into_response(),
    };
    let content_type = icon_response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.starts_with("image/"))
        .unwrap_or("image/png")
        .to_string();
    let bytes = match icon_response.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => return (StatusCode::BAD_GATEWAY, error.to_string()).into_response(),
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=604800, immutable")
        .header("X-Content-Type-Options", "nosniff")
        .body(Body::from(bytes))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}



#[derive(serde::Deserialize)]
pub(crate) struct AppIconQuery {
    pub(crate) package: String,
}
