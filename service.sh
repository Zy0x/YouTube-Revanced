#!/system/bin/sh

MODPATH=${0%/*}
[ -d "$MODPATH/app" ] || MODPATH="/data/adb/modules/YouTube-RVX"

# Wait till device boot process completes
while [ "$(getprop sys.boot_completed)" != "1" ]; do
	sleep 1
done

# Device online functions (for temp-root/early unlock environments)
wait_until_login() {
	while [ "$(dumpsys window policy 2>/dev/null | grep mInputRestricted=true)" != "" ]; do
		sleep 2
	done
	while [ ! -d "/sdcard/Android" ]; do
		sleep 2
	done
}
#wait_until_login

# Root environment sleep delay
if [ -e /data/local/tmp/magisk ]; then
	sleep 60
else
	sleep 3
fi

# Mounting
PKGNAME=com.google.android.youtube
STOCKAPPVER=$(dumpsys package $PKGNAME 2>/dev/null | grep versionName | cut -d "=" -f 2 | sed -n '1p')

RVAPK=$(ls "$MODPATH/app"/YouTubeRevanced-*.apk 2>/dev/null | head -n 1)
RVAPPVER=$(basename "$RVAPK" .apk 2>/dev/null | cut -d "-" -f 2)

if [ -f "$RVAPK" ] && [ -n "$STOCKAPPVER" ] && [ -n "$RVAPPVER" ]; then
	if [ "$STOCKAPPVER" != "$RVAPPVER" ] && [ -d "$MODPATH/ori" ]; then
		for BASE_APK in "$MODPATH/ori"/*.apk; do
			[ -f "$BASE_APK" ] || continue
			pm install -r -d "$BASE_APK" >/dev/null 2>&1
		done
	fi

	STOCKAPK=$(pm path $PKGNAME 2>/dev/null | grep base | cut -d ":" -f2)
	if [ -n "$STOCKAPK" ]; then
		chcon u:object_r:apk_data_file:s0 "$RVAPK" 2>/dev/null
		mount -o bind "$RVAPK" "$STOCKAPK"
		am force-stop "$PKGNAME" 2>/dev/null
	fi
fi

su -lp 2000 -c "cmd notification post -S bigtext -t 'YouTube RVX' tag '✅ YouTube RVX is ready to use...'" >/dev/null 2>&1
