#!/system/bin/sh

MODPATH=${0%/*}
[ -d "$MODPATH/app" ] || MODPATH="/data/adb/modules/YouTube-RVX"

BASE_DIR="$MODPATH/ori"
APP_DIR="$MODPATH/app"

# Get Base & Patched APK
BASE_APK=$(ls "$BASE_DIR"/*.apk 2>/dev/null | head -n 1)
RV_APK=$(ls "$APP_DIR"/YouTubeRevanced-*.apk 2>/dev/null | head -n 1)

# Validation
if [ -z "$BASE_APK" ] || [ -z "$RV_APK" ]; then
    echo "⚠️ ERROR: No APK files found!"
    echo "🔍 Ensure that '$BASE_DIR' and '$APP_DIR' contain APK files."
    exit 1
fi

# App Info
PKGNAME=com.google.android.youtube
STOCKAPPVER=$(dumpsys package $PKGNAME | grep versionName | cut -d "=" -f 2 | sed -n '1p')
RVAPPVER=$(basename "$RV_APK" .apk 2>/dev/null | cut -d "-" -f 2)

# UI Screen
echo "📱 === YouTube App Information === 📱"
sleep 1
echo "┌──────────────────────────────────────────┐"
echo "  Package Name       : $PKGNAME"
echo "  Current Version    : $STOCKAPPVER"
echo "  Target Version     : $RVAPPVER"
echo "└──────────────────────────────────────────┘"
echo ""
sleep 1

# Check Version 
STOCKAPK=$(pm path $PKGNAME | grep base | cut -d ":" -f2)

if [ "$STOCKAPPVER" = "$RVAPPVER" ]; then
    if [ -n "$STOCKAPK" ]; then
        chcon u:object_r:apk_data_file:s0 "$RV_APK"
        mount -o bind "$RV_APK" "$STOCKAPK"
        am force-stop "$PKGNAME"
        echo "🎉 SUCCESS: YouTube RVX is already installed and ready to use! 🚀"
    else
        echo "⚠️ ERROR: Base APK path for $PKGNAME not found!"
        exit 1
    fi
else
    # Reinstall Stock Base then Bind Mount
    pm install -r -d "$BASE_APK"
    STOCKAPK=$(pm path $PKGNAME | grep base | cut -d ":" -f2)
    if [ -n "$STOCKAPK" ]; then
        chcon u:object_r:apk_data_file:s0 "$RV_APK"
        mount -o bind "$RV_APK" "$STOCKAPK"
        am force-stop "$PKGNAME"
        echo "🔄 SUCCESS: YouTube RVX has been reinstalled successfully! ✨"
    else
        echo "⚠️ ERROR: Base APK path for $PKGNAME not found after install!"
        exit 1
    fi
fi

echo "⏳ Opening YouTube in 3 seconds..."
sleep 1
echo "3️⃣"
sleep 1
echo "2️⃣"
sleep 1
echo "1️⃣"
echo "🙏 Thank you for using this script. Enjoy your YouTube RVX experience! 🎬"
sleep 1
am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity >/dev/null 2>&1
