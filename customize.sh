#!/system/bin/sh

# Checking for installation environment
# Abort TWRP installation with error message when user tries to install this module in TWRP

if [ $BOOTMODE = false ]; then
	ui_print "- Installing through TWRP Not supported"
	ui_print "- Intsall this module via Magisk Manager"
	abort "- Aborting installation !!"
fi


PKGNAME=com.google.android.youtube
APPNAME="YouTube"

# Unmount Old ReVanced
stock_path=$( pm path $PKGNAME | grep base | sed 's/package://g' )
if [[ '$stock_path' ]] ; then umount -l $stock_path; fi

# Install YoutubeRVX
ui_print "Installing Stock Youtube..."
SESSION=$(pm install-create -d | grep -oE '[0-9]+')
APKS="$(ls $MODPATH/youtube)"
for APK in $APKS; do
pm install-write $SESSION $APK $MODPATH/youtube/$APK > /dev/null
done
pm install-commit $SESSION
mv $MODPATH/youtube $MODPATH/ori/

if ! dumpsys package $PKGNAME | grep path > /dev/null 2>&1
then
	ui_print "- $APPNAME app is not installed"
	ui_print "- Install $APPNAME from PlayStore"
	abort "- Aborting installation !!"
fi

STOCKAPPVER=$(dumpsys package $PKGNAME | grep versionName | cut -d= -f 2 | sed -n '1p')
RVAPPVER=$(grep version= module.prop | sed 's/version=v//')

if [ "$STOCKAPPVER" != "$RVAPPVER" ]
then
	ui_print "- Installed $APPNAME version = $STOCKAPPVER"
	ui_print "- $APPNAME Revanced version = $RVAPPVER"
	ui_print "- App Version Mismatch !!"
	ui_print "- Get the module matching the version number."
	abort "- Aborting installation !!"
fi
ui_print "- Patching RVX to YouTube subscriptions"
ui_print "- Unmounting Previous Mounts"

grep $PKGNAME /proc/mounts | while read -r LINE
do 
	echo "$LINE" | grep "$PKGNAME" | cut -d " " -f 2 | sed "s/apk.*/apk/" | xargs -r umount -l
done

ui_print "- Moving Files and setting permissions"
mkdir -p "$MODPATH/app"
rm $MODPATH/app/"$APPNAME"*
mv $MODPATH/*.apk $MODPATH/app/"$APPNAME"Revanced-"$RVAPPVER".apk
STOCKAPK=$(pm path $PKGNAME | grep base | cut -d ":" -f2)
RVAPK=$MODPATH/app/"$APPNAME"Revanced-"$RVAPPVER".apk
chmod 644 "$RVAPK"
chown system:system "$RVAPK"
chcon u:object_r:apk_data_file:s0 "$RVAPK"
mount -o bind "$RVAPK" "$STOCKAPK"
am force-stop "$PKGNAME"

# Detect Root
ui_print "- Detect FullRoot/TempRoot..."
if [ -e /data/local/tmp/magisk ]; then
    ui_print "Temproot Detected!"
    ui_print "Make configuration..."
    sed -i '/#wait_until_login/s/.*/wait_until_login/' $MODPATH/service.sh
else
    ui_print "Full Root Detected!"
fi

rm -rf /data/adb/revanced
rm -rf /data/adb/service.d/*revanced*.sh
rm -rf /data/adb/service.d/detach*.sh
rm -rf /data/adb/service.d/*youtube*.sh
rm -rf /data/adb/post-fs-data.d/*revanced*.sh
rm -rf /data/adb/post-fs-data.d/detach*.sh
rm -rf /data/adb/post-fs-data.d/*youtube*.sh
rm -rf /data/local/tmp/revanced*

ui_print "- Install Successful !!"

ui_print "- You can use YouTube ReVanced-Extended without reboot as well."
ui_print "- Try to open YouTube (in 3s)..."
sleep 3
am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity
