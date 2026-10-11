#!/system/bin/sh
# ==============================================================================
# YouTube RVX — Ultra-Thin POSIX Bridge to Native Rust Core
# 100% Compatible with Magisk / KernelSU / APatch / Turunannya
# ==============================================================================

MODPATH=${0%/*}
[ -d "$MODPATH" ] || MODPATH="."

# Execute Native Rust Core if compiled binary is present
if [ -f "$MODPATH/bin/rvx-daemon" ]; then
	chmod 755 "$MODPATH/bin/rvx-daemon" 2>/dev/null
	exec "$MODPATH/bin/rvx-daemon" install --modpath "$MODPATH" ${BOOTMODE:+--bootmode "$BOOTMODE"} "$@"
fi

# Fallback POSIX Routine (Used only if native binary is missing)
if [ "$BOOTMODE" = "false" ] || [ -z "$BOOTMODE" ]; then
	ui_print "- Installing through TWRP is not supported"
	ui_print "- Install this module via Magisk / KernelSU / APatch Manager"
	abort "- Aborting installation !!"
fi

PKGNAME=com.google.android.youtube
APPNAME="YouTube"

stock_path=$(pm path $PKGNAME 2>/dev/null | grep base | sed 's/package://g')
[ -n "$stock_path" ] && umount -l "$stock_path" 2>/dev/null

if [ -d "$MODPATH/youtube" ] && [ -n "$(ls "$MODPATH/youtube"/*.apk 2>/dev/null)" ]; then
	ui_print "- Installing Stock YouTube..."
	SESSION=$(pm install-create -d 2>/dev/null | grep -oE '[0-9]+')
	if [ -n "$SESSION" ]; then
		for APK in "$MODPATH/youtube"/*.apk; do
			[ -f "$APK" ] || continue
			pm install-write "$SESSION" "$(basename "$APK")" "$APK" >/dev/null 2>&1
		done
		pm install-commit "$SESSION" >/dev/null 2>&1
	fi
	mkdir -p "$MODPATH/ori"
	mv "$MODPATH/youtube"/* "$MODPATH/ori/" 2>/dev/null
	rm -rf "$MODPATH/youtube"
fi

if ! dumpsys package $PKGNAME 2>/dev/null | grep path >/dev/null 2>&1; then
	ui_print "- $APPNAME app is not installed"
	abort "- Aborting installation !!"
fi

STOCKAPPVER=$(dumpsys package $PKGNAME 2>/dev/null | grep versionName | cut -d= -f 2 | sed -n '1p')
[ -f "$MODPATH/module.prop" ] && RVAPPVER=$(grep '^version=' "$MODPATH/module.prop" | cut -d= -f2 | sed 's/^v//')

if [ -n "$STOCKAPPVER" ] && [ -n "$RVAPPVER" ] && [ "$STOCKAPPVER" != "$RVAPPVER" ]; then
	ui_print "- Version Mismatch: Installed $STOCKAPPVER != Module $RVAPPVER"
	abort "- Aborting installation !!"
fi

mkdir -p "$MODPATH/app"
PATCHED_APK=$(ls "$MODPATH"/*.apk 2>/dev/null | head -n 1)
[ -n "$PATCHED_APK" ] && [ -f "$PATCHED_APK" ] && mv "$PATCHED_APK" "$MODPATH/app/${APPNAME}Revanced-${RVAPPVER}.apk"

STOCKAPK=$(pm path $PKGNAME 2>/dev/null | grep base | cut -d ":" -f2)
RVAPK="$MODPATH/app/${APPNAME}Revanced-${RVAPPVER}.apk"

if [ -f "$RVAPK" ] && [ -n "$STOCKAPK" ]; then
	chmod 644 "$RVAPK"
	chown system:system "$RVAPK" 2>/dev/null
	chcon u:object_r:apk_data_file:s0 "$RVAPK" 2>/dev/null
	mount -o bind "$RVAPK" "$STOCKAPK"
	am force-stop "$PKGNAME" 2>/dev/null
fi

[ -d "$MODPATH/bin" ] && chmod 755 "$MODPATH/bin"/* 2>/dev/null
[ -d "$MODPATH/webroot" ] && chmod 644 "$MODPATH/webroot"/* 2>/dev/null

ui_print "- Installation Successful !!"
am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity >/dev/null 2>&1
