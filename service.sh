#!/system/bin/sh

MODPATH=${0%/*}
base="$MODPATH/ori/*.apk"

# Wait till device boot process completes
while [ "$(getprop sys.boot_completed)" != "1" ]; do
	sleep 1
done

# Device online functions
wait_until_login()
{
    # whether in lock screen, tested on Android 7.1 & 10.0
    # in case of other magisk module remounting /data as RW
    while [ "$(dumpsys window policy | grep mInputRestricted=true)" != "" ]; do
        sleep 2
    done
    # we doesn't have the permission to rw "/sdcard" before the user unlocks the screen
    while [ ! -d "/sdcard/Android" ]; do
        sleep 2
    done
}
#wait_until_login

# Detect Root
if [ -e /data/local/tmp/magisk ]; then
    sleep 60
else
    sleep 3
fi

# Mounting
PKGNAME=com.google.android.youtube
STOCKAPPVER=$(dumpsys package $PKGNAME | grep versionName | cut -d "=" -f 2 | sed -n '1p')
RVAPPVER=$(basename /data/adb/modules/YouTube-RVX/app/YouTube* .apk | cut -d "-" -f 2)

if [ "$STOCKAPPVER" = "$RVAPPVER" ]
then
	STOCKAPK=$(pm path $PKGNAME | grep base | cut -d ":" -f2)
	RVAPK="/data/adb/modules/YouTube-RVX/app/YouTubeRevanced-$RVAPPVER.apk"
	chcon u:object_r:apk_data_file:s0 "$RVAPK"
	mount -o bind "$RVAPK" "$STOCKAPK"
	am force-stop "$PKGNAME"
elif [ "$STOCKAPPVER" != "$RVAPPVER" ]
then
    pm install -r -d $base
    STOCKAPK=$(pm path $PKGNAME | grep base | cut -d ":" -f2)
	RVAPK="/data/adb/modules/YouTube-RVX/app/YouTubeRevanced-$RVAPPVER.apk"
    chcon u:object_r:apk_data_file:s0 "$RVAPK"
    mount -o bind "$RVAPK" "$STOCKAPK"
    am force-stop "$PKGNAME"
fi

su -lp 2000 -c "cmd notification post -S bigtext -t 'YouTube RVX' tag '✅ YouTube RVX already to use...'" >/dev/null 2>&1
