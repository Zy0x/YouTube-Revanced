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
	exec "$MODPATH/bin/rvx-daemon" service --modpath "$MODPATH" "$@"
fi

# Fallback POSIX Routine (Used only if native binary is missing)
while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done
[ -e /data/local/tmp/magisk ] && sleep 60 || sleep 3

PKGNAME=com.google.android.youtube
STOCKAPPVER=$(dumpsys package $PKGNAME 2>/dev/null | grep versionName | cut -d "=" -f 2 | sed -n '1p')
RVAPK=$(ls "$MODPATH/app"/YouTubeRevanced-*.apk 2>/dev/null | head -n 1)
RVAPPVER=$(basename "$RVAPK" .apk 2>/dev/null | cut -d "-" -f 2)

if [ -f "$RVAPK" ] && [ -n "$STOCKAPPVER" ] && [ -n "$RVAPPVER" ]; then
	if [ "$STOCKAPPVER" != "$RVAPPVER" ] && [ -d "$MODPATH/ori" ]; then
		for BASE_APK in "$MODPATH/ori"/*.apk; do
			[ -f "$BASE_APK" ] && pm install -r -d "$BASE_APK" >/dev/null 2>&1
		done
	fi
	STOCKAPK=$(pm path $PKGNAME 2>/dev/null | grep base | cut -d ":" -f2)
	if [ -n "$STOCKAPK" ]; then
		chcon u:object_r:apk_data_file:s0 "$RVAPK" 2>/dev/null
		mount -o bind "$RVAPK" "$STOCKAPK"
		am force-stop "$PKGNAME" 2>/dev/null
	fi
fi

if [ -f "$MODPATH/bin/rvx-daemon" ]; then
	chmod 755 "$MODPATH/bin/rvx-daemon"
	killall -9 rvx-daemon 2>/dev/null
	nohup "$MODPATH/bin/rvx-daemon" server --modpath "$MODPATH" --port 8080 > "$MODPATH/daemon.log" 2>&1 &
fi

su -lp 2000 -c "cmd notification post -S bigtext -t 'YouTube RVX' tag '✅ YouTube RVX is ready to use...'" >/dev/null 2>&1
