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

pub const MORPHE_CLI_URL: &str = "https://github.com/MorpheApp/morphe-desktop/releases/download/v1.20.0/morphe-desktop-1.20.0-all.jar";

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct MorpheEngineOptions {
    #[serde(default)]
    pub keystore_mode: Option<String>,
    #[serde(default)]
    pub custom_keystore_path: Option<String>,
    #[serde(default)]
    pub keystore_password: Option<String>,
    #[serde(default)]
    pub keystore_alias: Option<String>,
    #[serde(default)]
    pub keystore_entry_password: Option<String>,
    #[serde(default)]
    pub signer_name: Option<String>,
    #[serde(default)]
    pub unsigned: bool,
    #[serde(default)]
    pub strip_libs: Vec<String>,
    #[serde(default)]
    pub bytecode_mode: Option<String>,
    #[serde(default)]
    pub continue_on_error: Option<bool>,
    #[serde(default)]
    pub force: Option<bool>,
    #[serde(default)]
    pub disable_purge: Option<bool>,
    #[serde(default)]
    pub secondary_bundle_path: Option<String>,
}

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
    #[serde(default)]
    pub morphe_engine_options: Option<MorpheEngineOptions>,
    #[serde(default)]
    pub input_apk_path: Option<String>,
    #[serde(skip)]
    pub prepared_workspace: Option<PathBuf>,
    #[serde(skip)]
    pub prepared_output: Option<PathBuf>,
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
        if e.starts_with("DEPENDENCY_ERROR|") {
            state.log(&e);
        }
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
    let build_dir = workspace_root.join("cache");
    tokio::fs::create_dir_all(&build_dir)
        .await
        .map_err(|e| crate::dependencies::error("storage", "storage_unwritable", e.to_string()))?;
    crate::dependencies::status(
        state,
        "apk",
        "checking",
        "Memeriksa paket dan versi APK asli",
    );
    let stock_apk = crate::apk::locate_or_download_stock(
        state,
        &req.package_name,
        &req.target_version,
        &build_dir,
        req.input_apk_path.as_deref(),
    )
    .await
    .map_err(|e| crate::dependencies::error("apk", "apk_unavailable", e))?;
    crate::dependencies::status(
        state,
        "apk",
        "ready",
        "APK asli dengan paket dan versi yang dipilih sudah tervalidasi",
    );
    crate::jre::ensure_jre_installed(state, None, Some(&workspace_root))
        .await
        .map_err(|e| crate::dependencies::error("java", "java_unavailable", e))?;
    let java_bin = get_java_binary_in(&state.modpath, Some(&workspace_root)).ok_or_else(|| {
        crate::dependencies::error(
            "java",
            "java_unavailable",
            "Runtime tidak ditemukan setelah persiapan",
        )
    })?;
    let cli_jar = build_dir.join("morphe-cli.jar");
    crate::dependencies::ensure_cli(state, &java_bin, &cli_jar)
        .await
        .map_err(|e| crate::dependencies::error("cli", "cli_unavailable", e))?;

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
        .ok_or_else(|| {
            "The selected release did not provide an explicit .mpp bundle URL".to_string()
        })?
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
    if !cache_valid {
        let mut failure = String::new();
        for attempt in 0..2 {
            crate::dependencies::status(
                state,
                "bundle",
                if attempt == 0 {
                    "downloading"
                } else {
                    "retrying"
                },
                "Menyiapkan bundle rilis yang dipilih dan memeriksa integritasnya",
            );
            let result = async {
                download_file(&state.client, &mpp_url, &patch_mpp, state, "bundle").await?;
                validate_downloaded_patch_bundle(&patch_mpp).await?;
                verify_file_sha256(&patch_mpp, req.patch_bundle_sha256.as_deref()).await
            }
            .await;
            match result {
                Ok(()) => {
                    failure.clear();
                    break;
                }
                Err(error) => failure = error,
            }
        }
        if !failure.is_empty() {
            return Err(crate::dependencies::error(
                "bundle",
                "bundle_unavailable",
                failure,
            ));
        }
        tokio::fs::write(&bundle_marker, &mpp_url)
            .await
            .map_err(|e| {
                crate::dependencies::error("bundle", "bundle_cache_failed", e.to_string())
            })?;
    }
    crate::dependencies::status(
        state,
        "bundle",
        "ready",
        "Bundle rilis terpilih terverifikasi",
    );
    state.log("DEPENDENCIES_READY|APK, Java, mesin Morphe, dan bundle telah diverifikasi");

    let engine_opts = req.morphe_engine_options.clone().unwrap_or_default();

    let tmp_dir = state.modpath.join("tmp");
    let _ = tokio::fs::create_dir_all(&tmp_dir).await;

    // 5. Build CLI arguments
    let mut args: Vec<String> = vec![
        format!("-Djava.io.tmpdir={}", tmp_dir.display()),
        "-jar".to_string(),
        cli_jar.to_string_lossy().to_string(),
        "patch".to_string(),
        "-t".to_string(),
        tmp_dir.to_string_lossy().to_string(),
    ];

    // Force version compatibility check
    if engine_opts.force.unwrap_or(false) {
        args.push("-f".to_string());
    }

    // Continue patching on individual patch error
    if engine_opts.continue_on_error.unwrap_or(false) {
        args.push("--continue-on-error".to_string());
    }

    // Keep scratch temporary files for debugging
    if engine_opts.disable_purge.unwrap_or(false) {
        args.push("--disable-purge".to_string());
    }

    // Bytecode compilation mode (STRIP_FAST | STRIP_SAFE | FULL)
    if let Some(mode) = &engine_opts.bytecode_mode {
        let trimmed = mode.trim();
        if !trimmed.is_empty() {
            args.push(format!("--bytecode-mode={}", trimmed));
        }
    }

    // Native library CPU architecture stripping (--striplibs)
    if !engine_opts.strip_libs.is_empty() {
        let archs = engine_opts
            .strip_libs
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(",");
        if !archs.is_empty() {
            args.push(format!("--striplibs={}", archs));
        }
    }

    // Patch bundle MPP
    args.push("-p".to_string());
    args.push(patch_mpp.to_string_lossy().to_string());

    // Optional secondary patch bundle (Experimental multi-bundle)
    if let Some(sec_path) = &engine_opts.secondary_bundle_path {
        let trimmed = sec_path.trim();
        if !trimmed.is_empty() {
            let sec_file = PathBuf::from(trimmed);
            if sec_file.exists() {
                args.push("-p".to_string());
                args.push(sec_file.to_string_lossy().to_string());
                state.log(format!(
                    "📦 Added secondary patch bundle: {}",
                    sec_file.display()
                ));
            } else {
                state.log(format!("⚠️ Secondary patch bundle not found: {}", trimmed));
            }
        }
    }

    // Keystore & signing options
    if engine_opts.unsigned {
        args.push("--unsigned".to_string());
    } else {
        let keystore_mode = engine_opts.keystore_mode.as_deref().unwrap_or("persistent");
        if keystore_mode == "custom" {
            if let Some(custom_path) = &engine_opts.custom_keystore_path {
                let p = custom_path.trim();
                if !p.is_empty() {
                    args.push(format!("--keystore={}", p));
                    if let Some(pass) = &engine_opts.keystore_password {
                        if !pass.is_empty() {
                            args.push(format!("--keystore-password={}", pass));
                        }
                    }
                    if let Some(alias) = &engine_opts.keystore_alias {
                        if !alias.is_empty() {
                            args.push(format!("--keystore-entry-alias={}", alias));
                        }
                    }
                    if let Some(epass) = &engine_opts.keystore_entry_password {
                        if !epass.is_empty() {
                            args.push(format!("--keystore-entry-password={}", epass));
                        }
                    }
                }
            }
        } else {
            // Persistent keystore in shared public storage with auto-import from Revancify-Xisr
            let persistent_keystore = resolve_persistent_keystore(&state, &build_dir).await;
            args.push(format!("--keystore={}", persistent_keystore.display()));
        }

        if let Some(signer) = &engine_opts.signer_name {
            let s = signer.trim();
            if !s.is_empty() {
                args.push(format!("--signer={}", s));
            }
        }
    }

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
    let published_output = if req.is_root {
        state
            .modpath
            .join("app")
            .join(format!("{}Revanced.apk", app_alias))
    } else {
        output_root.join(&final_name)
    };
    let output_apk = published_output.with_extension(format!(
        "{}.building.apk",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));

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
            if req
                .included_patches
                .iter()
                .chain(&req.excluded_patches)
                .any(|name| name == r_name)
            {
                args.push("-d".to_string());
                args.push(r_name.to_string());
            }
        }
    }

    args.push(stock_apk.to_string_lossy().to_string());

    // Probes and builds run with exactly the same Java launcher and environment.
    state
        .log("PIPELINE_STAGE|patch|Menerapkan fitur patch dengan resource yang telah diverifikasi");
    state.log("⚡ Executing Morphe CLI patcher...");
    let mut child_cmd = crate::dependencies::java_command(&java_bin);
    child_cmd
        .args(&args)
        .current_dir(&state.modpath)
        .env("TMPDIR", &tmp_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = child_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Morphe CLI: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let state_out = state.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            state_out.log(line);
        }
    });

    let state_err = state.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            state_err.log(format!("⚠️ {}", line));
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Process error: {}", e))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if !status.success() {
        return Err(format!("Morphe CLI exited with code: {:?}", status.code()));
    }

    let candidate = output_apk.clone();
    let identity = tokio::task::spawn_blocking(move || crate::apk::inspect_apk(&candidate))
        .await
        .map_err(|e| format!("Validasi hasil tidak selesai: {}", e))?
        .map_err(|e| format!("APK hasil patch tidak valid: {}", e))?;
    if identity.version != req.target_version
        || (req.is_root && identity.package != req.package_name)
    {
        return Err("Paket atau versi APK hasil patch tidak sesuai konfigurasi".into());
    }
    tokio::fs::rename(&output_apk, &published_output)
        .await
        .map_err(|e| format!("Hasil tervalidasi tidak dapat disimpan: {}", e))?;
    let output_apk = published_output;

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
                state.log(format!(
                    "📥 APK disalin ke folder Download: {}",
                    dest.display()
                ));
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
    if let (Some(workspace), Some(output)) = (&req.prepared_workspace, &req.prepared_output) {
        return Ok((workspace.clone(), output.clone()));
    }
    let config_path = state.modpath.join("config").join("storage.json");
    if let Ok(bytes) = tokio::fs::read(&config_path).await {
        if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            let workspace = value
                .get("workspacePath")
                .and_then(|v| v.as_str())
                .map(PathBuf::from);
            let output = value
                .get("outputPath")
                .and_then(|v| v.as_str())
                .map(PathBuf::from);
            if let (Some(w), Some(o)) = (workspace, output) {
                return Ok((w, o));
            }
        }
    }
    let (default_w, default_o) = crate::api::storage::storage_defaults(state);
    Ok((default_w, default_o))
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

pub(crate) async fn validate_downloaded_patch_bundle(path: &Path) -> Result<(), String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || crate::dependencies::validate_zip(&path, None))
        .await
        .map_err(|e| e.to_string())?
}

pub(crate) async fn verify_file_sha256(path: &Path, expected: Option<&str>) -> Result<(), String> {
    let Some(expected) = expected.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    if expected.len() != 64
        || !expected
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
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

pub use crate::apk::find_local_stock;

pub(crate) async fn download_file(
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    state: &AppState,
    label: &str,
) -> Result<(), String> {
    let part = target.with_file_name(format!(
        "{}.part",
        target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("download")
    ));
    let mut last_error = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            crate::dependencies::status(
                state,
                label,
                "retrying",
                &format!(
                    "Mengulang unduhan {}/3 setelah gangguan jaringan atau berkas terpotong",
                    attempt + 1
                ),
            );
            tokio::time::sleep(std::time::Duration::from_millis(250 * attempt)).await;
        }
        let result: Result<(), (bool, String)> = async {
            let response = client
                .get(url)
                .timeout(std::time::Duration::from_secs(600))
                .send()
                .await
                .map_err(|e| (true, format!("Koneksi unduhan gagal: {}", e)))?;
            let status = response.status();
            if !status.is_success() {
                return Err((
                    status.is_server_error() || status.as_u16() == 429 || status.as_u16() == 408,
                    format!(
                        "Sumber unduhan mengembalikan HTTP {}: {}",
                        status.as_u16(),
                        url
                    ),
                ));
            }
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if content_type.contains("text/html") || content_type.contains("application/json") {
                return Err((
                    false,
                    "Server memberikan halaman HTML/JSON, bukan berkas dependency".into(),
                ));
            }
            let total = response.content_length().unwrap_or(0);
            let mut file = tokio::fs::File::create(&part)
                .await
                .map_err(|e| (false, format!("Cache tidak dapat ditulis: {}", e)))?;
            let mut stream = response.bytes_stream();
            let mut received = 0u64;
            let mut reported = 0u64;
            state.log(format!("DOWNLOAD_PROGRESS|{}|0|{}", label, total));
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| (true, format!("Unduhan terputus: {}", e)))?;
                file.write_all(&chunk)
                    .await
                    .map_err(|e| (false, format!("Cache tidak dapat ditulis: {}", e)))?;
                received += chunk.len() as u64;
                if received.saturating_sub(reported) >= (total / 100).max(256 * 1024)
                    || total > 0 && received >= total
                {
                    state.log(format!(
                        "DOWNLOAD_PROGRESS|{}|{}|{}",
                        label, received, total
                    ));
                    reported = received;
                }
            }
            if received == 0 || total > 0 && received != total {
                return Err((
                    true,
                    format!("Unduhan belum lengkap: {} dari {} byte", received, total),
                ));
            }
            file.flush().await.map_err(|e| (false, e.to_string()))?;
            file.sync_all().await.map_err(|e| (false, e.to_string()))?;
            drop(file);
            #[cfg(windows)]
            if target.exists() {
                tokio::fs::remove_file(target)
                    .await
                    .map_err(|e| (false, e.to_string()))?;
            }
            tokio::fs::rename(&part, target)
                .await
                .map_err(|e| (false, format!("Tidak dapat mengaktifkan unduhan: {}", e)))?;
            state.log(format!(
                "DOWNLOAD_PROGRESS|{}|{}|{}",
                label, received, total
            ));
            Ok(())
        }
        .await;
        match result {
            Ok(()) => return Ok(()),
            Err((retryable, error)) => {
                last_error = error;
                if !retryable {
                    break;
                }
            }
        }
    }
    let _ = tokio::fs::remove_file(&part).await;
    Err(last_error)
}

async fn resolve_persistent_keystore(state: &AppState, build_dir: &Path) -> PathBuf {
    let public_rvx_ks = PathBuf::from("/sdcard/RVX-Patcher/keystore/morphe.keystore");
    let public_xisr_ks = PathBuf::from("/sdcard/Revancify-Xisr/morphe.keystore");

    // 1. Prioritize existing RVX shared keystore
    if public_rvx_ks.exists() {
        state.log(format!(
            "🔑 Menggunakan Keystore Persisten Shared: {}",
            public_rvx_ks.display()
        ));
        return public_rvx_ks;
    }

    // 2. Auto-import from Revancify-Xisr if available
    if public_xisr_ks.exists() {
        if let Some(parent) = public_rvx_ks.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        if let Ok(_) = tokio::fs::copy(&public_xisr_ks, &public_rvx_ks).await {
            state.log(format!(
                "🔑 Berhasil Auto-Import Keystore dari Revancify-Xisr -> {}",
                public_rvx_ks.display()
            ));
            return public_rvx_ks;
        } else {
            state.log(format!(
                "🔑 Menggunakan Keystore Revancify-Xisr langsung: {}",
                public_xisr_ks.display()
            ));
            return public_xisr_ks;
        }
    }

    // 3. If /sdcard is available, use /sdcard/RVX-Patcher/keystore/morphe.keystore
    let sdcard = Path::new("/sdcard");
    if sdcard.exists() && sdcard.is_dir() {
        if let Some(parent) = public_rvx_ks.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        state.log(format!(
            "🔑 Target Keystore Persisten Publik: {}",
            public_rvx_ks.display()
        ));
        return public_rvx_ks;
    }

    // 4. Fallback to build directory
    let local_ks = build_dir.join("morphe.keystore");
    state.log(format!(
        "🔑 Menggunakan Keystore Persisten Lokal: {}",
        local_ks.display()
    ));
    local_ks
}

#[cfg(test)]
mod download_tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    async fn server(responses: Vec<&'static [u8]>) -> (String, tokio::task::JoinHandle<usize>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/artifact", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let mut count = 0;
            for response in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = [0u8; 2048];
                let _ = socket.read(&mut request).await;
                socket.write_all(response).await.unwrap();
                socket.shutdown().await.unwrap();
                count += 1;
            }
            count
        });
        (url, handle)
    }
    fn state() -> AppState {
        AppState::new(std::env::temp_dir(), String::new(), vec![])
    }
    fn target() -> PathBuf {
        std::env::temp_dir().join(format!(
            "rvx-download-test-{}-{}.bin",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[tokio::test]
    async fn retries_server_errors_then_activates_complete_file() {
        let (url,server)=server(vec![b"HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",b"HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: 5\r\nConnection: close\r\n\r\nvalid"]).await;
        let state = state();
        let path = target();
        download_file(&state.client, &url, &path, &state, "cli")
            .await
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"valid");
        assert_eq!(server.await.unwrap(), 2);
        std::fs::remove_file(path).unwrap();
    }
    #[tokio::test]
    async fn retries_truncated_stream_instead_of_marking_it_ready() {
        let (url, server) = server(vec![
            b"HTTP/1.1 200 OK\r\nContent-Length: 50\r\nConnection: close\r\n\r\nshort",
            b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\ncomplete",
        ])
        .await;
        let state = state();
        let path = target();
        download_file(&state.client, &url, &path, &state, "bundle")
            .await
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"complete");
        assert_eq!(server.await.unwrap(), 2);
        std::fs::remove_file(path).unwrap();
    }
    #[tokio::test]
    async fn html_failure_keeps_previous_complete_file() {
        let (url,server)=server(vec![b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 4\r\nConnection: close\r\n\r\noops"]).await;
        let state = state();
        let path = target();
        std::fs::write(&path, b"existing").unwrap();
        assert!(download_file(&state.client, &url, &path, &state, "cli")
            .await
            .is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"existing");
        assert_eq!(server.await.unwrap(), 1);
        std::fs::remove_file(path).unwrap();
    }
}
