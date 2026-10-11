#!/system/bin/sh
# ==============================================================================
# YouTube RVX — Ultra-Thin POSIX Bridge to Native Rust Core
# 100% Compatible with Magisk / KernelSU / APatch / Turunannya
# ==============================================================================

MODPATH=${0%/*}
[ -d "$MODPATH/app" ] || MODPATH="/data/adb/modules/YouTube-RVX"

# Execute Native Rust Core if compiled binary is present
if [ -f "$MODPATH/bin/rvx-daemon" ]; then
	chmod 755 "$MODPATH/bin/rvx-daemon" 2>/dev/null
	exec "$MODPATH/bin/rvx-daemon" uninstall --modpath "$MODPATH" "$@"
fi

# Fallback POSIX Routine (Used only if native binary is missing)
PKGNAME=com.google.android.youtube
grep "$PKGNAME" /proc/mounts 2>/dev/null | while read -r LINE; do
	MOUNT_POINT=$(echo "$LINE" | awk '{print $2}')
	[ -n "$MOUNT_POINT" ] && umount -l "$MOUNT_POINT" 2>/dev/null
done

am force-stop "$PKGNAME" 2>/dev/null