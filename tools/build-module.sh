#!/usr/bin/env bash
set -e

# ==============================================================================
# YouTube RVX Auto-Builder & Packager Script
# ==============================================================================

TARGET_VERSION="${1:-recommended}"
PATCH_SOURCE="${2:-anddea}"
PATCH_TAG="${3:-dev}"
BUILD_MODE="${4:-test}"

echo "=========================================================="
echo "🚀 Memulai Build YouTube RVX"
echo "  Target Versi : $TARGET_VERSION"
echo "  Sumber Patch : $PATCH_SOURCE"
echo "  Patch Tag    : $PATCH_TAG"
echo "  Mode Build   : $BUILD_MODE"
echo "=========================================================="

WORKDIR="$(pwd)"
BUILD_DIR="$WORKDIR/build_out"
mkdir -p "$BUILD_DIR"

# ------------------------------------------------------------------------------
# 1. Unduh Morphe CLI
# ------------------------------------------------------------------------------
echo "📦 Mengunduh Morphe CLI..."
CLI_JAR="$BUILD_DIR/morphe-cli.jar"
if [ ! -f "$CLI_JAR" ]; then
    CLI_RELEASE_URL="https://api.github.com/repos/MorpheApp/morphe-cli/releases"
    CLI_ASSET_URL=$(curl -sL "$CLI_RELEASE_URL" | jq -r '.[0].assets[] | select(.name | endswith(".jar")) | .browser_download_url' | head -n 1)
    if [ -z "$CLI_ASSET_URL" ] || [ "$CLI_ASSET_URL" = "null" ]; then
        echo "⚠️ Gagal menemukan Morphe CLI release via API, menggunakan fallback..."
        CLI_ASSET_URL="https://github.com/MorpheApp/morphe-cli/releases/download/v1.18.0/morphe-desktop-1.18.0-all.jar"
    fi
    echo "  Download CLI dari: $CLI_ASSET_URL"
    curl -sL -o "$CLI_JAR" "$CLI_ASSET_URL"
fi

# ------------------------------------------------------------------------------
# 2. Unduh Patch Bundle (.mpp) & Ambil Manifest
# ------------------------------------------------------------------------------
echo "📦 Mengunduh Patch Bundle ($PATCH_SOURCE)..."
PATCH_MPP="$BUILD_DIR/patches.mpp"
MANIFEST_JSON="$BUILD_DIR/patches-list.json"

if [ "$PATCH_SOURCE" = "anddea" ]; then
    if [ "$PATCH_TAG" = "dev" ]; then
        PATCH_RELEASE_URL="https://api.github.com/repos/anddea/revanced-patches/releases"
        PATCH_ASSET_URL=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.[] | select(.prerelease == true) | .assets[] | select(.name | endswith(".mpp")) | .browser_download_url' | head -n 1)
        TAG_NAME=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.[] | select(.prerelease == true) | .tag_name' | head -n 1)
    else
        PATCH_RELEASE_URL="https://api.github.com/repos/anddea/revanced-patches/releases/latest"
        PATCH_ASSET_URL=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.assets[] | select(.name | endswith(".mpp")) | .browser_download_url' | head -n 1)
        TAG_NAME=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.tag_name')
    fi
    curl -sL -o "$MANIFEST_JSON" "https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json"
else
    # Default fallback
    PATCH_RELEASE_URL="https://api.github.com/repos/MorpheApp/morphe-patches/releases/latest"
    PATCH_ASSET_URL=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.assets[] | select(.name | endswith(".mpp")) | .browser_download_url' | head -n 1)
    TAG_NAME=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.tag_name')
    curl -sL -o "$MANIFEST_JSON" "https://raw.githubusercontent.com/MorpheApp/morphe-patches/refs/heads/main/patches-list.json"
fi

echo "  Tag Patch: $TAG_NAME"
echo "  Download Patch dari: $PATCH_ASSET_URL"
curl -sL -o "$PATCH_MPP" "$PATCH_ASSET_URL"

# ------------------------------------------------------------------------------
# 3. Tentukan Versi YouTube
# ------------------------------------------------------------------------------
if [ "$TARGET_VERSION" = "recommended" ] || [ -z "$TARGET_VERSION" ]; then
    echo "🔍 Mendeteksi versi YouTube rekomendasi dari manifest patch..."
    DETECTED_VERSION=$(jq -r '.patches[] | select(.compatiblePackages."com.google.android.youtube" != null) | .compatiblePackages."com.google.android.youtube"[]' "$MANIFEST_JSON" | sort -V | tail -n 1)
    if [ -n "$DETECTED_VERSION" ] && [ "$DETECTED_VERSION" != "null" ]; then
        TARGET_VERSION="$DETECTED_VERSION"
        echo "  ✅ Versi rekomendasi terdeteksi: $TARGET_VERSION"
    else
        TARGET_VERSION="21.13.164"
        echo "  ℹ️ Menggunakan versi fallback: $TARGET_VERSION"
    fi
fi

echo "🎯 Target Versi Final: $TARGET_VERSION"
TODAY_CODE=$(date +"%Y%m%d")

# ------------------------------------------------------------------------------
# 4. Unduh Stock APK YouTube
# ------------------------------------------------------------------------------
STOCK_APK="$BUILD_DIR/youtube-$TARGET_VERSION.apk"
if [ ! -f "$STOCK_APK" ]; then
    echo "📥 Mengunduh Stock APK YouTube v$TARGET_VERSION..."
    # Di runner CI, jika file disuplai via environment atau cache atau download
    if [ -f "$WORKDIR/stock-youtube.apk" ]; then
        cp "$WORKDIR/stock-youtube.apk" "$STOCK_APK"
    else
        python3 "$WORKDIR/tools/download-stock.py" "$TARGET_VERSION" "$STOCK_APK" || {
            echo "⚠️ Mengunduh via scraper mirror..."
            python3 -m pip install -q requests beautifulsoup4
            python3 "$WORKDIR/tools/download-stock.py" "$TARGET_VERSION" "$STOCK_APK"
        }
    fi
fi

if [ ! -f "$STOCK_APK" ]; then
    echo "❌ Error: Stock APK YouTube v$TARGET_VERSION tidak ditemukan!"
    exit 1
fi

# ------------------------------------------------------------------------------
# 5. Eksekusi Patching Non-Root & Root
# ------------------------------------------------------------------------------
NONROOT_OUT="$BUILD_DIR/YouTube.RVX.v$TARGET_VERSION-NonRoot.apk"
ROOT_PATCHED_APK="$BUILD_DIR/$TARGET_VERSION-Anddea.apk"

# Load Preset Arguments
COMMON_ARGS=()
COMMON_ARGS+=(-e "Disable edge-to-edge display")
COMMON_ARGS+=(-e "Override certificate pinning")
COMMON_ARGS+=(-e "Spoof Wi-Fi connection")
COMMON_ARGS+=(-O "Custom Shorts action buttons:iconType=cairo")
COMMON_ARGS+=(-O "Custom branding for YouTube:appIcon=original")
COMMON_ARGS+=(-O "Custom double tap length:doubleTapLengthArrays=3, 5, 10, 15, 20, 30, 60, 120, 180")
COMMON_ARGS+=(-O "Overlay buttons:iconType=rounded")
COMMON_ARGS+=(-O "Overlay buttons:bottomMargin=2.5dip")
COMMON_ARGS+=(-O "Overlay buttons:changeTopButtons=true")
COMMON_ARGS+=(-O "Settings for YouTube:rvxSettingsLabel=RVX")
COMMON_ARGS+=(-O "Snack bar components:cornerRadius=8.0dip")
COMMON_ARGS+=(-O "Snack bar components:darkThemeBackgroundColor=@color/yt_black3")
COMMON_ARGS+=(-O "SponsorBlock:NewSegmentAlignment=right")
COMMON_ARGS+=(-O "Theme:darkThemeColor=#FF000000")
COMMON_ARGS+=(-O "Theme:lightThemeColor=#FFFFFFFF")
COMMON_ARGS+=(-O "Visual preferences icons for YouTube:settingsMenuIcon=extension")
COMMON_ARGS+=(-O "Visual preferences icons for YouTube:applyToAll=true")

echo "⚡ Memulai proses patching Non-Root..."
java -jar "$CLI_JAR" \
    patch \
    -p "$PATCH_MPP" \
    -o "$NONROOT_OUT" \
    "${COMMON_ARGS[@]}" \
    "$STOCK_APK" > "$BUILD_DIR/patch_nonroot.log" 2>&1 || {
        echo "❌ Gagal mem-patch Non-Root. Log:"
        cat "$BUILD_DIR/patch_nonroot.log" | tail -n 30
        exit 1
    }
echo "✅ Non-Root APK berhasil dibuat: $NONROOT_OUT"

echo "⚡ Memulai proses patching Root..."
java -jar "$CLI_JAR" \
    patch \
    -p "$PATCH_MPP" \
    -o "$ROOT_PATCHED_APK" \
    -e "GmsCore support" \
    -e "Spoof signature" \
    "${COMMON_ARGS[@]}" \
    "$STOCK_APK" > "$BUILD_DIR/patch_root.log" 2>&1 || {
        echo "❌ Gagal mem-patch Root. Log:"
        cat "$BUILD_DIR/patch_root.log" | tail -n 30
        exit 1
    }
echo "✅ Root APK berhasil dibuat: $ROOT_PATCHED_APK"

# ------------------------------------------------------------------------------
# 6. Packaging Modul Magisk/KernelSU/APatch .zip
# ------------------------------------------------------------------------------
echo "📦 Merakit Modul Flashable Magisk/KernelSU/APatch .zip..."
MODULE_DIR="$BUILD_DIR/magisk_package"
rm -rf "$MODULE_DIR"
mkdir -p "$MODULE_DIR/youtube"
mkdir -p "$MODULE_DIR/META-INF/com/google/android"

# Salin script modul
cp "$WORKDIR/customize.sh" "$MODULE_DIR/"
cp "$WORKDIR/service.sh" "$MODULE_DIR/"
cp "$WORKDIR/action.sh" "$MODULE_DIR/"
cp "$WORKDIR/uninstall.sh" "$MODULE_DIR/"
cp "$WORKDIR/META-INF/com/google/android/update-binary" "$MODULE_DIR/META-INF/com/google/android/"
cp "$WORKDIR/META-INF/com/google/android/updater-script" "$MODULE_DIR/META-INF/com/google/android/"

# Salin stock base APK ke folder youtube/
cp "$STOCK_APK" "$MODULE_DIR/youtube/$TARGET_VERSION.apk"

# Salin patched APK ke root modul
cp "$ROOT_PATCHED_APK" "$MODULE_DIR/$TARGET_VERSION-Anddea.apk"

# Buat module.prop dinamis
cat <<EOF > "$MODULE_DIR/module.prop"
id=YouTube-RVX
name=YouTube RVX
version=v$TARGET_VERSION
versionCode=$TODAY_CODE
author=ReVanced Team
description=YouTube RVX-Anddea ($TAG_NAME) magisk module build with ReVanced Builder by Noir (@ThuandMuda)
updateJson=https://raw.githubusercontent.com/Zy0x/YouTube-Revanced/main/update.json
EOF

# Zip modul
MODULE_ZIP="$BUILD_DIR/YouTube.RVX.v$TARGET_VERSION.zip"
rm -f "$MODULE_ZIP"
(cd "$MODULE_DIR" && zip -r9 -q "$MODULE_ZIP" .)

echo "✅ Modul Flashable berhasil dibuat: $MODULE_ZIP"

# ------------------------------------------------------------------------------
# 7. Ringkasan Hasil
# ------------------------------------------------------------------------------
echo "=========================================================="
echo "🎉 Build Selesai dengan Sukses!"
echo "  1. Non-Root APK : $(ls -lh "$NONROOT_OUT" | awk '{print $5}')"
echo "  2. Root Module  : $(ls -lh "$MODULE_ZIP" | awk '{print $5}')"
echo "=========================================================="
