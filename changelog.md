## v2.1.10 (2026-10-12)

### Universal Multi-Application Support Across All `.mpp` Bundles
- **Dynamic Multi-App Manifest Parser**: Expanded engine scope from YouTube-only to ALL supported applications in `.mpp` manifests (including YouTube `com.google.android.youtube`, YouTube Music `com.google.android.apps.youtube.music`, Reddit `com.reddit.frontpage`, Twitter/X `com.twitter.android`, TikTok `com.zhiliaoapp.musically`, and custom packages).
- **Morphe Dynamic App Grid**: Replaced single static card with a dynamic, responsive Morphe application selection grid on Home ("What app do you want to patch?") featuring app-specific gradient themes, Material SVG icons, live patch counts, and recommended versions.
- **Dynamic App Headers & Theming**: Screen 2 (Version Selection) and Screen 3 (Expert Mode Patches) now dynamically adjust application titles, background gradients, icon badges, and compatible version lists based on the selected application.
- **Termux TUI Multi-App Support**: Added an interactive `[1] Select App` menu to Termux CLI Revancify-Xisr mode, allowing rapid switching between all supported applications.
- **Multi-App Native Bind Mount Engine**: Updated Rust `service`, `action`, and `install` subcommands to automatically detect and bind-mount all patched applications present in `$MODPATH/app/` simultaneously without conflicts.
- **Dynamic APK Extraction & Package Info**: Updated daemon endpoints and patch pipeline to extract base stock APKs and query device package info dynamically for any target application via `pm path`.

## v2.1.9 (2026-10-12)

### High-Performance Rust Core & Modular Overhaul
- **Unified Native Rust Multi-Call Engine**: Migrated module lifecycle and heavy operations into Rust CLI subcommands (`service`, `action`, `install`, `uninstall`, `pack`, `server`) inside `rvx-daemon`.
- **Ultra-Thin POSIX `.sh` Bridges**: Rebuilt `customize.sh`, `service.sh`, `action.sh`, and `uninstall.sh` into 2-line POSIX bridges utilizing `exec` to immediately transfer control to the native Rust core with zero execution overhead while retaining 100% compatibility with Magisk, KernelSU, APatch, and all root manager derivatives.
- **In-Memory Flashable Module ZIP Packaging**: Added native multi-threaded DEFLATE compression via the Rust `zip` crate in `rvx-daemon pack`, eliminating dependencies on external shell `zip` utilities.
- **Full Modular Codebase Architecture (< 1,000 Lines Limit)**: Modularized web scripts and stylesheets into cleanly bounded modules (`web/js/state.js`, `web/js/api.js`, `web/js/ui-morphe.js`, `web/js/ui-tui.js`, `web/css/base.css`, `web/css/morphe.css`, `web/css/tui.css`, `web/css/responsive.css`), guaranteeing every file in the codebase is strictly under 1,000 lines.
- **Project File Cleanup**: Removed redundant duplicate data files and legacy cache artifacts.

## v2.1.8 (2026-10-12)

### Local Launcher & Cross-Device Testing
- **One-Click Local Launcher (`start.bat` & `run.bat`)**: Added zero-configuration Windows batch launcher scripts to run the web server and background daemon locally.
- **Auto Binary & Build Management**: Automatically detects existing release/debug binaries or compiles via Cargo if needed.
- **Dynamic LAN & Localhost Discovery**: Automatically resolves host active WiFi/LAN IPv4 address for testing on smartphones and displays desktop localhost links with automatic browser launch.

## v2.1.7 (2026-10-11)

### UI Simplification & Clean Info Architecture
- **Distraction-Free 1:1 Morphe Layout**: Removed the global top bar, extra summary chips, and redundant row badges across Home, Version Selection, Expert Mode Patches, and Progress screens to match `MorpheApp/morphe-manager` 1:1.
- **Dedicated System & App Info `(i)` Sheet**: Consolidated all secondary technical metadata (package name, installed device version, active patch source & channel, enabled patch count, execution engine, and viewport telemetry) into a clean `(i)` modal dialog.
- **Monochrome Material SVG Icons**: Replaced colorful emojis with clean, monochrome Material 3 SVG icons across all toolbars, checkboxes, gear buttons, and bottom sheets.
- **Collapsible Search Drawers**: Hidden version and patch search bars by default behind the circular `[🔍]` icon button so the primary screens remain uncluttered.

## v2.1.6 (2026-10-11)

### Features & Architecture
- **1:1 Authentic Morphe Manager Replica**: Rebuilt the primary GUI to mirror `MorpheApp/morphe-manager` (`Color.kt` `#0B0C10` dark surface, floating bokeh canvas, horizontal red-purple-teal YouTube gradient card, Sources & Settings bottom sheets, and bordered version selector with `👍 Recommended` pills).
- **Morphe Expert Mode Patch Selection**: Implemented the crimson-burgundy YouTube Expert Mode header with live `[▽ 81/86]` enabled-filter toggle, 5-button action pill toolbar (`[✓✓ All]`, `[👍 Golden]`, `[↺ Default]`, `[📋 Presets]`, `[✕ None]`), left circular `✓` checkboxes, and dedicated `[⚙️]` modal option dialogs per patch.
- **Morphe Progress & Telemetry Screen**: Added the coral-red progress bar, 3 real-time telemetry mini-cards (`Memory usage`, `Storage I/O`, `CPU usage`), and structured `[I]` badge patcher logs.
- **1:1 Termux CLI `Revancify-Xisr` TUI Mode**: Added a one-tap `[>_ Termux TUI]` switcher that transforms the interface into an authentic `Xisrr1/Revancify-Xisr` `dialog` TUI (`┌── | Revancify-Xisr | ──┐`, numbered menus, `(*) / [*]` checklists, and full touch + keyboard navigation).

## v2.1.5 (2026-10-11)

### Features & Fixes
- **Clean Morphe Layout Overhaul**: Streamlined Tab 1 and Tab 2 with a compact 2-way execution switcher, unified Target YouTube Version card, 2×2 source cards, and zero-overflow 3-step segmented tab bar across all mobile (`392px–431px`), tablet, and desktop viewports.
- **Collapsible Patch Category Accordions**: Added interactive category accordions with live `active/total` counters and `Expand All / Collapse All` controls for effortless patch navigation.
- **Strict YouTube Package Filtering & Golden Preset Sync**: Filtered patch manifests strictly for `com.google.android.youtube` (81 active patches by default) and synchronized `golden-preset.json` exclusion rules and options.
- **Smart Version Prioritization**: Sorted recommended (`v21.13.164`) and manifest-supported versions to the top of the version grid without nested scroll traps.
- **Short Landscape Split-Rail Polish**: Refined the landscape rail (`≤ 500px` height) for `850×296`, `946×335`, `901×347`, and `723×296` screens with zero vertical clipping.
- **LAN Testing Support**: Enabled optional `0.0.0.0` bind mode for local WiFi device testing alongside no-cache asset headers.

## v2.1.4 (2026-10-11)

### Features & Updates
- **Morphe Redesign & Mobile-First UI**: Overhauled the interface with an authentic Morphe aesthetic, step-based 3-tab navigation (`[1. Source & Version]`, `[2. Patches & Presets]`, `[3. Output & Logs]`), and floating bottom action bar.
- **Adaptive Landscape Split Rails**: Introduced a specialized two-pane landscape layout for short viewports (height < 500px, including Infinix 850×296, Redmi 901×347, and Desktop Quarter 723×296), keeping controls accessible without vertical clipping.
- **Touch-First Card Interactions**: Implemented full-card touch targets (min-height ≥ 48px) with tactile Morphe switches, expandable inline options, and responsive presets toolbar.
- **Target Hero Card with Device Auto-Match**: Added automatic detection of installed YouTube versions via daemon `dumpsys` with one-tap sync to recommended versions.
- **Live Viewport Metrics Indicator**: Built-in real-time screen dimensions and DPR indicator badge for streamlined multi-device verification across mobile, tablet, and desktop viewports.

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

