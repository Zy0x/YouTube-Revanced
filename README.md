<h1 align="center">📺 YouTube ReVanced (RVX) Builder</h1>

<p align="center">
  <b>A patched version of YouTube with ad-free experience, AMOLED dark theme, and premium features powered by Morphe CLI & Anddea Patches</b>  
</p>

‎

## ⚠️ Disclaimer  
> **I only patch for personal use. Please use at your own risk!**  

‎

## 📌 About  
This project provides a **YouTube ReVanced** patch that enables an ad-free experience and premium features **without a subscription**.  
Supports both **ROOT** and **NON-ROOT** versions! 🚀  

‎

## 🔧 Requirements  

<h4>🎭 Root Users 🎭</h4>

✅ **Required:**  
> - **KSU / Magisk / Apatch**  
> - ❌ Do not flash module on **TWRP** or other Custom Recovery!  

🛠️ **Minimum Supported Versions:**  
> - **Magisk**: `24200`  
> - **KSU**: `11425`

---

<h4>🌈 Non-Root Users 🌈</h4>

✅ **Required:**  
> - **GmsCore (MicroG)** → Required for logging into a Google Account  
> - **YouTube ReVanced (Non-Root Version)**  

‎

## 📥 Download GmsCore/MicroG  

| Source | Download Link |
|---|---|
| **MicroG-RE (Morphe)** | 🔗 [Download](https://github.com/MorpheApp/MicroG-RE/releases/latest) |
| **MicroG-RE (Better UI)** | 🔗 [Download](http://github.com/wstxda/microg-re/releases/latest) |
| **GmsCore from ReVanced** | 🔗 [Download](http://github.com/revanced/gmscore/releases/latest) |
| **GmsCore from YT-Advanced** | 🔗 [Download](http://github.com/yt-advanced/gmscore/releases/latest) |

> [!NOTE]
> Recommended to use MicroG-RE (Morphe)!

‎

## 🚀 Installation Guide  

<h3>🎭 Root</h3>  

1. **Download** the [module](https://github.com/Zy0x/YouTube-Revanced/releases/latest) (**Root Version**)  
2. **Install** via **Magisk** / **KSU** / **Apatch**  
3. **Export settings** (Optional)  
4. Enjoy ✨  

### 📱 On-Device WebUI Patcher & Native Rust Core (`rvx-daemon`)
After flashing the module in **KernelSU**, **APatch**, or **Magisk**:
- **KernelSU / APatch**: Tap the **WebUI** button inside the module card.
- **Magisk**: Tap the **Action** button in Magisk to open `http://127.0.0.1:8080` in your browser.
- **Features**:
  - ⚡ **Native Rust Multi-Call Engine**: Zero-overhead service, action, installer, uninstaller, and packager.
  - 💻 **Live Terminal Console**: Real-time streaming Morphe CLI logs.
  - 🚀 **Instant Hot-Mount**: Bind mount patched APK directly without rebooting.
  - 📦 **In-Memory ZIP Packaging**: Hyper-fast module compression using native Rust DEFLATE engine.
  - 💾 **Export Flashable ZIP**: Direct export to `/sdcard/Download/`.  

---

<h3>🌈 Non-Root</h3>  

1. **Install GmsCore ([MicroG](https://github.com/Zy0x/YouTube-Revanced/blob/main/README.md#-download-gmscoremicrog))**
2. **Download & Install [YouTube ReVanced](https://github.com/Zy0x/YouTube-Revanced/releases/latest) (Non-Root Version)**  
3. **Export settings** (Optional)  
4. Enjoy ✨

‎

## 🛠️ Fix & Problem
- If YouTube is having problems (module not working) try to use the action button in magisk (root user).
- There have been many reports from some clients about buffering issues and video not playing (only sound). You can try the previous version or try downloading a different [GMS Core](https://github.com/Zy0x/YouTube-Revanced#-download-gmscoremicrog) . Every user's situation is different!
- FIX Problem for Buffering Issue: Change spoof client — Go to Settings > ReVanced > Misc > Spoof client, and try switching to a different client (e.g., Android VR, iOS, or Android TV). Some clients handle seeking/forwarding better than others.
- For Non-Root, if during installation it displays "Package incompatible" or something similar, try uninstalling the old version first and reinstalling it cleanly.
- New Issue For Non-Root Devices, If you encounter a "Playback ID: XXXXX" error or experience problems while seeking video, try going to RVX - Misc and disabling the PoToken Provider, then spoofing the video stream with another client.

## 🏛️ System Architecture & Developer Guidelines

### 1. High-Performance Native Rust Core + Ultra-Thin POSIX Bridges
Magisk, KernelSU, and APatch root managers strictly require shell entrypoints (`customize.sh`, `service.sh`, `action.sh`, `uninstall.sh`). To combine maximum native execution speed with 100% ecosystem compatibility:
- **Zero-Overhead `exec` Bridges**: Each `.sh` file is an ultra-thin 2-line POSIX bridge that immediately replaces the shell process (`exec "$MODPATH/bin/rvx-daemon" <subcommand>`) in kernel space.
- **Rust Subcommands**:
  - `rvx-daemon service`   : Boot-completed detection, auto-sync version, SELinux labelling, bind mount, background WebUI autostart.
  - `rvx-daemon action`    : Terminal status inspector, fast re-mount, and dashboard launcher.
  - `rvx-daemon install`   : Module installation, stock APK staging, unmounting stale mounts, immediate live-mount without rebooting.
  - `rvx-daemon uninstall` : Clean mount detachment and stock app restoration.
  - `rvx-daemon pack`      : In-memory flashable module ZIP compression via Rust `zip` crate.
  - `rvx-daemon server`    : Axum + Tokio HTTP/SSE WebUI server.

### 2. Modular Design & Strict < 1000 Lines Limit
To ensure maximum maintainability and prevent code bloat:
- **Strict Line Limit**: All project scripts and code files (`.rs`, `.js`, `.css`, `.sh`, `.bat`, `.py`) **must strictly remain under 1,000 lines of code**.
- **Modular JavaScript**: Split cleanly into `web/js/state.js`, `web/js/api.js`, `web/js/ui-morphe.js`, `web/js/ui-tui.js`, and `web/app.js`.
- **Modular Stylesheets**: Split cleanly into `web/css/base.css`, `web/css/morphe.css`, `web/css/tui.css`, `web/css/responsive.css`, and `web/style.css`.
- **Modular Rust CLI**: Split into `daemon/src/cli/` submodules (`service.rs`, `action.rs`, `install.rs`, `uninstall.rs`, `pack.rs`).

### 3. Universal Multi-Application Support Across All `.mpp` Bundles
The patch engine dynamically discovers and supports **every application** packaged within any `.mpp` patch bundle (including YouTube, YouTube Music, Reddit, Twitter/X, TikTok, and arbitrary custom apps):
- **Universal Manifest Normalization**: Parses and normalizes diverse manifest schemas (Morphe `targets` array, Anddea/Inotia00 package mappings, and ReVanced lists) with automatic package detection.
- **Dynamic Theming & App Cards**: Generates styled Morphe gradient cards and Termux TUI menu items per application with accurate patch counts, target version options, and custom icons.
- **Concurrent Multi-App Magisk Bind Mounts**: Mounts all patched applications present in `$MODPATH/app/` (`YouTubeRevanced.apk`, `YouTubeMusicRevanced.apk`, `RedditRevanced.apk`, etc.) into their respective device base APK locations simultaneously.

## 📜 Sources & References  
- 🔧 [Revancify Tools](https://github.com/decipher3114/Revancify)
- 🔧 [Revancify Xisr Tools](https://github.com/Xisrr1/Revancify-Xisr)
- 📺 [YouTube ReVanced Patches](https://github.com/revanced)  
- 🛠️ [Anddea Patch](https://github.com/anddea/revanced-patches)
- ⚙️ [Morphe CLI](https://github.com/MorpheApp/morphe-cli)
