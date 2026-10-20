use crate::state::AppState;
use crate::utils::get_java_binary_in;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

pub const MORPHE_CLI_URL: &str = "https://github.com/MorpheApp/morphe-cli/releases/download/v1.18.0/morphe-desktop-1.18.0-all.jar";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PatchRequest {
    pub package_name: String,
    pub target_version: String,
    pub patch_source: String,
    pub patch_tag: String,
    #[serde(default)]
    pub patch_bundle_url: Option<String>,
    #[serde(default)]
    pub manifest_url: Option<String>,
    #[serde(default)]
    pub patch_bundle_sha256: Option<String>,
    #[serde(default)]
    pub source_commit: Option<String>,
    #[serde(default)]
    pub manifest_sha256: Option<String>,
    #[serde(default)]
    pub is_root: bool,
    #[serde(default)]
    pub excluded_patches: Vec<String>,
    #[serde(default)]
    pub included_patches: Vec<String>,
    #[serde(default)]
    pub options: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub download_plan_id: Option<String>,
    #[serde(default)]
    pub workspace_location_id: Option<String>,
    #[serde(default)]
    pub output_location_id: Option<String>,
}

pub async fn execute_patch_job(state: AppState, req: PatchRequest) {
    state.set_patching(true);
    state.log("🚀 =================================================");
    state.log(format!(
        "🚀 Starting On-Device RVX Patching Process ({})",
        req.package_name
    ));
    state.log(format!("  Target Package : {}", req.package_name));
    state.log(format!("  Target Version : {}", req.target_version));
    state.log(format!("  Patch Source   : {}", req.patch_source));
    state.log(format!("  Patch Tag      : {}", req.patch_tag));
    state.log(format!("  Root Mode      : {}", req.is_root));
    state.log("🚀 =================================================");

    if let Err(e) = run_pipeline(&state, &req).await {
        state.log(format!("❌ Patching failed with error: {}", e));
    } else {
        state.log("🎉 =================================================");
        state.log("🎉 Patching process completed successfully! 🎬");
        state.log("🎉 You can now Hot-Mount or Save Flashable ZIP.");
        state.log("🎉 =================================================");
    }

    state.set_patching(false);
}

async fn run_pipeline(state: &AppState, req: &PatchRequest) -> Result<(), String> {
    let (workspace_root, output_root) = resolve_request_locations(state, req).await?;
    tokio::fs::create_dir_all(&workspace_root)
        .await
        .map_err(|e| format!("Failed to create workspace: {}", e))?;
    tokio::fs::create_dir_all(&output_root)
        .await
        .map_err(|e| format!("Failed to create output directory: {}", e))?;
    // 1. Verify Java JRE
    state.log("🔍 Checking Java Runtime Environment (JRE)...");
    let java_bin = match get_java_binary_in(&state.modpath, Some(&workspace_root)) {
        Some(bin) => bin,
        None => {
            state.log("⚠️ Java not found. Attempting automatic micro-JRE setup...");
            crate::jre::ensure_jre_installed(state, None, Some(&workspace_root)).await?;
            get_java_binary_in(&state.modpath, Some(&workspace_root))
                .ok_or_else(|| "Failed to locate java binary after installation".to_string())?
        }
    };
    state.log(format!("  Using Java: {}", java_bin.display()));

    let build_dir = workspace_root.join("cache");
    tokio::fs::create_dir_all(&build_dir)
        .await
        .map_err(|e| format!("Failed to create build_out directory: {}", e))?;

    // 2. Download Morphe CLI
    let cli_jar = build_dir.join("morphe-cli.jar");
    if !cli_jar.exists() {
        state.log("📦 Downloading Morphe CLI jar...");
        download_file(&state.client, MORPHE_CLI_URL, &cli_jar, state, "cli").await?;
    }
    state.log("  Morphe CLI is ready.");

    // 3. Download the exact Patch Bundle (.mpp) selected by the UI.
    // The manifest is catalog metadata and is not consumed by Morphe CLI.
    let patch_mpp = build_dir.join("patches.mpp");
    state.log(format!(
        "📦 Resolving patch bundle for source '{}'...",
        req.patch_source
    ));
    let explicit_bundle = req
        .patch_bundle_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty());

    let mpp_url = explicit_bundle
        .ok_or_else(|| "The selected release did not provide an explicit .mpp bundle URL".to_string())?
        .to_string();

    validate_patch_bundle_url(&mpp_url)?;
    state.log("  Source metadata was already verified during release selection.");

    let bundle_marker = build_dir.join("patches.mpp.url");
    let cached_url = tokio::fs::read_to_string(&bundle_marker)
        .await
        .unwrap_or_default();
    let cached_hash_valid = verify_file_sha256(&patch_mpp, req.patch_bundle_sha256.as_deref())
        .await
        .is_ok();
    let cache_valid = cached_url.trim() == mpp_url
        && patch_mpp.exists()
        && validate_downloaded_patch_bundle(&patch_mpp).await.is_ok()
        && cached_hash_valid;
    if cache_valid {
        state.log("✅ Using cached patch bundle for the selected release.");
    } else {
        state.log(format!("  Fetching patch bundle from: {}", mpp_url));
        download_file(&state.client, &mpp_url, &patch_mpp, state, "bundle").await?;
        validate_downloaded_patch_bundle(&patch_mpp).await?;
        verify_file_sha256(&patch_mpp, req.patch_bundle_sha256.as_deref()).await?;
        tokio::fs::write(&bundle_marker, &mpp_url)
            .await
            .map_err(|e| format!("Failed to save patch bundle cache marker: {}", e))?;
    }

    // 4. Resolve Stock APK
    let stock_apk =
        locate_or_download_stock(state, &req.package_name, &req.target_version, &build_dir).await?;
    state.log(format!("  Stock APK: {}", stock_apk.display()));

    // 5. Build CLI arguments
    let mut args: Vec<String> = vec![
        "-jar".to_string(),
        cli_jar.to_string_lossy().to_string(),
        "patch".to_string(),
        "-f".to_string(),
        "-p".to_string(),
        patch_mpp.to_string_lossy().to_string(),
    ];

    let app_alias = match req.package_name.as_str() {
        "com.google.android.youtube" => "YouTube",
        "com.google.android.apps.youtube.music" => "YouTubeMusic",
        "com.reddit.frontpage" => "Reddit",
        "com.twitter.android" => "Twitter",
        "com.zhiliaoapp.musically" => "TikTok",
        _ => req.package_name.split('.').last().unwrap_or("App"),
    };

    let final_name = if req.is_root {
        format!("{}Revanced.apk", app_alias)
    } else {
        format!("{}.RVX.v{}-NonRoot.apk", app_alias, req.target_version)
    };
    let output_apk = if req.is_root {
        state
            .modpath
            .join("app")
            .join(format!("{}Revanced.apk", app_alias))
    } else {
        output_root.join(&final_name)
    };

    if let Some(parent) = output_apk.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    args.push("-o".to_string());
    args.push(output_apk.to_string_lossy().to_string());

    // Excluded patches
    for exc in &req.excluded_patches {
        if !exc.trim().is_empty() {
            args.push("-d".to_string());
            args.push(exc.clone());
        }
    }

    // Included patches
    for inc in &req.included_patches {
        if !inc.trim().is_empty() {
            args.push("-e".to_string());
            args.push(inc.clone());
        }
    }

    // Patch options are strongly typed by Morphe. Preserve JSON booleans,
    // numbers and arrays instead of flattening everything into UI strings.
    let mut option_entries: Vec<_> = req.options.iter().collect();
    option_entries.sort_by(|(left, _), (right, _)| left.cmp(right));
    for (key, value) in option_entries {
        let option_arg = match value {
            serde_json::Value::Null => format!("-O{}", key),
            serde_json::Value::String(text) => format!("-O{}={}", key, text),
            serde_json::Value::Bool(boolean) => format!("-O{}={}", key, boolean),
            serde_json::Value::Number(number) => format!("-O{}={}", key, number),
            serde_json::Value::Array(items) => {
                let values = items
                    .iter()
                    .map(|item| match item {
                        serde_json::Value::String(text) => text.clone(),
                        other => other.to_string(),
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                format!("-O{}=[{}]", key, values)
            }
            serde_json::Value::Object(_) => format!("-O{}={}", key, value),
        };
        args.push(option_arg);
    }

    // Root-specific adjustments
    if req.is_root {
        for r_name in ["GmsCore support", "MicroG support", "Spoof signature"] {
            args.push("-d".to_string());
            args.push(r_name.to_string());
        }
    }

    args.push(stock_apk.to_string_lossy().to_string());

    // 6. Execute Morphe CLI process with live log streaming
    state.log("⚡ Executing Morphe CLI patcher...");
    state.log(format!(
        "  Executing: {} with {} arguments",
        java_bin.display(),
        args.len()
    ));

    let mut child = Command::new(&java_bin)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Morphe CLI: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let state_out = state.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            state_out.log(line);
        }
    });

    let state_err = state.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            state_err.log(format!("⚠️ {}", line));
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Process error: {}", e))?;

    if !status.success() {
        return Err(format!("Morphe CLI exited with code: {:?}", status.code()));
    }

    state.log(format!("✅ Output APK generated: {}", output_apk.display()));
    if req.is_root {
        let exported = output_root.join(&final_name);
        tokio::fs::copy(&output_apk, &exported).await.map_err(|e| {
            format!(
                "Failed to copy root output to {}: {}",
                exported.display(),
                e
            )
        })?;
        state.log(format!(
            "OUTPUT_FILE|{}|{}",
            exported.display(),
            tokio::fs::metadata(&exported)
                .await
                .map(|m| m.len())
                .unwrap_or(0)
        ));
    } else {
        let download_dir = Path::new("/sdcard/Download");
        if download_dir.exists() && download_dir.is_dir() {
            let dest = download_dir.join(&final_name);
            if let Ok(_) = tokio::fs::copy(&output_apk, &dest).await {
                state.log(format!("📥 APK disalin ke folder Download: {}", dest.display()));
            }
        }
        state.log(format!(
            "OUTPUT_FILE|{}|{}",
            output_apk.display(),
            tokio::fs::metadata(&output_apk)
                .await
                .map(|m| m.len())
                .unwrap_or(0)
        ));
    }
    Ok(())
}

async fn resolve_request_locations(
    state: &AppState,
    req: &PatchRequest,
) -> Result<(PathBuf, PathBuf), String> {
    let config_path = state.modpath.join("config").join("storage.json");
    let value = tokio::fs::read(&config_path)
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .ok_or_else(|| "Storage locations have not been selected".to_string())?;
    let workspace_id = req
        .workspace_location_id
        .as_deref()
        .ok_or_else(|| "Missing workspace location".to_string())?;
    let output_id = req
        .output_location_id
        .as_deref()
        .ok_or_else(|| "Missing output location".to_string())?;
    if value.get("workspaceId").and_then(|v| v.as_str()) != Some(workspace_id)
        || value.get("outputId").and_then(|v| v.as_str()) != Some(output_id)
    {
        return Err("Storage selection changed; run download preflight again".to_string());
    }
    let workspace = value
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .ok_or_else(|| "Workspace path is unavailable".to_string())?;
    let output = value
        .get("outputPath")
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .ok_or_else(|| "Output path is unavailable".to_string())?;
    Ok((workspace, output))
}

fn validate_patch_bundle_url(url: &str) -> Result<(), String> {
    let normalized = url.trim().to_ascii_lowercase();
    let path = normalized.split(['?', '#']).next().unwrap_or_default();

    if !(normalized.starts_with("https://") || normalized.starts_with("http://")) {
        return Err("Patch bundle URL must use HTTP or HTTPS".to_string());
    }
    if !path.ends_with(".mpp") {
        return Err(format!(
            "Selected source did not provide a Morphe .mpp bundle: {}",
            url
        ));
    }
    Ok(())
}

async fn validate_downloaded_patch_bundle(path: &Path) -> Result<(), String> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| format!("Failed to inspect patch bundle: {}", e))?;
    if metadata.len() == 0 {
        return Err("Downloaded patch bundle is empty".to_string());
    }

    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Failed to validate patch bundle: {}", e))?;
    let mut header = [0_u8; 4];
    file.read_exact(&mut header)
        .await
        .map_err(|e| format!("Patch bundle is truncated: {}", e))?;
    if header != *b"PK\x03\x04" && header != *b"PK\x05\x06" {
        return Err("Downloaded .mpp is not a valid ZIP-based Morphe bundle".to_string());
    }
    Ok(())
}

async fn verify_file_sha256(path: &Path, expected: Option<&str>) -> Result<(), String> {
    let Some(expected) = expected.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    if expected.len() != 64 || !expected.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Patch bundle SHA-256 is invalid".to_string());
    }
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Failed to hash patch bundle: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to hash patch bundle: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(format!(
            "Patch bundle SHA-256 mismatch (expected {}, got {})",
            expected, actual
        ));
    }
    Ok(())
}

async fn locate_or_download_stock(
    state: &AppState,
    package_name: &str,
    version: &str,
    build_dir: &Path,
) -> Result<PathBuf, String> {
    let app_alias = match package_name {
        "com.google.android.youtube" => "youtube",
        "com.google.android.apps.youtube.music" => "ytmusic",
        "com.reddit.frontpage" => "reddit",
        "com.twitter.android" => "twitter",
        "com.zhiliaoapp.musically" => "tiktok",
        _ => package_name.split('.').last().unwrap_or("app"),
    };

    // 1. Check if user already supplied stock APK in module directory
    let cands = [
        state.modpath.join(format!("stock-{}.apk", app_alias)),
        state.modpath.join(format!("stock-{}.apk", package_name)),
    ];
    for cand in cands {
        if cand.exists() {
            state.log(format!("📂 Using provided stock APK: {}", cand.display()));
            return Ok(cand);
        }
    }

    let target_stock = build_dir.join(format!("{}-{}.apk", app_alias, version));
    if target_stock.exists() {
        return Ok(target_stock);
    }

    // 2. On Android: Check if installed package base APK can be extracted
    #[cfg(unix)]
    {
        let query_cmd = format!(
            "pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n1",
            package_name
        );
        if let Ok(output) = crate::utils::run_shell_command(&query_cmd).await {
            let path_str = output.trim();
            if !path_str.is_empty() && Path::new(path_str).exists() {
                state.log(format!(
                    "📲 Extracted installed APK ({}) from device: {}",
                    package_name, path_str
                ));
                let _ = tokio::fs::copy(path_str, &target_stock).await;
                if target_stock.exists() {
                    return Ok(target_stock);
                }
            }
        }
    }

    // 3. Fallback: Download via download-stock script if YouTube
    if package_name == "com.google.android.youtube" {
        state.log(format!("📥 Fetching Stock YouTube v{} APK...", version));
        let script_path = state.modpath.join("tools").join("download-stock.py");
        if script_path.exists() {
            let cmd = format!(
                "python3 \"{}\" \"{}\" \"{}\"",
                script_path.display(),
                version,
                target_stock.display()
            );
            let _ = crate::utils::run_shell_command(&cmd).await;
            if target_stock.exists() {
                return Ok(target_stock);
            }
        }
    }

    Err(format!(
        "Stock APK for {} (v{}) not found. Please install the app on device or place stock-{}.apk in module directory.",
        package_name, version, app_alias
    ))
}

pub(crate) async fn download_file(
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    state: &AppState,
    label: &str,
) -> Result<(), String> {
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;

    if !res.status().is_success() {
        return Err(format!(
            "Download failed with status {} for {}",
            res.status(),
            url
        ));
    }

    let total = res.content_length().unwrap_or(0);
    let part_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| format!("{}.part", name))
        .unwrap_or_else(|| "download.part".to_string());
    let part_path = target.with_file_name(part_name);
    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|e| format!("Failed to create {}: {}", part_path.display(), e))?;
    let mut stream = res.bytes_stream();
    let mut received = 0_u64;
    let mut last_reported = 0_u64;
    state.log(format!("DOWNLOAD_PROGRESS|{}|0|{}", label, total));

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read download stream: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write {}: {}", part_path.display(), e))?;
        received += chunk.len() as u64;
        let report_step = if total > 0 {
            (total / 100).max(256 * 1024)
        } else {
            1024 * 1024
        };
        if received.saturating_sub(last_reported) >= report_step || (total > 0 && received >= total)
        {
            state.log(format!(
                "DOWNLOAD_PROGRESS|{}|{}|{}",
                label, received, total
            ));
            last_reported = received;
        }
    }
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush {}: {}", part_path.display(), e))?;
    drop(file);
    if received != last_reported {
        state.log(format!(
            "DOWNLOAD_PROGRESS|{}|{}|{}",
            label, received, total
        ));
    }
    if target.exists() {
        tokio::fs::remove_file(target)
            .await
            .map_err(|e| format!("Failed to replace {}: {}", target.display(), e))?;
    }
    tokio::fs::rename(&part_path, target)
        .await
        .map_err(|e| format!("Failed to finalize {}: {}", target.display(), e))?;

    Ok(())
}
