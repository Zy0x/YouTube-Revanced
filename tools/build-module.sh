#!/usr/bin/env bash
set -e

# ==============================================================================
# YouTube RVX Dynamic Cloud Builder
# ==============================================================================

TARGET_VERSION="${1:-recommended}"
PATCH_SOURCE="${2:-anddea}"
PATCH_TAG="${3:-dev}"
BUILD_MODE="${4:-test}"
CONFIG_JSON_PATH="${5:-config/golden-preset.json}"

echo "=========================================================="
echo "🚀 Memulai Build YouTube RVX Dinamis"
echo "  Target Versi : $TARGET_VERSION"
echo "  Sumber Patch : $PATCH_SOURCE"
echo "  Patch Tag    : $PATCH_TAG"
echo "  Mode Build   : $BUILD_MODE"
echo "  Config File  : $CONFIG_JSON_PATH"
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
        CLI_ASSET_URL="https://github.com/MorpheApp/morphe-cli/releases/download/v1.18.0/morphe-desktop-1.18.0-all.jar"
    fi
    echo "  Download CLI dari: $CLI_ASSET_URL"
    curl -sL -o "$CLI_JAR" "$CLI_ASSET_URL"
fi

# ------------------------------------------------------------------------------
# 2. Unduh Patch Bundle (.mpp) & Manifest Sesuai Sumber
# ------------------------------------------------------------------------------
echo "📦 Mengunduh Patch Bundle ($PATCH_SOURCE)..."
PATCH_MPP="$BUILD_DIR/patches.mpp"
MANIFEST_JSON="$BUILD_DIR/patches-list.json"

# Baca metadata sumber dari config/sources.json
SOURCE_REPO=$(jq -r --arg src "$PATCH_SOURCE" '.[] | select(.id == $src) | .repository' "$WORKDIR/config/sources.json")
SOURCE_MANIFEST_URL=$(jq -r --arg src "$PATCH_SOURCE" '.[] | select(.id == $src) | .manifestUrl' "$WORKDIR/config/sources.json")

if [ -z "$SOURCE_REPO" ] || [ "$SOURCE_REPO" = "null" ]; then
    SOURCE_REPO="anddea/revanced-patches"
    SOURCE_MANIFEST_URL="https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json"
fi

echo "  Repository Sumber: $SOURCE_REPO"
echo "  Mengunduh Manifest: $SOURCE_MANIFEST_URL"
curl -sL -o "$MANIFEST_JSON" "$SOURCE_MANIFEST_URL"

if [ "$PATCH_TAG" = "dev" ]; then
    PATCH_RELEASE_URL="https://api.github.com/repos/$SOURCE_REPO/releases"
    PATCH_ASSET_URL=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.[] | select(.prerelease == true) | .assets[] | select(.name | endswith(".mpp")) | .browser_download_url' | head -n 1)
    TAG_NAME=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.[] | select(.prerelease == true) | .tag_name' | head -n 1)
else
    PATCH_RELEASE_URL="https://api.github.com/repos/$SOURCE_REPO/releases/latest"
    PATCH_ASSET_URL=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.assets[] | select(.name | endswith(".mpp")) | .browser_download_url' | head -n 1)
    TAG_NAME=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.tag_name')
fi

# Fallback jika tidak ada prerelease
if [ -z "$PATCH_ASSET_URL" ] || [ "$PATCH_ASSET_URL" = "null" ]; then
    PATCH_RELEASE_URL="https://api.github.com/repos/$SOURCE_REPO/releases/latest"
    PATCH_ASSET_URL=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.assets[] | select(.name | endswith(".mpp")) | .browser_download_url' | head -n 1)
    TAG_NAME=$(curl -sL "$PATCH_RELEASE_URL" | jq -r '.tag_name')
fi

echo "  Patch Release Tag: $TAG_NAME"
echo "  Mengunduh file .mpp..."
curl -sL -o "$PATCH_MPP" "$PATCH_ASSET_URL"

# ------------------------------------------------------------------------------
# 3. Resolusi Versi YouTube Cerdas (Universal Parser)
# ------------------------------------------------------------------------------
if [ "$TARGET_VERSION" = "recommended" ] || [ -z "$TARGET_VERSION" ]; then
    echo "🔍 Mendeteksi versi YouTube rekomendasi secara dinamis..."
    python3 -m pip install -q packaging
    TARGET_VERSION=$(python3 "$WORKDIR/tools/patch_orchestrator.py" detect_version "$MANIFEST_JSON" "21.13.164")
    echo "  ✅ Versi terdeteksi: $TARGET_VERSION"
fi

echo "🎯 Target Versi Final: $TARGET_VERSION"
TODAY_CODE=$(date +"%Y%m%d")

# ------------------------------------------------------------------------------
# 4. Unduh Stock APK YouTube (Multi-Fallback)
# ------------------------------------------------------------------------------
STOCK_APK="$BUILD_DIR/youtube-$TARGET_VERSION.apk"
if [ ! -f "$STOCK_APK" ]; then
    if [ -f "$WORKDIR/stock-youtube.apk" ]; then
        echo "📂 Menggunakan stock APK lokal yang disediakan..."
        cp "$WORKDIR/stock-youtube.apk" "$STOCK_APK"
    else
        echo "📥 Mengunduh Stock APK YouTube v$TARGET_VERSION..."
        python3 "$WORKDIR/tools/download-stock.py" "$TARGET_VERSION" "$STOCK_APK" || {
            echo "❌ Error: Gagal mengunduh Stock APK."
            exit 1
        }
    fi
fi

# ------------------------------------------------------------------------------
# 5. Bangun Argumen Morphe CLI Secara Dinamis dari Config
# ------------------------------------------------------------------------------
NONROOT_ARGS_FILE="$BUILD_DIR/nonroot_args.txt"
ROOT_ARGS_FILE="$BUILD_DIR/root_args.txt"

python3 "$WORKDIR/tools/patch_orchestrator.py" generate_args \
    "$MANIFEST_JSON" \
    "$TARGET_VERSION" \
    "$CONFIG_JSON_PATH" \
    "nonroot" \
    "$NONROOT_ARGS_FILE"

python3 "$WORKDIR/tools/patch_orchestrator.py" generate_args \
    "$MANIFEST_JSON" \
    "$TARGET_VERSION" \
    "$CONFIG_JSON_PATH" \
    "root" \
    "$ROOT_ARGS_FILE"

# ------------------------------------------------------------------------------
# 6. Eksekusi Patching Non-Root & Root
# ------------------------------------------------------------------------------
NONROOT_OUT="$BUILD_DIR/YouTube.RVX.v$TARGET_VERSION-NonRoot.apk"
ROOT_PATCHED_APK="$BUILD_DIR/$TARGET_VERSION-Anddea.apk"

echo "⚡ Memulai proses patching Non-Root..."
mapfile -t NONROOT_ARGS < "$NONROOT_ARGS_FILE"
java -jar "$CLI_JAR" \
    patch \
    -p "$PATCH_MPP" \
    -o "$NONROOT_OUT" \
    "${NONROOT_ARGS[@]}" \
    "$STOCK_APK" > "$BUILD_DIR/patch_nonroot.log" 2>&1 || {
        echo "❌ Gagal mem-patch Non-Root. Log:"
        cat "$BUILD_DIR/patch_nonroot.log" | tail -n 40
        exit 1
    }
echo "✅ Non-Root APK selesai: $NONROOT_OUT"

echo "⚡ Memulai proses patching Root..."
mapfile -t ROOT_ARGS < "$ROOT_ARGS_FILE"
java -jar "$CLI_JAR" \
    patch \
    -p "$PATCH_MPP" \
    -o "$ROOT_PATCHED_APK" \
    "${ROOT_ARGS[@]}" \
    "$STOCK_APK" > "$BUILD_DIR/patch_root.log" 2>&1 || {
        echo "❌ Gagal mem-patch Root. Log:"
        cat "$BUILD_DIR/patch_root.log" | tail -n 40
        exit 1
    }
echo "✅ Root APK selesai: $ROOT_PATCHED_APK"

# ------------------------------------------------------------------------------
# 7. Packaging Modul Magisk/KernelSU/APatch .zip
# ------------------------------------------------------------------------------
echo "📦 Merakit Modul Flashable Magisk/KernelSU/APatch .zip..."
MODULE_DIR="$BUILD_DIR/magisk_package"
rm -rf "$MODULE_DIR"
mkdir -p "$MODULE_DIR/youtube"
mkdir -p "$MODULE_DIR/META-INF/com/google/android"

cp "$WORKDIR/customize.sh" "$MODULE_DIR/"
cp "$WORKDIR/service.sh" "$MODULE_DIR/"
cp "$WORKDIR/action.sh" "$MODULE_DIR/"
cp "$WORKDIR/uninstall.sh" "$MODULE_DIR/"
cp "$WORKDIR/META-INF/com/google/android/update-binary" "$MODULE_DIR/META-INF/com/google/android/"
cp "$WORKDIR/META-INF/com/google/android/updater-script" "$MODULE_DIR/META-INF/com/google/android/"

cp "$STOCK_APK" "$MODULE_DIR/youtube/$TARGET_VERSION.apk"
cp "$ROOT_PATCHED_APK" "$MODULE_DIR/$TARGET_VERSION-Anddea.apk"

cat <<EOF > "$MODULE_DIR/module.prop"
id=YouTube-RVX
name=YouTube RVX
version=v$TARGET_VERSION
versionCode=$TODAY_CODE
author=ReVanced Team
description=YouTube RVX ($TAG_NAME) magisk module build with ReVanced Builder by Noir (@ThuandMuda)
updateJson=https://raw.githubusercontent.com/Zy0x/YouTube-Revanced/main/update.json
EOF

MODULE_ZIP="$BUILD_DIR/YouTube.RVX.v$TARGET_VERSION.zip"
rm -f "$MODULE_ZIP"
(cd "$MODULE_DIR" && zip -r9 -q "$MODULE_ZIP" .)

echo "✅ Modul Flashable selesai: $MODULE_ZIP"

echo "=========================================================="
echo "🎉 Build Berhasil Selesai!"
echo "  Non-Root APK: $(ls -lh "$NONROOT_OUT" | awk '{print $5}')"
echo "  Root Module : $(ls -lh "$MODULE_ZIP" | awk '{print $5}')"
echo "=========================================================="
