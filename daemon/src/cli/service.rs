#[allow(unused_imports, dead_code)]
use crate::utils::run_shell_command;
#[allow(unused_imports, dead_code)]
use std::path::{Path, PathBuf};
#[allow(unused_imports, dead_code)]
use std::time::Duration;
#[allow(unused_imports, dead_code)]
use tokio::time::sleep;

#[allow(dead_code)]
const PKG_NAME: &str = "com.google.android.youtube";

pub async fn run_service(modpath: PathBuf) -> anyhow::Result<()> {
    tracing::info!("🚀 [Service] Initializing YouTube RVX Boot Service...");
    tracing::info!("  Module Path: {}", modpath.display());

    #[cfg(unix)]
    {
        // 1. Wait until device boot completes
        wait_for_boot_completed().await;

        // 2. TempRoot vs FullRoot delay
        if Path::new("/data/local/tmp/magisk").exists() {
            tracing::info!("  TempRoot detected, waiting 60s for storage stability...");
            sleep(Duration::from_secs(60)).await;
        } else {
            sleep(Duration::from_secs(3)).await;
        }

        // 3. Mount all patched RVX apps
        mount_all_patched_apps(&modpath).await?;

        // 4. Ensure background daemon is running
        start_background_daemon(&modpath).await;

        // 5. Post system ready notification
        let _ = run_shell_command(
            "su -lp 2000 -c \"cmd notification post -S bigtext -t 'RVX Modules' tag '✅ RVX Patched Apps are ready to use...'\" >/dev/null 2>&1"
        ).await;
    }

    #[cfg(not(unix))]
    {
        tracing::info!("ℹ️ [Service] Non-Android host detected: simulated service boot complete.");
        let _ = modpath;
    }

    tracing::info!("✅ [Service] Boot lifecycle finished successfully.");
    Ok(())
}

#[cfg(unix)]
async fn wait_for_boot_completed() {
    tracing::info!("⏳ [Service] Waiting for Android boot completion...");
    loop {
        if let Ok(res) = run_shell_command("getprop sys.boot_completed").await {
            if res.trim() == "1" {
                tracing::info!("  sys.boot_completed is 1.");
                break;
            }
        }
        sleep(Duration::from_secs(1)).await;
    }
}

#[cfg(unix)]
fn resolve_pkg_for_apk(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("music") || lower.contains("ytmusic") {
        "com.google.android.apps.youtube.music".to_string()
    } else if lower.contains("youtube") {
        "com.google.android.youtube".to_string()
    } else if lower.contains("reddit") {
        "com.reddit.frontpage".to_string()
    } else if lower.contains("twitter") {
        "com.twitter.android".to_string()
    } else if lower.contains("tiktok") {
        "com.zhiliaoapp.musically".to_string()
    } else if name.starts_with("com.") {
        name.trim_end_matches(".apk").to_string()
    } else {
        "com.google.android.youtube".to_string()
    }
}

#[cfg(unix)]
async fn mount_all_patched_apps(modpath: &Path) -> anyhow::Result<()> {
    let app_dir = modpath.join("app");
    if !app_dir.exists() {
        tracing::warn!(
            "⚠️ [Service] No app directory found at {}",
            app_dir.display()
        );
        return Ok(());
    }

    let mut mounted_count = 0;
    if let Ok(mut entries) = tokio::fs::read_dir(&app_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let p = entry.path();
            if p.extension().map_or(false, |ext| ext == "apk") {
                let file_name = p
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let pkg = resolve_pkg_for_apk(&file_name);

                let stock_apk = run_shell_command(&format!(
                    "pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n1",
                    pkg
                ))
                .await
                .unwrap_or_default()
                .trim()
                .to_string();

                if stock_apk.is_empty() {
                    tracing::warn!(
                        "⚠️ [Service] Target app {} not installed on device, skipping mount.",
                        pkg
                    );
                    continue;
                }

                tracing::info!(
                    "🔗 [Service] Bind mounting RVX APK ({}) to {}",
                    file_name,
                    stock_apk
                );
                let _ = run_shell_command(&format!(
                    "chcon u:object_r:apk_data_file:s0 \"{}\"",
                    p.display()
                ))
                .await;
                let mount_cmd = format!("mount -o bind \"{}\" \"{}\"", p.display(), stock_apk);
                let _ = run_shell_command(&mount_cmd).await;
                let _ = run_shell_command(&format!("am force-stop {}", pkg)).await;
                mounted_count += 1;
            }
        }
    }

    tracing::info!("🎉 [Service] Total mounted applications: {}", mounted_count);
    Ok(())
}

#[cfg(unix)]
async fn start_background_daemon(modpath: &Path) {
    let daemon_bin = modpath.join("bin").join("rvx-daemon");
    if daemon_bin.exists() {
        let check_running = run_shell_command("pgrep -f rvx-daemon").await;
        let is_running = check_running.map_or(false, |out| !out.trim().is_empty());
        if !is_running {
            let port: u16 = std::fs::read_to_string(modpath.join(".daemon_port"))
                .ok()
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(8088);
            tracing::info!(
                "🌐 [Service] Starting rvx-daemon background WebUI on port {}...",
                port
            );
            let _ = run_shell_command(&format!("chmod 755 \"{}\"", daemon_bin.display())).await;
            let log_file = modpath.join("daemon.log");
            let cmd = format!(
                "nohup \"{}\" server --modpath \"{}\" --port {} > \"{}\" 2>&1 &",
                daemon_bin.display(),
                modpath.display(),
                port,
                log_file.display()
            );
            let _ = run_shell_command(&cmd).await;
        }
    }
}
