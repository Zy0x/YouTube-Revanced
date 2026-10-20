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
- **Magisk**: Tap the **Action** button in Magisk to open `http://127.0.0.1:8088` in your browser.
- **Features**:
  - ⚡ **Native Rust Multi-Call Engine**: Zero-overhead service, action, installer, uninstaller, and packager.
  - 💻 **Live Terminal Console**: Real-time streaming Morphe CLI logs.
  - 🚀 **Instant Hot-Mount**: Bind mount patched APK directly without rebooting.
  - 📦 **In-Memory ZIP Packaging**: Hyper-fast module compression using native Rust DEFLATE engine.
  - 💾 **Export Flashable ZIP**: Direct export to `/sdcard/Download/`.  

### 🌐 Universal single-file WebUI

Run `node tools/build-single-html.mjs` to generate `web/rvx-local.html`. The resulting file embeds the UI, styles, source registry, application catalog, and presets so it can be stored and opened as one local HTML file. Root patching continues through the module daemon. Browser-only APK patching requires the Morphe patch engine to be ported from Kotlin/JVM to WebAssembly; the single-file UI does not claim patch completion until that engine is available.

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

‎

## 📜 Sources & References  
- 🔧 [Revancify Tools](https://github.com/decipher3114/Revancify)
- 🔧 [Revancify Xisr Tools](https://github.com/Xisrr1/Revancify-Xisr)
- 📺 [YouTube ReVanced Patches](https://github.com/revanced)  
- 🛠️ [Anddea Patch](https://github.com/anddea/revanced-patches)
- ⚙️ [Morphe CLI](https://github.com/MorpheApp/morphe-cli)
