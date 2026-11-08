//! Root installation is an explicit operation on one verified build, never every cached APK.
use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
static INSTALL_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn installer_present() -> bool {
    cfg!(target_os = "android")
        && [
            "/system/bin/su",
            "/data/adb/ap/bin/su",
            "/data/adb/magisk/su",
        ]
        .iter()
        .any(|path| Path::new(path).is_file())
}

fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\\''"))
}

pub async fn root_command(script: &str) -> Result<String, String> {
    if !cfg!(target_os = "android") {
        return Err("Pemasangan root hanya tersedia pada Android".into());
    }
    let mut command = if crate::api::storage::runtime_has_root_access() {
        let mut c = Command::new("/system/bin/nsenter");
        c.args(["-t", "1", "-m", "--", "/system/bin/sh", "-c", script]);
        c
    } else {
        let su = [
            "/system/bin/su",
            "/data/adb/ap/bin/su",
            "/data/adb/magisk/su",
        ]
        .into_iter()
        .find(|path| Path::new(path).is_file())
            .ok_or("Akses root belum tersedia untuk aplikasi ini. Pada APatch atau KernelSU, izinkan RVX Patcher di halaman Superuser, lalu buka ulang aplikasi.")?;
        let mut c = Command::new(su);
        c.args(["-M", "-c", script]);
        c
    };
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(90),
        command
            .kill_on_drop(true)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "Pemasangan root melewati batas waktu; periksa izin root".to_string())?
    .map_err(|e| format!("Tidak dapat membuka sesi root: {}", e))?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Err(format!(
            "Operasi root gagal ({}): {}",
            output.status.code().unwrap_or(-1),
            text.trim()
        ));
    }
    Ok(text)
}

pub async fn install(state: &AppState, input: &str) -> Result<serde_json::Value, String> {
    let _guard = INSTALL_LOCK.lock().await;
    if state.is_patching() {
        return Err("Tunggu proses patch selesai sebelum memasang hasil".into());
    }
    let apk = tokio::fs::canonicalize(input)
        .await
        .map_err(|e| format!("APK hasil tidak dapat dibaca: {}", e))?;
    let selection = crate::api::storage::read_storage_selection(state).await;
    let output = selection
        .as_ref()
        .and_then(|v| v.get("outputPath"))
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .unwrap_or_else(|| crate::api::storage::storage_defaults(state).1);
    let mut allowed = false;
    for folder in [state.modpath.join("app"), output] {
        if let Ok(folder) = tokio::fs::canonicalize(folder).await {
            allowed |= apk.starts_with(folder);
        }
    }
    if !allowed || apk.extension().is_none_or(|e| e != "apk") {
        return Err("Pilih APK hasil build dari folder hasil yang disetujui".into());
    }
    let candidate = apk.clone();
    let identity = tokio::task::spawn_blocking(move || crate::apk::inspect_apk(&candidate))
        .await
        .map_err(|e| e.to_string())??;
    if !identity
        .package
        .split('.')
        .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        || !identity
            .version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return Err("Identitas APK tidak valid untuk pemasangan root".into());
    }
    let package = &identity.package;
    let workspace = selection
        .as_ref()
        .and_then(|v| v.get("workspacePath").or_else(|| v.get("storagePath")))
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .unwrap_or_else(|| crate::api::storage::storage_defaults(state).0);
    let original = crate::apk::cache_path(&workspace.join("cache"), package, &identity.version);
    let check_original = original.clone();
    let expected_package = identity.package.clone();
    let expected_version = identity.version.clone();
    tokio::task::spawn_blocking(move || {
        crate::apk::validate_target(&check_original, &expected_package, &expected_version)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("APK asli untuk pemasangan root belum siap: {}", e))?;
    let module = if package == "com.google.android.youtube" {
        "/data/adb/modules/YouTube-RVX".to_string()
    } else {
        format!(
            "/data/adb/modules/rvx_patcher_{}",
            package.replace('.', "_")
        )
    };
    let service = format!(
        r#"#!/system/bin/sh
set -eu
PKG={pkg}
VERSION={version}
APK={installed}
exec 9>"${{APK%/app/*}}/.rvx-mount.lock"
flock -x 9
N=0
until [ "$(getprop sys.boot_completed)" = 1 ]; do
  N=$((N + 1)); [ "$N" -lt 120 ] || exit 1; sleep 2
done
[ -f "$APK" ] || exit 1
CURRENT=$(dumpsys package "$PKG" | sed -n 's/^[[:space:]]*versionName=//p' | head -n 1)
[ "$CURRENT" = "$VERSION" ] || {{ echo 'Versi APK terpasang berubah; patch perlu dibangun ulang'; exit 1; }}
PATHS=$(pm path "$PKG" | sed -n 's/^package://p')
[ "$(printf '%s\n' "$PATHS" | wc -l)" -eq 1 ] || {{ echo 'Pemasangan split tidak dapat di-mount'; exit 1; }}
TARGET=$PATHS
[ -f "$TARGET" ] || exit 1
chcon u:object_r:apk_data_file:s0 "$APK"
if [ "$(stat -c '%d:%i' "$APK")" != "$(stat -c '%d:%i' "$TARGET")" ]; then
  mount -o bind "$APK" "$TARGET"
fi
[ "$(stat -c '%d:%i' "$APK")" = "$(stat -c '%d:%i' "$TARGET")" ] || {{ echo 'Mount tidak terverifikasi'; exit 1; }}
am force-stop "$PKG"
echo "ROOT_INSTALL_VERIFIED|$PKG|$VERSION|$TARGET"
"#,
        pkg = quote(package),
        version = quote(&identity.version),
        installed = quote(&format!("{}/app/YouTubeRevanced.apk", module))
    );
    let service_file = state.modpath.join("tmp/root-install-service.sh");
    tokio::fs::create_dir_all(service_file.parent().unwrap())
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::write(&service_file, &service)
        .await
        .map_err(|e| e.to_string())?;
    // Reuse this project's existing YouTube module, preserving its runtime,
    // signing keys and previous APK/service as rollback files. Other modules
    // and their scripts are never enumerated or changed.
    let script = format!(
        r#"set -eu
[ "$(id -u)" = 0 ] || exit 1
MOD={module}
PKG={package}
ORIGINAL={original}
CURRENT=$(dumpsys package "$PKG" | sed -n 's/^[[:space:]]*versionName=//p' | head -n 1)
COUNT=$(pm path "$PKG" | grep -c '^package:' || true)
if [ "$CURRENT" != '{version}' ] || [ "$COUNT" != 1 ]; then
 echo 'Menyiapkan APK dasar yang sesuai sebelum mount root'
 SIZE=$(stat -c %s "$ORIGINAL")
 INSTALLED=$(pm install -r -d -S "$SIZE" < "$ORIGINAL" 2>&1) || {{ printf '%s\n' "$INSTALLED" >&2; exit 1; }}
 printf '%s\n' "$INSTALLED" | grep -qx Success || {{ printf '%s\n' "$INSTALLED" >&2; exit 1; }}
fi
mkdir -p "$MOD/app" "$MOD/rvx-backup" /data/adb/service.d
cp {source} "$MOD/app/result.next.apk"
chmod 644 "$MOD/app/result.next.apk"
chown system:system "$MOD/app/result.next.apk"
chcon u:object_r:apk_data_file:s0 "$MOD/app/result.next.apk"
STAMP=$(date +%s)
if [ -f "$MOD/app/YouTubeRevanced.apk" ]; then cp -p "$MOD/app/YouTubeRevanced.apk" "$MOD/rvx-backup/$STAMP.apk"; fi
if [ -f "$MOD/service.sh" ]; then cp -p "$MOD/service.sh" "$MOD/rvx-backup/$STAMP-service.sh"; fi
if [ -f /data/adb/service.d/mount_{package}.sh ]; then cp -p /data/adb/service.d/mount_{package}.sh "$MOD/rvx-backup/$STAMP-legacy-mount.sh"; fi
mv "$MOD/app/result.next.apk" "$MOD/app/YouTubeRevanced.apk"
cp {service} "$MOD/service.next.sh"
chmod 755 "$MOD/service.next.sh"
if ! /system/bin/sh "$MOD/service.next.sh"; then
 if [ -f "$MOD/rvx-backup/$STAMP.apk" ]; then cp -p "$MOD/rvx-backup/$STAMP.apk" "$MOD/app/YouTubeRevanced.apk"; fi
 echo 'Pemasangan tidak terverifikasi; APK sebelumnya dipulihkan' >&2
 exit 1
fi
mv "$MOD/service.next.sh" "$MOD/service.sh"
if [ ! -f "$MOD/module.prop" ]; then
 printf '%s\n' 'id=rvx_patcher_{module_id}' 'name=RVX Patcher - {package}' 'version={version}' 'versionCode=1' 'author=RVX Patcher' 'description=APK hasil patch lokal' > "$MOD/module.prop"
fi
touch "$MOD/skip_mount"
rm -f "$MOD/disable"
printf '#!/system/bin/sh\nexec /system/bin/sh %s/service.sh\n' "$MOD" > /data/adb/service.d/mount_{package}.sh
chmod 755 /data/adb/service.d/mount_{package}.sh
"#,
        module = quote(&module),
        source = quote(&apk.to_string_lossy()),
        original = quote(&original.to_string_lossy()),
        service = quote(&service_file.to_string_lossy()),
        module_id = package.replace('.', "_"),
        package = package,
        version = identity.version
    );
    let text = root_command(&script).await?;
    if !text.contains(&format!(
        "ROOT_INSTALL_VERIFIED|{}|{}|",
        package, identity.version
    )) {
        return Err("Sesi root berakhir tanpa bukti pemasangan".into());
    }
    state.log(text.trim());
    let result = serde_json::json!({"success":true,"verified":true,"package":package,"version":identity.version,"module":module,"message":"APK terpasang melalui root dan mount telah diverifikasi"});
    let record = state.modpath.join("config/root-install.json");
    tokio::fs::create_dir_all(record.parent().unwrap())
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::write(record, result.to_string())
        .await
        .map_err(|e| {
            format!(
                "Mount aktif, tetapi catatan pemasangan tidak dapat disimpan: {}",
                e
            )
        })?;
    Ok(result)
}

pub async fn inspect_install(state: &AppState, remove: bool) -> Result<serde_json::Value, String> {
    let _guard = INSTALL_LOCK.lock().await;
    let record_path = state.modpath.join("config/root-install.json");
    let record: serde_json::Value = match tokio::fs::read(&record_path).await {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string())?,
        Err(_) => {
            return Ok(
                serde_json::json!({"mounted":false,"apps":[],"message":"Belum ada pemasangan root yang tercatat"}),
            )
        }
    };
    let package = record["package"]
        .as_str()
        .ok_or("Catatan paket tidak lengkap")?;
    if !package
        .split('.')
        .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
    {
        return Err("Catatan paket tidak valid".into());
    }
    let module = if package == "com.google.android.youtube" {
        "/data/adb/modules/YouTube-RVX".to_string()
    } else {
        format!(
            "/data/adb/modules/rvx_patcher_{}",
            package.replace('.', "_")
        )
    };
    let operation = if remove {
        format!(
            r#"
if [ "$ACTIVE" = 1 ]; then umount "$TARGET"; fi
[ "$(stat -c '%d:%i' "$APK")" != "$(stat -c '%d:%i' "$TARGET")" ] || exit 1
touch "$MOD/disable"
LEGACY=/data/adb/service.d/mount_{package}.sh
if [ -f "$LEGACY" ] && grep -Fq "$MOD/service.sh" "$LEGACY"; then
 mv "$LEGACY" "$MOD/rvx-backup/detached-mount.sh"
fi
am force-stop "$PKG"
echo ROOT_INSTALL_DETACHED
"#
        )
    } else {
        "echo ROOT_INSTALL_ACTIVE=$ACTIVE".into()
    };
    let text = root_command(&format!(r#"set -eu
PKG={pkg}
MOD={module}
APK="$MOD/app/YouTubeRevanced.apk"
TARGET=$(pm path "$PKG" | sed -n 's/^package://p' | head -n 1)
ACTIVE=0
if [ -f "$APK" ] && [ -f "$TARGET" ] && [ "$(stat -c '%d:%i' "$APK")" = "$(stat -c '%d:%i' "$TARGET")" ]; then ACTIVE=1; fi
{operation}
"#, pkg=quote(package), module=quote(&module))).await?;
    if remove {
        if !text.contains("ROOT_INSTALL_DETACHED") {
            return Err("Pelepasan mount belum terverifikasi".into());
        }
        let _ = tokio::fs::remove_file(record_path).await;
        return Ok(
            serde_json::json!({"success":true,"verified":true,"mounted":false,"message":"Mount hasil patch dilepas dan pemasangan boot dinonaktifkan"}),
        );
    }
    let active = text.contains("ROOT_INSTALL_ACTIVE=1");
    Ok(
        serde_json::json!({"mounted":active,"verified":true,"apps":if active { vec![package] } else { vec![] }}),
    )
}

#[cfg(test)]
mod tests {
    #[cfg(not(target_os = "android"))]
    #[tokio::test]
    async fn unsupported_hosts_cannot_report_a_simulated_installation_success() {
        assert!(super::root_command("echo ROOT_INSTALL_VERIFIED")
            .await
            .is_err());
    }
}
