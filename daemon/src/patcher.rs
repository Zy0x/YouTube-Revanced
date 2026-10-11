use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use crate::state::AppState;
use crate::utils::get_java_binary;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PatchRequest {
    #[serde(default = "default_package")]
    pub package_name: String,
    #[serde(default = "default_version")]
    pub target_version: String,
    #[serde(default = "default_source")]
    pub patch_source: String,
    #[serde(default = "default_tag")]
    pub patch_tag: String,
    #[serde(default)]
    pub patch_bundle_url: Option<String>,
    #[serde(default)]
    pub manifest_url: Option<String>,
    #[serde(default)]
    pub is_root: bool,
    #[serde(default)]
    pub excluded_patches: Vec<String>,
    #[serde(default)]
    pub included_patches: Vec<String>,
    #[serde(default)]
    pub options: HashMap<String, serde_json::Value>,
}

fn default_package() -> String { "com.google.android.youtube".to_string() }
fn default_version() -> String { "recommended".to_string() }
fn default_source() -> String { "anddea".to_string() }
fn default_tag() -> String { "dev".to_string() }

pub async fn execute_patch_job(state: AppState, req: PatchRequest) {
    state.set_patching(true);
    state.log("🚀 =================================================");
    state.log(format!("🚀 Starting On-Device RVX Patching Process ({})", req.package_name));
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
    // 1. Verify Java JRE
    state.log("🔍 Checking Java Runtime Environment (JRE)...");
    let java_bin = match get_java_binary(&state.modpath) {
        Some(bin) => bin,
        None => {
            state.log("⚠️ Java not found. Attempting automatic micro-JRE setup...");
            crate::jre::ensure_jre_installed(state, None).await?;
            get_java_binary(&state.modpath)
                .ok_or_else(|| "Failed to locate java binary after installation".to_string())?
        }
    };
    state.log(format!("  Using Java: {}", java_bin.display()));

    let build_dir = state.modpath.join("build_out");
    tokio::fs::create_dir_all(&build_dir)
        .await
        .map_err(|e| format!("Failed to create build_out directory: {}", e))?;

    // 2. Download Morphe CLI
    let cli_jar = build_dir.join("morphe-cli.jar");
    if !cli_jar.exists() {
        state.log("📦 Downloading Morphe CLI jar...");
        let cli_url = "https://github.com/MorpheApp/morphe-cli/releases/download/v1.18.0/morphe-desktop-1.18.0-all.jar";
        download_file(&state.client, cli_url, &cli_jar).await?;
    }
    state.log("  Morphe CLI is ready.");

    // 3. Download Patch Bundle (.mpp) & Manifest
    let patch_mpp = build_dir.join("patches.mpp");
    let manifest_json = build_dir.join("patches-list.json");

    state.log(format!("📦 Resolving patch bundle for source '{}'...", req.patch_source));
    let (mpp_url, manifest_url) = if let (Some(b), Some(m)) = (&req.patch_bundle_url, &req.manifest_url) {
        (b.clone(), m.clone())
    } else {
        resolve_source_urls(&req.patch_source, &req.patch_tag)
    };

    state.log(format!("  Fetching manifest from CDN: {}", manifest_url));
    download_file(&state.client, &manifest_url, &manifest_json).await?;

    state.log(format!("  Fetching patch bundle from: {}", mpp_url));
    download_file(&state.client, &mpp_url, &patch_mpp).await?;

    // 4. Resolve Stock APK
    let stock_apk = locate_or_download_stock(state, &req.package_name, &req.target_version, &build_dir).await?;
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

    let output_apk = if req.is_root {
        state.modpath.join("app").join(format!("{}Revanced.apk", app_alias))
    } else {
        build_dir.join(format!("{}.RVX.v{}-NonRoot.apk", app_alias, req.target_version))
    };

    if let Some(parent) = output_apk.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    args.push("-o".to_string());
    args.push(output_apk.to_string_lossy().to_string());

    // Excluded patches
    for exc in &req.excluded_patches {
        if !exc.trim().is_empty() {
            args.push("-e".to_string());
            args.push(exc.clone());
        }
    }

    // Included patches
    for inc in &req.included_patches {
        if !inc.trim().is_empty() {
            args.push("-i".to_string());
            args.push(inc.clone());
        }
    }

    // Root-specific adjustments
    if req.is_root {
        for r_name in ["GmsCore support", "MicroG support", "Spoof signature"] {
            args.push("-e".to_string());
            args.push(r_name.to_string());
        }
    }

    args.push(stock_apk.to_string_lossy().to_string());

    // 6. Execute Morphe CLI process with live log streaming
    state.log("⚡ Executing Morphe CLI patcher...");
    state.log(format!("  Executing: {} with {} arguments", java_bin.display(), args.len()));

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

    let status = child.wait().await.map_err(|e| format!("Process error: {}", e))?;

    if !status.success() {
        return Err(format!("Morphe CLI exited with code: {:?}", status.code()));
    }

    state.log(format!("✅ Output APK generated: {}", output_apk.display()));
    Ok(())
}

fn resolve_source_urls(source: &str, tag: &str) -> (String, String) {
    if source.contains('/') {
        let clean = source.trim_start_matches("https://github.com/").trim_end_matches('/');
        let manifest = format!("https://cdn.jsdelivr.net/gh/{clean}@main/patches-list.json");
        let mpp = if tag == "dev" || tag == "prerelease" {
            format!("https://github.com/{clean}/releases/download/{tag}/patches.mpp")
        } else if tag.starts_with('v') {
            format!("https://github.com/{clean}/releases/download/{tag}/patches.mpp")
        } else {
            format!("https://github.com/{clean}/releases/latest/download/patches.mpp")
        };
        return (mpp, manifest);
    }
    match source {
        "morphe" => (
            "https://github.com/MorpheApp/morphe-patches/releases/download/v1.18.0/morphe-patches-1.18.0.mpp".to_string(),
            "https://cdn.jsdelivr.net/gh/MorpheApp/morphe-patches@main/patches-list.json".to_string(),
        ),
        "inotia00" => (
            "https://github.com/inotia00/revanced-patches/releases/download/v2.190.1/revanced-patches-2.190.1.jar".to_string(),
            "https://cdn.jsdelivr.net/gh/inotia00/revanced-patches@revanced-extended/patches.json".to_string(),
        ),
        "revanced" => (
            "https://github.com/ReVanced/revanced-patches/releases/download/v4.16.0/patches-4.16.0.rvp".to_string(),
            "https://cdn.jsdelivr.net/gh/ReVanced/revanced-patches@main/patches.json".to_string(),
        ),
        _ => {
            // Default to Anddea
            let (mpp, manifest) = if tag == "dev" || tag == "prerelease" {
                (
                    "https://github.com/anddea/revanced-patches/releases/download/v4.3.1-dev.1/patches-4.3.1-dev.1.mpp".to_string(),
                    "https://cdn.jsdelivr.net/gh/anddea/revanced-patches@main/patches-list.json".to_string(),
                )
            } else if tag.starts_with('v') {
                (
                    format!("https://github.com/anddea/revanced-patches/releases/download/{}/patches-{}.mpp", tag, tag.trim_start_matches('v')),
                    "https://cdn.jsdelivr.net/gh/anddea/revanced-patches@main/patches-list.json".to_string(),
                )
            } else {
                (
                    "https://github.com/anddea/revanced-patches/releases/download/v4.3.0/patches-4.3.0.mpp".to_string(),
                    "https://cdn.jsdelivr.net/gh/anddea/revanced-patches@main/patches-list.json".to_string(),
                )
            };
            (mpp, manifest)
        }
    }
}

async fn locate_or_download_stock(state: &AppState, package_name: &str, version: &str, build_dir: &Path) -> Result<PathBuf, String> {
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
        state.modpath.join("stock-youtube.apk"),
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
        let query_cmd = format!("pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n1", package_name);
        if let Ok(output) = crate::utils::run_shell_command(&query_cmd).await {
            let path_str = output.trim();
            if !path_str.is_empty() && Path::new(path_str).exists() {
                state.log(format!("📲 Extracted installed APK ({}) from device: {}", package_name, path_str));
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
            let cmd = format!("python3 \"{}\" \"{}\" \"{}\"", script_path.display(), version, target_stock.display());
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

async fn download_file(client: &reqwest::Client, url: &str, target: &Path) -> Result<(), String> {
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;

    if !res.status().is_success() {
        return Err(format!("Download failed with status {} for {}", res.status(), url));
    }

    let bytes = res.bytes().await.map_err(|e| format!("Failed to read stream: {}", e))?;
    tokio::fs::write(target, &bytes)
        .await
        .map_err(|e| format!("Failed to write {}: {}", target.display(), e))?;

    Ok(())
}
