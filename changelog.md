## v2.1.3 (2026-10-11)

### Features & Updates
- **Native Rust On-Device Engine**: Introduced `rvx-daemon`, a lightweight background patcher daemon embedded directly inside Magisk, KernelSU, and APatch root modules.
- **Dual-Engine WebUI**: Easily toggle between On-Device (Local) patching and Cloud (GitHub Actions) dispatch from the web interface.
- **Zero-API Rate-Limit Immunity**: Routed patch manifests through high-speed jsDelivr CDN mirrors and static release channels, eliminating GitHub REST API rate limits (60 req/hr cap).
- **Live Terminal Console**: Real-time log streaming of the Morphe CLI patching process via Server-Sent Events (SSE) directly into an AMOLED dark terminal drawer.
- **Instant Hot-Mount & ZIP Export**: Support for immediate bind-mounting (`mount -o bind`) without rebooting and one-tap flashable module ZIP export to `/sdcard/Download/`.
- **Root Manager Integration**: Enhanced boot lifecycle scripts (`service.sh`), action button (`action.sh`), and added native KernelSU/APatch WebUI bridge (`webroot/index.html`).
- **Automated Cross-Compilation**: Added GitHub Actions workflow to cross-compile the daemon for `aarch64-linux-android`.

## v21.13.164 (2026-09-29)

### Update
- Patched with Revancify Xisr Tool v1.4.6
- Bumped YouTube version to v21.13.164
- Based on [Anddea Patch v4.3.1-dev.1](https://github.com/anddea/revanced-patches/releases/tag/v4.3.1-dev.1) (thanks to Anddea)
- All patch included!
- Check this [Patch Log](https://github.com/Zy0x/YouTube-Revanced/blob/main/patch_log.txt) if you want

### Fix & Problem
- For Non-Root Devices, If you encounter a "Playback ID: XXXXX" error or experience problems while seeking video, try going to RVX - Misc and disabling the PoToken Provider, then spoofing the video stream with another client.
- For other fixes & issues, read [here](https://github.com/Zy0x/YouTube-Revanced/tree/main#%EF%B8%8F-fix--problem)

`Note: Always Read README.MD first!` 

