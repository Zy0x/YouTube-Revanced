use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;
use crate::utils::run_shell_command;

const PKG_NAME: &str = "com.google.android.youtube";

pub async fn run_action(modpath: PathBuf) -> anyhow::Result<()> {
    println!("📱 ==========================================");
    println!("  YouTube RVX — Root Manager Action Handler");
    println!("==========================================");

    let base_dir = modpath.join("ori");
    let app_dir = modpath.join("app");

    let mut rv_apk: Option<PathBuf> = None;
    if app_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(&app_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "apk") {
                    rv_apk = Some(p);
                    break;
                }
            }
        }
    }

    let rv_apk = match rv_apk {
        Some(p) => p,
        None => {
            eprintln!("⚠️ ERROR: No patched APK found in {}", app_dir.display());
            return Ok(());
        }
    };

    let stock_ver = run_shell_command(&format!("dumpsys package {} 2>/dev/null | grep versionName | cut -d= -f2 | head -n1", PKG_NAME))
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    let rv_file_name = rv_apk.file_name().unwrap_or_default().to_string_lossy();
    let rv_ver = rv_file_name
        .trim_end_matches(".apk")
        .split('-')
        .nth(1)
        .unwrap_or("Unknown")
        .to_string();

    println!("┌──────────────────────────────────────────┐");
    println!("  Package Name    : {}", PKG_NAME);
    println!("  Current Version : {}", if stock_ver.is_empty() { "Not detected" } else { &stock_ver });
    println!("  Target Version  : {}", rv_ver);
    println!("└──────────────────────────────────────────┘\n");

    let stock_apk = run_shell_command(&format!("pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n1", PKG_NAME))
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    if !stock_ver.is_empty() && !rv_ver.is_empty() && stock_ver != rv_ver && base_dir.exists() {
        println!("🔄 Reinstalling matching base stock APK...");
        if let Ok(mut entries) = tokio::fs::read_dir(&base_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "apk") {
                    let _ = run_shell_command(&format!("pm install -r -d \"{}\"", p.display())).await;
                }
            }
        }
    }

    if !stock_apk.is_empty() {
        println!("🔗 Applying bind mount...");
        let _ = run_shell_command(&format!("chcon u:object_r:apk_data_file:s0 \"{}\"", rv_apk.display())).await;
        let _ = run_shell_command(&format!("mount -o bind \"{}\" \"{}\"", rv_apk.display(), stock_apk)).await;
        let _ = run_shell_command(&format!("am force-stop {}", PKG_NAME)).await;
        println!("🎉 SUCCESS: YouTube RVX mounted and ready! 🚀");
    }

    // Launch daemon WebUI if binary present
    let daemon_bin = modpath.join("bin").join("rvx-daemon");
    if daemon_bin.exists() {
        let is_running = run_shell_command("pgrep -f rvx-daemon")
            .await
            .map_or(false, |out| !out.trim().is_empty());
        if !is_running {
            println!("🌐 Starting RVX Patcher Daemon on port 8080...");
            let _ = run_shell_command(&format!("chmod 755 \"{}\"", daemon_bin.display())).await;
            let log_file = modpath.join("daemon.log");
            let cmd = format!(
                "nohup \"{}\" server --modpath \"{}\" --port 8080 > \"{}\" 2>&1 &",
                daemon_bin.display(),
                modpath.display(),
                log_file.display()
            );
            let _ = run_shell_command(&cmd).await;
            sleep(Duration::from_millis(500)).await;
        }
        println!("📱 Opening RVX WebUI Dashboard (http://127.0.0.1:8080)...");
        let _ = run_shell_command("am start -a android.intent.action.VIEW -d \"http://127.0.0.1:8080\" >/dev/null 2>&1").await;
    }

    println!("⏳ Launching YouTube app...");
    sleep(Duration::from_secs(1)).await;
    let _ = run_shell_command(&format!("am start -n {}/com.google.android.apps.youtube.app.WatchWhileActivity >/dev/null 2>&1", PKG_NAME)).await;

    println!("🙏 Thank you for using YouTube RVX! 🎬");
    Ok(())
}
