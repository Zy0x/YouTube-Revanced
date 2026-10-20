use crate::utils::run_shell_command;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;

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

pub async fn run_action(modpath: PathBuf) -> anyhow::Result<()> {
    println!("📱 ==========================================");
    println!("  RVX Manager — Multi-App Action Handler");
    println!("==========================================");

    let app_dir = modpath.join("app");
    let mut mounted_count = 0;

    if app_dir.exists() {
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

                    if !stock_apk.is_empty() {
                        println!("🔗 Mounting {} ({}) -> {}", file_name, pkg, stock_apk);
                        let _ = run_shell_command(&format!(
                            "chcon u:object_r:apk_data_file:s0 \"{}\"",
                            p.display()
                        ))
                        .await;
                        let _ = run_shell_command(&format!(
                            "mount -o bind \"{}\" \"{}\"",
                            p.display(),
                            stock_apk
                        ))
                        .await;
                        let _ = run_shell_command(&format!("am force-stop {}", pkg)).await;
                        mounted_count += 1;
                    } else {
                        println!("⚠️ Target app {} not installed on device.", pkg);
                    }
                }
            }
        }
    }

    if mounted_count > 0 {
        println!(
            "🎉 SUCCESS: {} RVX application(s) mounted! 🚀",
            mounted_count
        );
    } else {
        println!("ℹ️ No patched apps were mounted. Launching WebUI dashboard...");
    }

    // Launch daemon WebUI if binary present
    let daemon_bin = modpath.join("bin").join("rvx-daemon");
    if daemon_bin.exists() {
        let port: u16 = std::fs::read_to_string(modpath.join(".daemon_port"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(8088);

        let is_running = run_shell_command("pgrep -f rvx-daemon")
            .await
            .map_or(false, |out| !out.trim().is_empty());
        if !is_running {
            println!("🌐 Starting RVX Patcher Daemon on port {}...", port);
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
            sleep(Duration::from_millis(500)).await;
        }

        // Re-read active port in case auto-hunting selected a different port
        let active_port: u16 = std::fs::read_to_string(modpath.join(".daemon_port"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(port);

        println!(
            "📱 Opening RVX WebUI Dashboard (http://127.0.0.1:{})...",
            active_port
        );
        let _ = run_shell_command(&format!(
            "am start -a android.intent.action.VIEW -d \"http://127.0.0.1:{}\" >/dev/null 2>&1",
            active_port
        ))
        .await;
    }

    println!("🙏 Thank you for using RVX Multi-App Module! 🎬");
    Ok(())
}
