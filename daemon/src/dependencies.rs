use crate::state::AppState;
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tokio::process::Command;

type Fingerprint = Vec<Option<(u64, std::time::SystemTime)>>;
type Verified = HashMap<String, (Fingerprint, bool)>;
static VERIFIED: OnceLock<Mutex<Verified>> = OnceLock::new();
fn fingerprint(kind: &str, path: &Path) -> Fingerprint {
    let mut paths = vec![path.to_path_buf()];
    if kind == "java" {
        if let Some(home) = path.parent().and_then(Path::parent) {
            paths.push(home.join("lib/server/libjvm.so"));
        }
    }
    paths
        .iter()
        .map(|path| {
            std::fs::metadata(path)
                .ok()
                .and_then(|m| Some((m.len(), m.modified().ok()?)))
        })
        .collect()
}
fn remember(kind: &str, path: &Path, valid: bool) {
    if let Ok(mut cache) = VERIFIED.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        if cache.len() > 128 {
            cache.clear();
        }
        cache.insert(
            format!("{}:{}", kind, path.display()),
            (fingerprint(kind, path), valid),
        );
    }
}
pub fn last_verified(kind: &str, path: &Path) -> bool {
    VERIFIED
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|cache| cache.get(&format!("{}:{}", kind, path.display())).cloned())
        .is_some_and(|(before, valid)| valid && before == fingerprint(kind, path))
}

pub const CLI_SHA256: &str = "679f579b3ad743ac0ca697ef71e57430d00be59411b04494afd1845c43fb79f0";
pub const JRE_SHA256: &str = "e9e711abfc5008e2eee316e8f1002cf2eb4d3aa40be348befb28e36405b2efd2";

pub fn error(dependency: &str, code: &str, message: impl AsRef<str>) -> String {
    format!(
        "DEPENDENCY_ERROR|{}",
        serde_json::json!({ "dependency": dependency, "code": code, "message": message.as_ref(), "retryable": true })
    )
}

pub fn status(state: &AppState, dependency: &str, phase: &str, message: &str) {
    state.log(format!(
        "DEPENDENCY_STATUS|{}|{}|{}",
        dependency,
        phase,
        message.replace('|', " ")
    ));
}

/// Use the same environment and launcher for probes and the actual patch process.
pub fn java_command(java: &Path) -> Command {
    // Android's app linker namespace reports libraries through /data/data even
    // when the executable was opened through the bind alias /data/user/0.
    // OpenJDK compares these strings before deciding whether to re-exec.
    #[cfg(target_os = "android")]
    let java_alias = {
        use std::os::unix::fs::MetadataExt;
        java.strip_prefix("/data/user/0")
            .ok()
            .map(|suffix| Path::new("/data/data").join(suffix))
            .filter(|alias| {
                std::fs::metadata(java)
                    .ok()
                    .zip(std::fs::metadata(alias).ok())
                    .is_some_and(|(left, right)| {
                        left.dev() == right.dev() && left.ino() == right.ino()
                    })
            })
            .unwrap_or_else(|| java.to_path_buf())
    };
    #[cfg(target_os = "android")]
    let java = java_alias.as_path();
    #[cfg(target_os = "android")]
    let mut command = if !crate::utils::is_root_available() && java.starts_with("/data") {
        let mut command = Command::new(if cfg!(target_pointer_width = "64") {
            "/system/bin/linker64"
        } else {
            "/system/bin/linker"
        });
        command.arg(java);
        command
    } else {
        Command::new(java)
    };
    #[cfg(not(target_os = "android"))]
    let mut command = Command::new(java);
    if let Some(home) = java.parent().and_then(Path::parent) {
        command.env("JAVA_HOME", home);
        #[cfg(unix)]
        {
            let mut libraries = vec![
                // OpenJDK re-execs /proc/self/exe when libjvm is not first.
                // With Android's linker launcher that would execute linker64
                // with Java flags instead of an absolute program path.
                home.join("lib/server"),
                home.join("lib"),
            ];
            if let Some(native) = std::env::var_os("RVX_NATIVE_LIBDIR") {
                libraries.push(native.into());
            }
            if let Some(existing) = std::env::var_os("LD_LIBRARY_PATH") {
                libraries.extend(std::env::split_paths(&existing));
            }
            if let Ok(paths) = std::env::join_paths(libraries) {
                command.env("LD_LIBRARY_PATH", paths);
            }
        }
    }
    command.kill_on_drop(true);
    command
}

pub fn java_major(text: &str) -> Option<u32> {
    let version = text
        .lines()
        .filter_map(|line| line.split_once("version \"").map(|(_, value)| value))
        .next()?
        .split('"')
        .next()?;
    let mut parts = version.split(['.', '-', '+']);
    let major = parts.next()?.parse().ok()?;
    if major == 1 {
        parts.next()?.parse().ok()
    } else {
        Some(major)
    }
}

pub async fn probe_java(java: &Path) -> Result<(), String> {
    let result = probe_java_uncached(java).await;
    remember("java", java, result.is_ok());
    result
}

async fn probe_java_uncached(java: &Path) -> Result<(), String> {
    let mut command = java_command(java);
    let launch = format!("{:?}", command);
    let output = tokio::time::timeout(
        Duration::from_secs(12),
        command
            .arg("-version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "Pemeriksaan Java melewati batas 12 detik".to_string())?
    .map_err(|e| format!("Java tidak dapat dijalankan: {}", e))?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Err(format!(
            "Java gagal dijalankan: {}\nPeluncur: {}",
            text.chars().take(2600).collect::<String>(),
            launch
        ));
    }
    match java_major(&text) {
        Some(major) if major >= 21 => Ok(()),
        Some(major) => Err(format!(
            "Java {} terdeteksi; Morphe memerlukan Java 21 atau lebih baru",
            major
        )),
        None => Err("Versi Java tidak dapat diverifikasi".into()),
    }
}

pub fn validate_zip(path: &Path, required: Option<&str>) -> Result<(), String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip =
        zip::ZipArchive::new(file).map_err(|e| format!("Arsip rusak atau belum lengkap: {}", e))?;
    if zip.is_empty() {
        return Err("Arsip kosong".into());
    }
    if let Some(name) = required {
        zip.by_name(name)
            .map_err(|_| format!("Arsip tidak memiliki {}", name))?;
    }
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if !entry.is_dir() {
            std::io::copy(&mut entry, &mut std::io::sink())
                .map_err(|e| format!("Isi arsip/CRC tidak valid: {}", e))?;
        }
    }
    Ok(())
}

pub async fn cli_valid(path: &Path) -> Result<(), String> {
    let result = async {
        crate::patcher::verify_file_sha256(path, Some(CLI_SHA256)).await?;
        validate_zip(path, Some("META-INF/MANIFEST.MF"))
    }
    .await;
    remember("cli", path, result.is_ok());
    result
}

pub async fn ensure_cli(state: &AppState, java: &Path, jar: &Path) -> Result<(), String> {
    status(
        state,
        "cli",
        "checking",
        "Memverifikasi SHA-256 dan arsip mesin Morphe",
    );
    for attempt in 0..2 {
        if cli_valid(jar).await.is_err() {
            status(
                state,
                "cli",
                if attempt == 0 {
                    "downloading"
                } else {
                    "retrying"
                },
                "Mesin hilang atau rusak; mengunduh ulang versi terverifikasi",
            );
            crate::patcher::download_file(
                &state.client,
                crate::patcher::MORPHE_CLI_URL,
                jar,
                state,
                "cli",
            )
            .await?;
        }
        if let Err(error) = cli_valid(jar).await {
            if attempt == 1 {
                return Err(error);
            }
            let _ = tokio::fs::remove_file(jar).await;
            continue;
        }
        let output = tokio::time::timeout(
            Duration::from_secs(30),
            java_command(java)
                .args(["-jar", &jar.to_string_lossy(), "--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output(),
        )
        .await
        .map_err(|_| "Pemeriksaan mesin Morphe melewati batas waktu".to_string())?
        .map_err(|e| format!("Mesin Morphe tidak dapat dijalankan: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "Uji jalankan Morphe gagal: {}",
                String::from_utf8_lossy(&output.stderr)
                    .chars()
                    .take(1600)
                    .collect::<String>()
            ));
        }
        status(
            state,
            "cli",
            "ready",
            "Mesin Morphe terverifikasi dan dapat dijalankan",
        );
        return Ok(());
    }
    Err("Mesin Morphe belum siap".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn java_versions_are_checked_instead_of_binary_presence() {
        assert_eq!(
            java_major("openjdk version \"21.0.7\" 2025-04-15"),
            Some(21)
        );
        assert_eq!(java_major("openjdk version \"17.0.12\""), Some(17));
        assert_eq!(java_major("java version \"1.8.0_121\""), Some(8));
        assert_eq!(java_major("Permission denied"), None);
        assert_eq!(
            java_major("launcher version 99\nopenjdk version \"21.0.12\""),
            Some(21)
        );
    }
    #[test]
    fn rejects_html_and_truncated_jar_as_cache() {
        let path = std::env::temp_dir().join(format!("rvx-jar-test-{}.jar", std::process::id()));
        std::fs::write(&path, b"<html>download error</html>").unwrap();
        assert!(validate_zip(&path, Some("META-INF/MANIFEST.MF")).is_err());
        std::fs::remove_file(path).unwrap();
    }
}
