use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

pub fn get_java_binary_in(modpath: &Path, workspace: Option<&Path>) -> Option<PathBuf> {
    if let Some(root) = workspace {
        let workspace_java = root
            .join("runtime")
            .join("jre")
            .join("bin")
            .join(if cfg!(windows) { "java.exe" } else { "java" });
        if workspace_java.exists() {
            return Some(workspace_java);
        }
    }
    // 1. Check local module embedded/downloaded JRE
    let local_java =
        modpath
            .join("jre")
            .join("bin")
            .join(if cfg!(windows) { "java.exe" } else { "java" });
    if local_java.exists() {
        return Some(local_java);
    }

    // 2. Check Android Termux JRE paths
    #[cfg(unix)]
    {
        let termux_candidates = [
            "/data/data/com.termux/files/usr/lib/jvm/java-21-openjdk/bin/java",
            "/data/data/com.termux/files/usr/bin/java",
            "/data/data/com.termux/files/usr/lib/jvm/openjdk-21/bin/java",
            "/data/data/com.termux/files/usr/lib/jvm/openjdk-17/bin/java",
            "/data/adb/modules/rvx_patcher/jre/bin/java",
            "/data/adb/modules/magisk_openjdk/bin/java",
        ];
        for candidate in termux_candidates {
            let p = Path::new(candidate);
            if p.exists() {
                return Some(p.to_path_buf());
            }
        }
    }

    // 3. Check system PATH java
    if let Ok(output) = std::process::Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg("java")
        .output()
    {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout)
                .trim()
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            if !path_str.is_empty() {
                return Some(PathBuf::from(path_str));
            }
        }
    }

    None
}

pub async fn run_shell_command(cmd_str: &str) -> Result<String, String> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(cmd_str);
        c
    } else {
        let mut c = Command::new("/system/bin/sh");
        c.arg("-c").arg(cmd_str);
        c
    };

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    match cmd.output().await {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            if out.status.success() {
                Ok(stdout)
            } else {
                Err(format!(
                    "Exit code {}: {}",
                    out.status.code().unwrap_or(-1),
                    stderr
                ))
            }
        }
        Err(e) => Err(format!("Failed to execute command: {}", e)),
    }
}

#[allow(dead_code)]
pub fn sanitize_path(base: &Path, rel: &str) -> Option<PathBuf> {
    let clean_rel = rel.trim_start_matches('/').trim_start_matches('\\');
    let full = base.join(clean_rel);
    // Prevent directory traversal
    if full.starts_with(base) {
        Some(full)
    } else {
        None
    }
}
