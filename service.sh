#!/system/bin/sh

# Wait till device boot process completes
while [ "$(getprop sys.boot_completed)" != "1" ]; do
	sleep 1
done

# Detect temproot or fullroot
if [ ! -e /data/local/tmp/magisk ]; then
  sleep 15
else
  sleep 90
fi

PKGNAME=com.google.android.youtube

STOCKAPPVER=$(dumpsys package $PKGNAME | grep versionName | cut -d "=" -f 2 | sed -n '1p')
RVAPPVER=$(basename /data/adb/modules/YouTube-RVX/app/YouTube* .apk | cut -d "-" -f 2)

if [ "$STOCKAPPVER" = "$RVAPPVER" ]
then
	STOCKAPK=$(pm path $PKGNAME | grep base | cut -d ":" -f2)
	RVAPK="/data/adb/modules/YouTube-RVX/app/YouTubeRevanced-$RVAPPVER.apk"
	chcon u:object_r:apk_data_file:s0 "$RVAPK"
	mount -o bind "$RVAPK" "$STOCKAPK"
fi

su -lp 2000 -c "cmd notification post -S bigtext -t 'YouTube RVX' tag '✅ YouTube RVX already to use...'" >/dev/null 2>&1