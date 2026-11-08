use crate::dependencies::{probe_java, status, JRE_SHA256};
use crate::state::AppState;
use crate::utils::get_java_binary_in;
use flate2::read::GzDecoder;
use std::path::Path;
use tar::Archive;

pub const JRE_DOWNLOAD_URL: &str = "https://github.com/Zy0x/YouTube-Revanced/releases/download/v2.1.0/openjdk-21-headless-aarch64.tar.gz";

pub async fn ensure_jre_installed(
    state: &AppState,
    download_url: Option<String>,
    workspace: Option<&Path>,
) -> Result<(), String> {
    status(
        state,
        "java",
        "checking",
        "Memeriksa Java 21 dengan menjalankannya, bukan hanya mencari berkas",
    );
    if let Some(java) = get_java_binary_in(&state.modpath, workspace) {
        match probe_java(&java).await {
            Ok(()) => {
                status(state, "java", "ready", "Java 21+ dapat dijalankan");
                return Ok(());
            }
            Err(error) => status(state, "java", "invalid", &error),
        }
    }
    if !cfg!(all(target_os = "android", target_arch = "aarch64")) {
        return Err("Java 21+ belum dapat dijalankan pada host ini. Pasang runtime yang sesuai dengan sistem operasi dan arsitekturnya.".into());
    }
    let url = download_url.unwrap_or_else(|| JRE_DOWNLOAD_URL.into());
    if url != JRE_DOWNLOAD_URL {
        return Err("Sumber runtime tidak cocok dengan rilis yang SHA-256-nya dipin".into());
    }
    // Executables stay in private storage, never on Android's noexec shared volume.
    let runtime = &state.modpath;
    tokio::fs::create_dir_all(runtime)
        .await
        .map_err(|e| e.to_string())?;
    let archive_path = runtime.join("jre.tar.gz");
    let staging = runtime.join("jre.prepare");
    let target = runtime.join("jre");
    let backup = runtime.join("jre.previous");
    let mut last_error = String::new();
    for attempt in 0..2 {
        status(
            state,
            "java",
            if attempt == 0 {
                "downloading"
            } else {
                "retrying"
            },
            "Menyiapkan runtime Android ARM64 yang terverifikasi",
        );
        if crate::patcher::verify_file_sha256(&archive_path, Some(JRE_SHA256))
            .await
            .is_err()
        {
            crate::patcher::download_file(&state.client, &url, &archive_path, state, "jre").await?;
        }
        if let Err(error) =
            crate::patcher::verify_file_sha256(&archive_path, Some(JRE_SHA256)).await
        {
            last_error = error;
            continue;
        }
        if staging.exists() {
            tokio::fs::remove_dir_all(&staging)
                .await
                .map_err(|e| e.to_string())?;
        }
        tokio::fs::create_dir_all(&staging)
            .await
            .map_err(|e| e.to_string())?;
        let archive = archive_path.clone();
        let directory = staging.clone();
        let unpacked = tokio::task::spawn_blocking(move || {
            let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
            Archive::new(GzDecoder::new(file))
                .unpack(directory)
                .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?;
        if let Err(error) = unpacked {
            last_error = format!("Arsip Java tidak dapat diekstrak: {}", error);
            continue;
        }
        let home = find_jre_home(&staging).ok_or("Arsip Java tidak memiliki bin/java")?;
        let java = home.join("bin/java");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&java, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| e.to_string())?;
        }
        if let Err(error) = probe_java(&java).await {
            last_error = error;
            continue;
        }
        if backup.exists() {
            tokio::fs::remove_dir_all(&backup)
                .await
                .map_err(|e| e.to_string())?;
        }
        if target.exists() {
            tokio::fs::rename(&target, &backup)
                .await
                .map_err(|e| e.to_string())?;
        }
        if let Err(error) = tokio::fs::rename(&home, &target).await {
            if backup.exists() {
                let _ = tokio::fs::rename(&backup, &target).await;
            }
            return Err(format!(
                "Runtime tervalidasi tidak dapat diaktifkan: {}",
                error
            ));
        }
        if let Err(error) = probe_java(&target.join("bin/java")).await {
            let _ = tokio::fs::remove_dir_all(&target).await;
            if backup.exists() {
                let _ = tokio::fs::rename(&backup, &target).await;
            }
            return Err(error);
        }
        let _ = tokio::fs::remove_file(&archive_path).await;
        if backup.exists() {
            let _ = tokio::fs::remove_dir_all(&backup).await;
        }
        if staging.exists() {
            let _ = tokio::fs::remove_dir_all(&staging).await;
        }
        status(
            state,
            "java",
            "ready",
            "Runtime Android berhasil dipasang dan diuji jalankan",
        );
        return Ok(());
    }
    Err(format!(
        "Runtime belum siap setelah dua percobaan: {}",
        last_error
    ))
}

fn find_jre_home(root: &Path) -> Option<std::path::PathBuf> {
    if root.join("bin/java").is_file() {
        return Some(root.to_path_buf());
    }
    std::fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.join("bin/java").is_file())
}
