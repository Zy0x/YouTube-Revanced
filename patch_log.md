
Root Access: true
Architecture: arm64-v8a
App: YouTube v20.51.39
CLI: assets/Morphe-CLI-v1.13.1-dev.1.jar
Patches: assets/Anddea/Patches-v4.2.0.mpp
Arguments: -e Disable edge-to-edge display -e Override certificate pinning -e Spoof Wi-Fi connection -e Spoof signature -OpackageName= -OcertificateData= -e Alternative thumbnails -e Ambient mode control -e Bypass URL redirects -e Bypass image region restrictions -e Change form factor -e Change player flyout menu toggles -e Change share sheet -e Change start page -e Custom DPI -e Custom Shorts action buttons -OiconType=cairo -e Custom double tap length -OdoubleTapLengthArrays=3, 5, 10, 15, 20, 30, 60, 120, 180 -e Description components -e Disable QUIC protocol -e Disable forced auto captions -e Disable haptic feedback -e Disable layout updates -e Disable resuming Miniplayer on startup -e Disable resuming Shorts on startup -e Disable sign in to TV popup -e Disable splash animation -e Enable debug logging -e Enable gradient loading screen -e Force original audio -e Force player buttons background -OBackgroundColor=?ytOverlayBackgroundMediumLight -e Fullscreen components -e Hide action buttons -e Hide ads -e Hide comments components -e Hide feed components -e Hide feed flyout menu -e Hide layout components -e Hide player buttons -e Hide player flyout menu -e Hook YouTube Music actions -e Hook download actions -e Miniplayer -e Navigation bar components -e Open links externally -e Overlay buttons -OiconType=rounded -ObottomMargin=2.5dip -OwiderButtonsSpace=false -OchangeTopButtons=true -e Playback in feeds -e Player components -e Reload video -e Remove background playback restrictions -e Remove viewer discretion dialog -e Return YouTube Dislike -e Return YouTube Username -e Sanitize sharing links -e Seekbar components -e Set transcript cookies -e Settings for YouTube -OrvxSettingsLabel=RVX -e Settings menu filter -e Shorts components -e Snack bar components -OcornerRadius=8.0dip -OapplyCornerRadiusToPlaylistBottomBar=false -OdarkThemeBackgroundColor=@color/yt_black3 -OlightThemeBackgroundColor=@color/yt_white3 -OstrokeColor= -e SponsorBlock -ONewSegmentAlignment=right -e Spoof app version -e Spoof video streams -e Spoof watch history -e Swipe controls -e Toolbar components -e Translations for YouTube -OcustomTranslations= -OselectedTranslations=ar, az-rAZ, be-rBY, bg-rBG, cs-rCZ, da-rDK, de-rDE, el-rGR, en-rGB, en-rUS, es-rES, es-rUS, fa-rIR, fil-rPH, fr-rFR, ga-rIE, hu-rHU, id-rID, in, it-rIT, iw-rIL, ja-rJP, ko-rKR, lo-rLA, my-rMM, nl-rNL, pa-rIN, pl-rPL, pt-rBR, ru-rRU, sk-rSK, sv-rSE, ta-rIN, tr-rTR, uk-rUA, ur-rPK, uz-rUZ, vi-rVN, zh-rCN, zh-rTW -OselectedStringResources=af, am, ar, ar-rXB, as, az, b+es+419, b+sr+Latn, be, bg, bn, bs, ca, cs, da, de, el, en-rAU, en-rCA, en-rGB, en-rIN, en-rXA, en-rXC, es, es-rUS, et, eu, fa, fi, fil-rPH, fr, fr-rCA, gl, gu, hi, hr, hu, hy, id, in, is, it, iw, ja, ka, kk, km, kn, ko, ky, lo, lt, lv, mk, ml, mn, mr, ms, my, nb, ne, nl, no, or, pa, pl, pt, pt-rBR, pt-rPT, ro, ru, si, sk, sl, sq, sr, sv, sw, ta, te, th, tl, tr, uk, ur, uz, vi, zh, zh-rCN, zh-rHK, zh-rTW, zu -e Video playback -e Visual preferences icons for YouTube -OsettingsMenuIcon=extension -OapplyToAll=true -e Voice Over Translation -e Wide search bar -e Hide Shorts dimming -e Hide accessibility controls dialog -e Hide shortcuts -Oexplore=false -Osubscriptions=false -Osearch=false -Oshorts=false -e MaterialYou -e Theme -OdarkThemeBackgroundColor=@android:color/black -OlightThemeBackgroundColor=@android:color/white

Logs:

INFO: Morphe data root: /data/data/com.termux/files/home/Revancify-Xisr/assets/morphe-data (JAR-adjacent) 
INFO: Loading patches... 
INFO: Initializing patcher... 
INFO: Filtering patches for com.google.android.youtube v20.51.39... 
INFO: Skipping disabled: Change installer package name (default) 
INFO: Skipping disabled: Change version code (default) 
INFO: Skipping disabled: Custom branding icon for YouTube (default) 
INFO: Skipping disabled: Custom branding name for YouTube (default) 
INFO: Skipping disabled: Custom header for YouTube (default) 
INFO: Skipping disabled: GmsCore support (default) 
INFO: Applying 73 patches... 
INFO: Deleting existing temporary files directory 
INFO: Decoding all resources 
INFO: Sanitizing unpatched strings 
INFO: Escaping strings 
INFO: Executing patches 
INFO: Applied: Alternative thumbnails 
INFO: Applied: Ambient mode control 
INFO: Applied: Bypass URL redirects 
INFO: Applied: Bypass image region restrictions 
INFO: Applied: Change form factor 
INFO: Applied: Change player flyout menu toggles 
INFO: Applied: Change share sheet 
INFO: Applied: Change start page 
INFO: Applied: Custom DPI 
INFO: Custom Shorts action buttons: added 12 drawable aliases, skipped 16 existing aliases. 
INFO: Applied: Custom Shorts action buttons 
INFO: Applied: Custom double tap length 
INFO: Applied: Description components 
INFO: Applied: Disable QUIC protocol 
INFO: Applied: Disable edge-to-edge display 
INFO: Applied: Disable forced auto captions 
INFO: Applied: Disable haptic feedback 
INFO: Applied: Disable layout updates 
INFO: Applied: Disable resuming Miniplayer on startup 
INFO: Applied: Disable resuming Shorts on startup 
INFO: Applied: Disable sign in to TV popup 
INFO: Applied: Disable splash animation 
INFO: Applied: Enable debug logging 
INFO: Applied: Enable gradient loading screen 
INFO: Applied: Force original audio 
INFO: Applied: Force player buttons background 
INFO: Applied: Fullscreen components 
INFO: Applied: Hide Shorts dimming 
WARNING: "Hide accessibility controls dialog" is not supported in this version. Use YouTube 20.45 or earlier. 
INFO: Applied: Hide accessibility controls dialog 
INFO: Applied: Hide action buttons 
INFO: Applied: Hide ads 
INFO: Applied: Hide comments components 
INFO: Applied: Hide feed components 
INFO: Applied: Hide feed flyout menu 
INFO: Applied: Hide layout components 
INFO: Applied: Hide player buttons 
INFO: Applied: Hide player flyout menu 
INFO: Applied: Hide shortcuts 
WARNING: "Hook YouTube Music actions" is not supported in this version. Use YouTube 19.30 or earlier. 
INFO: Applied: Hook YouTube Music actions 
INFO: Applied: Hook download actions 
INFO: Applied: MaterialYou 
INFO: Applied: Miniplayer 
INFO: Applied: Navigation bar components 
INFO: Applied: Open links externally 
INFO: Applied: Overlay buttons 
INFO: Applied: Override certificate pinning 
INFO: Applied: Playback in feeds 
INFO: Applied: Player components 
INFO: Applied: Remove background playback restrictions 
INFO: Applied: Remove viewer discretion dialog 
INFO: Applied: Return YouTube Dislike 
INFO: Applied: Return YouTube Username 
INFO: Applied: Sanitize sharing links 
INFO: Applied: Seekbar components 
INFO: Applied: Set transcript cookies 
INFO: Applied: Settings menu filter 
INFO: Applied: Shorts components 
INFO: Applied: Snack bar components 
INFO: Applied: SponsorBlock 
INFO: Applied: Spoof Wi-Fi connection 
INFO: Applied: Spoof app version 
WARNING: Invalid package name or certificate data, skipping patch 
INFO: Applied: Spoof signature 
INFO: Applied: Spoof video streams 
INFO: Applied: Spoof watch history 
INFO: Applied: Swipe controls 
INFO: Applied: Theme 
INFO: Applied: Toolbar components 
INFO: Applied: Translations for YouTube 
INFO: Applied: Video playback 
INFO: Applied: Voice Over Translation 
INFO: Applied: Wide search bar 
INFO: Applied: Visual preferences icons for YouTube 
INFO: Applied: Reload video 
INFO: Applied: Settings for YouTube 
INFO: Compiling patched dex files (mode: STRIP_FAST) 
INFO: Writing 6900 new classes to new DEX files 
INFO: Processing 6900 classes in parallel (4 threads) 
INFO: Wrote 4 dex files to /data/data/com.termux/files/home/Revancify-Xisr/assets/morphe-data/tmp/patching-1786362758432/patched/dex 
INFO: Stripping 962 modified classes from original DEX files 
INFO: Compiling modified resources 
INFO: Unescaping strings 
INFO: Processing aapt macros 
INFO: Generating new resource IDs 
INFO: Writing resource APK 
INFO: Aligning APK 
INFO: Default keystore credentials failed (Keystore does not contain entry with alias Morphe). Retrying with legacy credentials 
INFO: Signing APK 
INFO: Saved to /data/data/com.termux/files/home/Revancify-Xisr/apps/YouTube/20.51.39-Anddea.apk 
INFO: Purged this session's temp files: patching-1786362758432 
