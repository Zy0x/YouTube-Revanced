use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;
use crate::utils::run_shell_command;

const PKG_NAME: &str = "com.google.android.youtube";

pub async fn run_install(modpath: PathBuf, bootmode: Option<String>) -> anyhow::Result<()> {
    println!("==========================================");
    println!("  YouTube RVX — Native Module Installer");
    println!("==========================================");

    // 1. Check bootmode
    if let Some(ref bm) = bootmode {
        if bm == "false" {
            eprintln!("- Installing through TWRP is not supported!");
            eprintln!("- Install this module via Magisk / KernelSU / APatch Manager.");
            std::process::exit(1);
        }
    }

    // 2. Unmount previous mounts
    println!("- Unmounting previous mounts...");
    unmount_all_instances().await;

    // 3. Install stock YouTube if provided in module
    let youtube_dir = modpath.join("youtube");
    if youtube_dir.exists() {
        println!("- Installing bundled Stock YouTube...");
        let ori_dir = modpath.join("ori");
        let _ = tokio::fs::create_dir_all(&ori_dir).await;

        if let Ok(mut entries) = tokio::fs::read_dir(&youtube_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "apk") {
                    let _ = run_shell_command(&format!("pm install -r -d \"{}\"", p.display())).await;
                    let target = ori_dir.join(p.file_name().unwrap_or_default());
                    let _ = tokio::fs::rename(&p, &target).await;
                }
            }
        }
        let _ = tokio::fs::remove_dir_all(&youtube_dir).await;
    }

    // 4. Verify installed package
    let is_installed = run_shell_command(&format!("dumpsys package {} 2>/dev/null | grep path", PKG_NAME))
        .await
        .map_or(false, |out| !out.trim().is_empty());

    if !is_installed {
        println!("- Note: YouTube app is not currently installed.");
        println!("- You can patch YouTube, YouTube Music, Reddit, and more from the RVX WebUI.");
    }

    let stock_ver = run_shell_command(&format!("dumpsys package {} 2>/dev/null | grep versionName | cut -d= -f2 | head -n1", PKG_NAME))
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    // 5. Read target version from module.prop
    let mut rv_ver = String::new();
    let prop_file = modpath.join("module.prop");
    if prop_file.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&prop_file).await {
            for line in content.lines() {
                if let Some(v) = line.strip_prefix("version=") {
                    rv_ver = v.trim().trim_start_matches('v').to_string();
                    break;
                }
            }
        }
    }

    if is_installed && !stock_ver.is_empty() && !rv_ver.is_empty() && stock_ver != rv_ver {
        println!("- Installed YouTube version : {}", stock_ver);
        println!("- Module RVX version        : {}", rv_ver);
        println!("- Notice: Version mismatch detected. You can update or match versions via WebUI.");
    }

    // 6. Setup module app files
    println!("- Setting up module files and permissions...");
    let app_dir = modpath.join("app");
    let _ = tokio::fs::create_dir_all(&app_dir).await;

    // Move any root apk in module to app/
    if let Ok(mut entries) = tokio::fs::read_dir(&modpath).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let p = entry.path();
            if p.is_file() && p.extension().map_or(false, |ext| ext == "apk") {
                let fname = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                let target = app_dir.join(fname);
                let _ = tokio::fs::rename(&p, &target).await;
            }
        }
    }

    // 7. Apply instant bind mount for all present APKs
    if let Ok(mut entries) = tokio::fs::read_dir(&app_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let p = entry.path();
            if p.extension().map_or(false, |ext| ext == "apk") {
                let fname = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                let pkg = resolve_pkg_for_apk(&fname);
                let stock_apk = run_shell_command(&format!("pm path {} 2>/dev/null | grep base | cut -d: -f2 | head -n1", pkg))
                    .await
                    .unwrap_or_default()
                    .trim()
                    .to_string();

                if !stock_apk.is_empty() {
                    let _ = run_shell_command(&format!("chmod 644 \"{}\"", p.display())).await;
                    let _ = run_shell_command(&format!("chown system:system \"{}\" 2>/dev/null", p.display())).await;
                    let _ = run_shell_command(&format!("chcon u:object_r:apk_data_file:s0 \"{}\" 2>/dev/null", p.display())).await;
                    let _ = run_shell_command(&format!("mount -o bind \"{}\" \"{}\"", p.display(), stock_apk)).await;
                    let _ = run_shell_command(&format!("am force-stop {}", pkg)).await;
                    println!("- Bind mounted {} successfully.", fname);
                }
            }
        }
    }

    // 8. Clean legacy leftovers
    let _ = run_shell_command("rm -rf /data/adb/revanced /data/adb/service.d/*revanced*.sh /data/adb/service.d/*youtube*.sh /data/adb/post-fs-data.d/*revanced*.sh 2>/dev/null").await;

    // 9. Permissions for bin and webroot
    let bin_dir = modpath.join("bin");
    if bin_dir.exists() {
        let _ = run_shell_command(&format!("chmod 755 \"{}\"/* 2>/dev/null", bin_dir.display())).await;
    }
    let webroot_dir = modpath.join("webroot");
    if webroot_dir.exists() {
        let _ = run_shell_command(&format!("chmod 644 \"{}\"/* 2>/dev/null", webroot_dir.display())).await;
    }

    println!("- Installation Successful !!");
    println!("- Patched applications can be used without rebooting.");
    if is_installed {
        println!("- Launching YouTube...");
        sleep(Duration::from_secs(1)).await;
        let _ = run_shell_command(&format!("am start -n {}/com.google.android.apps.youtube.app.WatchWhileActivity >/dev/null 2>&1", PKG_NAME)).await;
    }

    Ok(())
}

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

async fn unmount_all_instances() {
    if let Ok(mounts) = tokio::fs::read_to_string("/proc/mounts").await {
        for line in mounts.lines() {
            if line.contains("com.google.android.youtube") || line.contains("revanced") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let mount_point = parts[1];
                    let _ = run_shell_command(&format!("umount -l \"{}\" 2>/dev/null", mount_point)).await;
                }
            }
        }
    }
}
