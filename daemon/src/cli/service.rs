#[allow(unused_imports, dead_code)]
use std::path::{Path, PathBuf};
#[allow(unused_imports, dead_code)]
use std::time::Duration;
#[allow(unused_imports, dead_code)]
use tokio::time::sleep;
#[allow(unused_imports, dead_code)]
use crate::utils::run_shell_command;

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

        // 3. Mount YouTube RVX
        mount_youtube_app(&modpath).await?;

        // 4. Ensure background daemon is running
        start_background_daemon(&modpath).await;

        // 5. Post system ready notification
        let _ = run_shell_command(
            "su -lp 2000 -c \"cmd notification post -S bigtext -t 'YouTube RVX' tag '✅ YouTube RVX is ready to use...'\" >/dev/null 2>&1"
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
async fn mount_youtube_app(modpath: &Path) -> anyhow::Result<()> {
    let app_dir = modpath.join("app");
    let mut rv_apk: Option<PathBuf> = None;

    if app_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(&app_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let p = entry.path();
                if let Some(ext) = p.extension() {
                    if ext == "apk" {
                        rv_apk = Some(p);
                        break;
                    }
                }
            }
        }
    }

    let rv_apk = match rv_apk {
        Some(p) => p,
        None => {
            tracing::warn!("⚠️ [Service] No patched APK found in {}", app_dir.display());
            return Ok(());
        }
    };

    let stock_ver = run_shell_command(&format!("dumpsys package {} | grep versionName | cut -d= -f2 | head -n1", PKG_NAME))
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    let rv_file_name = rv_apk.file_name().unwrap_or_default().to_string_lossy();
    let rv_ver = rv_file_name
        .trim_end_matches(".apk")
        .split('-')
        .nth(1)
        .unwrap_or("")
        .to_string();

    // Check version mismatch
    if !stock_ver.is_empty() && !rv_ver.is_empty() && stock_ver != rv_ver {
        let ori_dir = modpath.join("ori");
        if ori_dir.exists() {
            tracing::info!("🔄 [Service] Version mismatch (stock: {}, target: {}). Reinstalling base APK...", stock_ver, rv_ver);
            if let Ok(mut entries) = tokio::fs::read_dir(&ori_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let p = entry.path();
                    if p.extension().map_or(false, |ext| ext == "apk") {
                        let _ = run_shell_command(&format!("pm install -r -d \"{}\"", p.display())).await;
                    }
                }
            }
        }
    }

    let stock_apk = run_shell_command(&format!("pm path {} | grep base | cut -d: -f2 | head -n1", PKG_NAME))
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    if stock_apk.is_empty() {
        tracing::error!("❌ [Service] Failed to find base APK path for {}", PKG_NAME);
        return Ok(());
    }

    tracing::info!("🔗 [Service] Bind mounting RVX APK to {}", stock_apk);
    let _ = run_shell_command(&format!("chcon u:object_r:apk_data_file:s0 \"{}\"", rv_apk.display())).await;
    let mount_cmd = format!("mount -o bind \"{}\" \"{}\"", rv_apk.display(), stock_apk);
    let _ = run_shell_command(&mount_cmd).await;
    let _ = run_shell_command(&format!("am force-stop {}", PKG_NAME)).await;

    tracing::info!("🎉 [Service] Bind mount applied successfully!");
    Ok(())
}

#[cfg(unix)]
async fn start_background_daemon(modpath: &Path) {
    let daemon_bin = modpath.join("bin").join("rvx-daemon");
    if daemon_bin.exists() {
        let check_running = run_shell_command("pgrep -f rvx-daemon").await;
        let is_running = check_running.map_or(false, |out| !out.trim().is_empty());
        if !is_running {
            tracing::info!("🌐 [Service] Starting rvx-daemon background WebUI on port 8080...");
            let _ = run_shell_command(&format!("chmod 755 \"{}\"", daemon_bin.display())).await;
            let log_file = modpath.join("daemon.log");
            let cmd = format!(
                "nohup \"{}\" server --modpath \"{}\" --port 8080 > \"{}\" 2>&1 &",
                daemon_bin.display(),
                modpath.display(),
                log_file.display()
            );
            let _ = run_shell_command(&cmd).await;
        }
    }
}
