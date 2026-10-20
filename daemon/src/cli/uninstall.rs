use crate::utils::run_shell_command;
use std::path::PathBuf;

const PKG_NAME: &str = "com.google.android.youtube";

pub async fn run_uninstall(modpath: PathBuf) -> anyhow::Result<()> {
    println!("🧹 [Uninstall] Cleaning YouTube RVX mounts and services...");
    let _ = modpath;

    if let Ok(mounts) = tokio::fs::read_to_string("/proc/mounts").await {
        for line in mounts.lines() {
            if line.contains(PKG_NAME) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let mount_point = parts[1];
                    println!("  Unmounting: {}", mount_point);
                    let _ =
                        run_shell_command(&format!("umount -l \"{}\" 2>/dev/null", mount_point))
                            .await;
                }
            }
        }
    }

    println!("  Restoring stock app state...");
    let _ = run_shell_command(&format!("am force-stop {} 2>/dev/null", PKG_NAME)).await;

    println!("✅ [Uninstall] YouTube RVX unmounted cleanly.");
    Ok(())
}
