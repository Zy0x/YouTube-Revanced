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
	exec "$MODPATH/bin/rvx-daemon" action --modpath "$MODPATH" "$@"
fi

# Fallback POSIX Routine (Used only if native binary is missing)
PKGNAME=com.google.android.youtube
RV_APK=$(ls "$MODPATH/app"/YouTubeRevanced-*.apk 2>/dev/null | head -n 1)
STOCKAPK=$(pm path $PKGNAME 2>/dev/null | grep base | cut -d ":" -f2)

if [ -f "$RV_APK" ] && [ -n "$STOCKAPK" ]; then
	chcon u:object_r:apk_data_file:s0 "$RV_APK" 2>/dev/null
	mount -o bind "$RV_APK" "$STOCKAPK"
	am force-stop "$PKGNAME" 2>/dev/null
fi

if [ -f "$MODPATH/bin/rvx-daemon" ]; then
	PORT=8088
	[ -f "$MODPATH/.daemon_port" ] && PORT=$(cat "$MODPATH/.daemon_port" 2>/dev/null | tr -d '\r\n')
	if ! pgrep -f "rvx-daemon" >/dev/null 2>&1; then
		chmod 755 "$MODPATH/bin/rvx-daemon"
		nohup "$MODPATH/bin/rvx-daemon" server --modpath "$MODPATH" --port "$PORT" > "$MODPATH/daemon.log" 2>&1 &
		sleep 1
	fi
	[ -f "$MODPATH/.daemon_port" ] && PORT=$(cat "$MODPATH/.daemon_port" 2>/dev/null | tr -d '\r\n')
	am start -a android.intent.action.VIEW -d "http://127.0.0.1:$PORT" >/dev/null 2>&1
fi

am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity >/dev/null 2>&1
