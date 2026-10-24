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

    #[cfg(unix)]
    {
        let termux_candidates = [
            "/data/data/com.termux/files/usr/lib/jvm/java-21-openjdk",
            "/data/data/com.termux/files/usr/lib/jvm/openjdk-21",
            "/data/data/com.termux/files/usr/lib/jvm/openjdk-17",
        ];
        for src_str in termux_candidates {
            let src = Path::new(src_str);
            if src.exists() {
                state.log("☕ Menemukan Java dari instalasi Termux lokal, menyinkronkan JRE...");
                let dest_jre = state.modpath.join("jre");
                let _ = tokio::fs::create_dir_all(&dest_jre).await;
                let cp_cmd = format!(
                    "su -c 'cp -a \"{src}/\"* \"{dest}/\" 2>/dev/null; cp -a /data/data/com.termux/files/usr/lib/libz.so* /data/data/com.termux/files/usr/lib/libandroid-*.so \"{dest}/lib/\" 2>/dev/null; chmod -R 755 \"{dest}\"'",
                    src = src.display(),
                    dest = dest_jre.display()
                );
                let _ = std::process::Command::new("/system/bin/sh")
                    .arg("-c")
                    .arg(&cp_cmd)
                    .status();

                if dest_jre.join("bin").join("java").exists() {
                    state.log("✅ Berhasil menyinkronkan OpenJDK dari Termux!");
                    return Ok(());
                }
            }
        }
    }

    let url = download_url.unwrap_or_else(|| JRE_DOWNLOAD_URL.to_string());

    state.log(format!(
        "📥 Downloading headless OpenJDK 21 for Android from: {}",
        url
    ));

    let runtime_root = workspace
        .filter(|p| !p.starts_with("/sdcard") && !p.starts_with("/storage"))
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
