use crate::state::AppState;
use crate::utils::get_java_binary_in;
use flate2::read::GzDecoder;
use std::fs::File;
use std::path::Path;
use tar::Archive;

pub const JRE_DOWNLOAD_URL: &str = "https://github.com/Zy0x/YouTube-Revanced/releases/download/v2.1.0/openjdk-21-headless-aarch64.tar.gz";

pub async fn ensure_jre_installed(
    state: &AppState,
    download_url: Option<String>,
    workspace: Option<&Path>,
) -> Result<(), String> {
    if get_java_binary_in(&state.modpath, workspace).is_some() {
        state.log("☕ Java runtime is already available.");
        return Ok(());
    }

    let url = download_url.unwrap_or_else(|| JRE_DOWNLOAD_URL.to_string());

    state.log(format!(
        "📥 Downloading headless OpenJDK 21 for Android from: {}",
        url
    ));

    let runtime_root = workspace
        .map(|path| path.join("runtime"))
        .unwrap_or_else(|| state.modpath.clone());
    tokio::fs::create_dir_all(&runtime_root)
        .await
        .map_err(|e| format!("Failed to create runtime dir: {}", e))?;
    let jre_dir = runtime_root.join("jre");
    let tar_gz_path = runtime_root.join("jre.tar.gz");

    crate::patcher::download_file(&state.client, &url, &tar_gz_path, state, "jre").await?;

    state.log("📦 Extracting JRE archive to module directory...");

    let tar_gz_file = File::open(&tar_gz_path)
        .map_err(|e| format!("Failed to open downloaded archive: {}", e))?;
    let tar = GzDecoder::new(tar_gz_file);
    let mut archive = Archive::new(tar);

    tokio::fs::create_dir_all(&jre_dir)
        .await
        .map_err(|e| format!("Failed to create jre dir: {}", e))?;

    archive
        .unpack(&jre_dir)
        .map_err(|e| format!("Failed to unpack JRE: {}", e))?;

    // Cleanup archive
    let _ = tokio::fs::remove_file(&tar_gz_path).await;

    // Ensure executable permissions on Unix/Android
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let java_bin = jre_dir.join("bin").join("java");
        if java_bin.exists() {
            let _ = std::fs::set_permissions(&java_bin, std::fs::Permissions::from_mode(0o755));
        }
    }

    state.log("✅ Headless JRE setup completed successfully!");
    Ok(())
}
