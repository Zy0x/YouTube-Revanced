#!/system/bin/sh

# Checking for installation environment
# Abort TWRP installation with error message when user tries to install this module in TWRP

if [ "$BOOTMODE" = "false" ] || [ -z "$BOOTMODE" ]; then
	ui_print "- Installing through TWRP is not supported"
	ui_print "- Install this module via Magisk / KernelSU / APatch Manager"
	abort "- Aborting installation !!"
fi

PKGNAME=com.google.android.youtube
APPNAME="YouTube"

# Unmount Old ReVanced
stock_path=$(pm path $PKGNAME 2>/dev/null | grep base | sed 's/package://g')
if [ -n "$stock_path" ]; then
	umount -l "$stock_path" 2>/dev/null
fi

# Install Stock YouTube if provided in module
if [ -d "$MODPATH/youtube" ] && [ -n "$(ls "$MODPATH/youtube"/*.apk 2>/dev/null)" ]; then
	ui_print "- Installing Stock YouTube..."
	SESSION=$(pm install-create -d 2>/dev/null | grep -oE '[0-9]+')
	if [ -n "$SESSION" ]; then
		for APK in "$MODPATH/youtube"/*.apk; do
			[ -f "$APK" ] || continue
			APK_NAME=$(basename "$APK")
			pm install-write "$SESSION" "$APK_NAME" "$APK" >/dev/null 2>&1
		done
		pm install-commit "$SESSION" >/dev/null 2>&1
	fi
	mkdir -p "$MODPATH/ori"
	mv "$MODPATH/youtube"/* "$MODPATH/ori/" 2>/dev/null
	rm -rf "$MODPATH/youtube"
fi

if ! dumpsys package $PKGNAME 2>/dev/null | grep path >/dev/null 2>&1; then
	ui_print "- $APPNAME app is not installed"
	ui_print "- Please install $APPNAME from Play Store first"
	abort "- Aborting installation !!"
fi

STOCKAPPVER=$(dumpsys package $PKGNAME 2>/dev/null | grep versionName | cut -d= -f 2 | sed -n '1p')

# Read version from module.prop reliably
if [ -f "$MODPATH/module.prop" ]; then
	RVAPPVER=$(grep '^version=' "$MODPATH/module.prop" | cut -d= -f2 | sed 's/^v//')
elif [ -f "module.prop" ]; then
	RVAPPVER=$(grep '^version=' module.prop | cut -d= -f2 | sed 's/^v//')
fi

if [ -n "$STOCKAPPVER" ] && [ -n "$RVAPPVER" ] && [ "$STOCKAPPVER" != "$RVAPPVER" ]; then
	ui_print "- Installed $APPNAME version = $STOCKAPPVER"
	ui_print "- $APPNAME ReVanced version = $RVAPPVER"
	ui_print "- App Version Mismatch !!"
	ui_print "- Please get the module matching the version number."
	abort "- Aborting installation !!"
fi

ui_print "- Patching RVX to YouTube"
ui_print "- Unmounting previous mounts"

grep "$PKGNAME" /proc/mounts | while read -r LINE; do
	echo "$LINE" | grep "$PKGNAME" | cut -d " " -f 2 | sed "s/apk.*/apk/" | xargs -r umount -l 2>/dev/null
done

ui_print "- Setting up module files and permissions"
mkdir -p "$MODPATH/app"
rm -f "$MODPATH/app/$APPNAME"* 2>/dev/null

PATCHED_APK=$(ls "$MODPATH"/*.apk 2>/dev/null | head -n 1)
if [ -n "$PATCHED_APK" ] && [ -f "$PATCHED_APK" ]; then
	mv "$PATCHED_APK" "$MODPATH/app/${APPNAME}Revanced-${RVAPPVER}.apk"
fi

STOCKAPK=$(pm path $PKGNAME 2>/dev/null | grep base | cut -d ":" -f2)
RVAPK="$MODPATH/app/${APPNAME}Revanced-${RVAPPVER}.apk"

if [ -f "$RVAPK" ] && [ -n "$STOCKAPK" ]; then
	chmod 644 "$RVAPK"
	chown system:system "$RVAPK" 2>/dev/null
	chcon u:object_r:apk_data_file:s0 "$RVAPK" 2>/dev/null
	mount -o bind "$RVAPK" "$STOCKAPK"
	am force-stop "$PKGNAME" 2>/dev/null
fi

# Detect Root
ui_print "- Checking environment configuration..."
if [ -e /data/local/tmp/magisk ]; then
	ui_print "- TempRoot detected! Configuring service script..."
	sed -i '/#wait_until_login/s/.*/wait_until_login/' "$MODPATH/service.sh" 2>/dev/null
else
	ui_print "- Full Root detected!"
fi

# Clean legacy leftovers
rm -rf /data/adb/revanced \
	/data/adb/service.d/*revanced*.sh \
	/data/adb/service.d/detach*.sh \
	/data/adb/service.d/*youtube*.sh \
	/data/adb/post-fs-data.d/*revanced*.sh \
	/data/adb/post-fs-data.d/detach*.sh \
	/data/adb/post-fs-data.d/*youtube*.sh \
	/data/local/tmp/revanced* 2>/dev/null

ui_print "- Installation Successful !!"
ui_print "- You can use YouTube ReVanced without rebooting."
ui_print "- Launching YouTube in 3 seconds..."
sleep 3
am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity >/dev/null 2>&1
