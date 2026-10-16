## v2.1.23 (2026-10-17)

### Penyempurnaan Langkah 2: Layout 1-Kolom Bersih & Ergonomis
- **Restorasi Layout 1-Kolom Penuh untuk Repositori Sumber**:
  - Mengganti layout 2-kolom yang padat/berantakan dengan tata letak 1-kolom penuh (*full-width*) yang rapi, bersih, dan berjarak lega.
  - Setiap kartu sumber memiliki ruang horizontal yang leluasa untuk nama repositori, badge status (`Default`, `Kompatibel`), dan jalur repository tanpa terpotong (*no text truncation*).
  - Kartu aktif disorot dengan gradien biru halus (`rgba(59, 130, 246, 0.12)`), border `#3B82F6`, dan indikator checkmark biru `✓` di sebelah kanan.
- **Stacked Dual Channel Selector yang Nyaman**:
  - Saluran rilis (`Terbaru / Latest` dan `Pilih Versi / Kustom`) kini tersusun rapi dalam 1 kolom penuh di bawah daftar sumber.
  - Teks deskripsi dan badge `Disarankan` memiliki ruang baca yang lapang tanpa pembungkusan kata yang canggung.
- **Kepatuhan Batasan Modularitas (< 1.000 Baris)**:
  - `web/index.html`: 972 baris
  - `web/js/ui-wizard.js`: 912 baris
  - `web/css/responsive.css`: 863 baris
  - `web/css/wizard-sources.css`: 836 baris
  - `web/css/morphe.css`: 834 baris
  - `web/js/api.js`: 715 baris
  - Seluruh berkas 100% strictly di bawah 1.000 baris kode per berkas.

## v2.1.22 (2026-10-17)

### Rombak Total Langkah 2 & Modern Searchable Tag Picker Overlay
- **Layout Grid 2-Kolom Ergonomis untuk Repositori Sumber**:
  - Mengubah tampilan tumpukan vertikal repositori yang boros tempat menjadi grid 2-kolom responsif (`repeat(2, 1fr)`).
  - 8 sumber kini tertata rapi dalam 4 baris kompak (~190px total), menghemat lebih dari 250px ruang vertikal layar.
  - Kartu repositori aktif diberi pencahayaan aksen biru modern (`#3B82F6`) dan indikator radio dot yang jelas.
- **Side-by-Side Dual Channel Selector (Terbaru vs Versi Tag)**:
  - Saluran rilis ditempatkan tepat di bawah repositori secara berdampingan dalam 1 baris di ponsel Android.
  - Pengguna dapat langsung melihat kedua opsi saluran rilis tanpa perlu scroll ke bawah layar.
- **Rombak Total Overlay Pemilih Versi Tag (`#modalPatchTagPicker`)**:
  - **Live Real-time Search**: Dilengkapi kolom pencarian instan untuk mencari tag tertentu (misal `5.14`, `dev`, `v4`).
  - **Filter Segmented Pills (Semua, Stable, Pre-release)**: Pengguna dapat menyaring versi rilis hanya dengan 1 ketukan.
  - **Daftar Versi Rilis yang Disempurnakan**: Tiap baris tag dilengkapi badge `Stable` (emerald green) atau `Pre-release` (amber), tanggal rilis, dan tombol catatan rilis (*Changelog*).
  - **Collapsible Manual Tag Accordion**: Input tag manual dipindahkan ke bagian bawah sebagai akordeon yang rapi dan elegan, tidak lagi menghalangi daftar rilis utama.
- **Kepatuhan Batasan Modularitas (< 1.000 Baris)**:
  - `web/index.html`: 973 baris
  - `web/js/ui-wizard.js`: 911 baris
  - `web/css/responsive.css`: 863 baris
  - `web/css/morphe.css`: 834 baris
  - `web/css/wizard-sources.css`: 829 lines
  - `web/js/api.js`: 715 baris
  - Seluruh file 100% strictly di bawah 1.000 baris kode per file.

## v2.1.21 (2026-10-16)

### Desain Minimalis Elegan Anti-AI-Slop & Direct Channel Selector di Langkah 2
- **Redesign Langkah 1 (Pilih Aplikasi Target)**:
  - **Uniform Elevated Dark Surface**: Menghilangkan latar belakang gradien warna-warni pelangi (*candy fruit salad*) dari kartu aplikasi. Seluruh kartu kini menggunakan latar surface netral gelap elegan (`#151922` / border `rgba(255,255,255,0.08)`), mengisolasi aksen warna brand murni pada logo ikon aplikasi.
  - **Dimensi Ramping & Ergonomis (60px)**: Mengurangi ketebalan kartu dari 88px menjadi 58–60px sehingga 7–8 aplikasi langsung terlihat dalam satu layar ponsel tanpa scroll berlebihan.
  - **Zero-Redundancy Header & Metadata**: Menghapus teks ganda "Mau Patch Apa?" dan paragraf filler panjang. Metadata diringkas menjadi to-the-point: `${app.patchCount} patches • ${app.sourcesCount} sumber`.
- **Rombak Total Langkah 2 (Pilih Sumber & Saluran Rilis Langsung)**:
  - **Direct On-Page Repository Picker**: Menghapus sistem Bottom Sheet modal yang tersembunyi. Pengguna kini langsung memilih repositori sumber yang kompatibel langsung di halaman utama Langkah 2.
  - **Dual Channel Selector Ramping (Terbaru vs Pilih Versi/Kustom)**:
    - Opsi 1: `Terbaru (Latest)` — Memilih rilis patch paling mutakhir dan stabil secara otomatis (disertai chip Disarankan).
    - Opsi 2: `Pilih Versi / Kustom` — Membuka overlay modern minimalis elegan untuk memilih tag versi patch tertentu.
  - **Modern Tag Picker Overlay Modal**:
    - Menampilkan seluruh versi rilis secara berurutan dari yang terbaru ke terlama.
    - Dilengkapi badge sederhana yang bersih untuk `Pre-release` (kuning/amber) dan `Stable` (hijau/emerald), tanggal rilis, dan tombol catatan rilis (*Changelog*).
  - Menghapus total paragraf filler bertanda bohlam 💡 dan teks penjelasan berulang.
- **Kepatuhan Batasan Modularitas (< 1.000 Baris)**:
  - `web/index.html`: 953 baris
  - `web/css/wizard-sources.css`: 913 baris
  - `web/css/responsive.css`: 863 baris
  - `web/js/ui-wizard.js`: 841 baris
  - `web/css/morphe.css`: 834 baris
  - `web/js/api.js`: 715 baris
  - Seluruh file 100% strictly di bawah 1.000 baris kode per file.

## v2.1.20 (2026-10-16)

### Katalog Komprehensif Multi-Source & Smart App Discovery di Langkah 1
- **Agregasi Menyeluruh Seluruh Aplikasi yang Didukung (Multi-Source App Aggregation)**:
  - Menyediakan katalog lengkap dari seluruh aplikasi yang didukung lintas semua repositori patch: **YouTube**, **YouTube Music**, **Reddit**, **Twitter / X**, **TikTok**, **Instagram**, **Twitch**, **Spotify**, **Duolingo**, dan **Strava**.
  - Menyematkan metadata ikon SVG presisi, palet warna aksen asli, jumlah patch terdeteksi, versi rekomendasi terverifikasi, dan badge jumlah sumber yang kompatibel pada tiap kartu aplikasi.
  - Memperbaiki parsing manifest patch agar katalog aplikasi master tidak terpotong menjadi hanya 2 aplikasi saat memuat repositori dengan target terbatas (misalnya Anddea).
- **Penyaringan Sumber Cerdas (Smart Source Filtering & Auto-Switch)**:
  - Pada Langkah 2, seluruh repositori disaring dan diurutkan secara dinamis berdasarkan kapabilitas terhadap aplikasi yang dipilih pada Langkah 1.
  - Repositori yang mendukung aplikasi terpilih ditempatkan di posisi teratas dengan tag `Kompatibel` atau `Default`.
  - Jika sumber yang sedang aktif tidak mendukung aplikasi yang dipilih (misalnya memilih Reddit saat sumber aktif adalah Anddea), sistem secara otomatis beralih ke sumber kompatibel terbaik (Inotia00/ReVanced).
  - Repositori yang tidak kompatibel diberi indikator visual transparan dan pencegahan pemilihan tidak sengaja dengan notifikasi panduan yang ramah pengguna.
- **Kepatuhan Ketat Modularitas (< 1.000 Baris)**:
  - `web/index.html`: 981 baris
  - `web/js/ui-wizard.js`: 906 baris
  - `web/js/api.js`: 715 baris
  - `web/js/state.js`: 517 baris
  - `web/css/wizard-sources.css`: 710 baris
  - `web/css/wizard.css`: 699 baris
  - Seluruh file proyek 100% strictly berada di bawah batas 1.000 baris kode per file.

## v2.1.19 (2026-10-16)

### App-First Discovery Flow & 100dvh App-Shell Architecture (No Body Scrolling)
- **App Shell Architecture (1 Fokus Viewport Tanpa Scroll Body)**:
  - Mengunci seluruh halaman web pada ketinggian `100dvh` dengan `overflow: hidden`, menghilangkan efek *bounce scrolling* di ponsel.
  - **Pinned Top Header & Stepper**: Header brand, toggle mode, dan top progress bar M3 terpancang permanen di atas (`flex-shrink: 0`).
  - **Scrollable Middle Viewport**: Hanya wadah kartu/daftar di tengah (`.wizard-pane-scrollable`) yang dapat di-scroll vertikal secara halus dengan overscroll containment dan scrollbar modern.
  - **Docked Bottom Navigation**: Tombol navigasi aksi (`‹ Kembali` dan `Lanjut ›`) dipasang permanen di area jangkauan jempol bawah layar (*safe-area aware*), memudahkan interaksi satu tangan.
- **Pembalikan Alur: App-First Discovery**:
  - **Langkah 1 (Mau Patch Apa?)**: Menampilkan langsung kartu aplikasi target (YouTube, YouTube Music, Reddit, Twitter/X, TikTok) dengan status kompatibilitas dan jumlah patch.
  - **Langkah 2 (Sumber & Saluran Patch Terfilter Otomatis)**: Script secara otomatis menyaring seluruh repositori patch berdasarkan kompatibilitas dengan aplikasi yang dipilih di Langkah 1.
  - Repositori kompatibel otomatis diposisikan di urutan teratas dengan tag `Kompatibel` atau `Default`.
  - Jika sumber aktif saat ini tidak mendukung aplikasi terpilih, sistem secara cerdas beralih otomatis ke sumber kompatibel terbaik tanpa error.
- **Kepatuhan Batasan Kode (< 1.000 Baris)**:
  - `web/index.html`: 981 baris
  - `web/js/ui-wizard.js`: 884 baris
  - `web/css/wizard.css`: 699 baris
  - `web/css/wizard-sources.css`: 710 baris
  - Seluruh file 100% strictly di bawah 1.000 baris kode per file.

## v2.1.18 (2026-10-16)

### Material You 3 (M3) Native Android Redesign & Clean Bottom Sheet Architecture
- **Penyederhanaan Langkah 1 dengan Single Summary Card**: Menggantikan seluruh daftar sumber yang memadati layar dengan satu kartu ringkasan Material You yang elegan dan bernapas lega di halaman utama (`Anddea Patches • Saluran Dev (v4.3.1-dev.1)`).
- **Android Native Bottom Sheet Modal**:
  - Mengisolasi konfigurasi sumber dan saluran rilis ke dalam Bottom Sheet modal khas Android yang meluncur mulus dari bawah dengan backdrop blur dan drag handle.
  - Dilengkapi tab switching internal M3: Tab 1 untuk pemilihan 8 repositori patch (+ drawer custom source inline) dan Tab 2 untuk pemilihan saluran rilis (Dev, Stable, Tag Browser).
- **Minimalist Top Stepper & Progress Bar**:
  - Menghilangkan deretan 5 bulatan angka horizontal yang berjejal di layar ponsel.
  - Menggantinya dengan bilah progres tipis M3 di puncak layar dan indikator langkah minimalis (`Langkah 1 dari 5: Sumber & Saluran Patch`), membuat layar Android terasa luas dan tidak sesak.
- **M3 Segmented Button untuk Target Mode**:
  - Mendesain ulang pemilih Mode Root (Magisk/KernelSU/APatch) dan Mode Non-Root (GmsCore/MicroG) menjadi segmented button horizontal berdampingan dengan ikon yang jelas dan status aktif terintegrasi.
- **Kepatuhan Ketat Modularitas (< 1.000 Baris)**:
  - `web/index.html`: 989 baris
  - `web/js/ui-wizard.js`: 852 baris
  - `web/css/wizard-sources.css`: 710 baris
  - `web/css/wizard.css`: 632 baris
  - Seluruh file 100% mematuhi batas ketat di bawah 1.000 baris kode per skrip.

## v2.1.17 (2026-10-12)

### Clean, Compact & Anti-AI-Slop Redesign (Minimalist Engineering UI)
- **Eliminasi AI Slop Visual Overload**: Menghapus seluruh elemen dekoratif berlebihan khas AI template (gradien pelangi squircle avatar, badge warna-warni yang bertumpuk, box-shadow neon pendar, tombol kapsul 999px yang oversized, emoji berlebihan, dan deskripsi berulang yang memakan ruang layar).
- **Katalog Sumber Berdensitas Tinggi (High-Density Compact Grid)**:
  - Merancang ulang pemilihan 8 repositori sumber patch menjadi baris compact berdensitas tinggi (tinggi ~50px) dengan target sentuh mobile tetap presisi (≥ 44-48px).
  - Menampilkan indikator radio subtil, nama repositori bersih, tag monospace rapi, dan badge status netral (`Default` / `Custom`).
  - Menghilangkan clamped description teks berulang sehingga seluruh 8 sumber langsung terlihat rapi tanpa scroll berlebihan di ponsel maupun desktop.
- **Native-Style Segmented Control**:
  - Menggantikan kartu raksasa "Release Studio" dengan segmented control horizontal yang ringkas: `[Dev / Pre-release]`, `[Stable]`, `[Pilih Tag]`.
  - Indikator saluran aktif berbasis teks minimalis dan browser tag rilis tabel compact (monospace tag name, status pre/stable, tanggal, dan tombol teks Changelog).
- **Refactoring Geometri Komponen Global (Border-Radius 8px)**:
  - Mengubah seluruh tombol aksi (`.morphe-pill-btn`, `.btn-clean-primary`, navigation action buttons) dari kapsul pill `999px` menjadi tombol persegi rounded modern (`border-radius: 8px`) ala Linear, Vercel, dan Apple Developer Tools.
  - Memperbarui stepper wizard dari bulatan neon besar menjadi step square badges (`border-radius: 6px`, 28×28px) dengan progress bar solid tanpa gradien pelangi.
  - Merampingkan kartu versi rekomendasi dan mode selector (Root/Non-Root) menjadi card compact dengan border subtil (`border-radius: 10px`).
- **Kepatuhan Ketat Modularitas (< 1.000 Baris)**:
  - `web/index.html` makin ramping di 960 baris.
  - `web/css/wizard-sources.css` dirampingkan dari 588 baris menjadi 462 baris.
  - Seluruh file proyek 100% berada di bawah batas 1.000 baris kode per skrip.

## v2.1.16 (2026-10-12)

### Redesign Katalog Sumber Patch & Interactive Release Channel Studio
- **Katalog Lengkap Sumber RVX**: Memperluas pilihan sumber patch bawaan menjadi 8 repositori terpopuler dari ekosistem RVX dan ReVanced:
  1. *Anddea RVX* (`anddea/revanced-patches`) — Recommended, fitur kustomisasi terlengkap dengan update rutin paling aktif.
  2. *Inotia00 Classic* (`inotia00/revanced-patches`) — Classic RVX, fondasi orisinil dengan stabilitas tinggi.
  3. *Morphe Official* (`MorpheApp/morphe-patches`) — Morphe Team, kurasi resmi ekosistem Morphe Manager.
  4. *ReVanced Upstream* (`ReVanced/revanced-patches`) — Official Upstream, patches inti resmi upstream ReVanced global.
  5. *Rufous (j-hc)* (`j-hc/revanced-patches`) — Daily Builds, kompilasi harian otomatis siap pakai untuk root module.
  6. *YT-Advanced* (`yt-advanced/revanced-patches`) — Community, varian fleksibel untuk YouTube dan YouTube Music.
  7. *Cuchri RVX* (`cuynu/yt-advanced`) — Enhanced, patch modifikasi tingkat lanjut dengan tweak playback.
  8. *Piko Patches* (`crimera/revanced-patches`) — Lightweight, varian patch ramping dan ringan.
- **Redesign Kartu Sumber yang Elegan**: Setiap kartu sumber dirancang dengan squircle gradient avatar, badge status (`Recommended`, `Classic RVX`, `Morphe Team`, dll.), repositori monospace, deskripsi mendalam, status checkmark radio aktif, serta tombol hapus mandiri untuk sumber kustom.
- **Bilah Aksi & Drawer Tambah Sumber Kustom**: Penambahan toolbar Step 1 berisi counter pill (`8 Sumber Siap Pakai`), tombol `[+ Tambah]` untuk membuka drawer input inline (nama, repo GitHub/URL manifest, default channel) tanpa berpindah layar, dan tombol `[↺ Reset]` untuk mengembalikan 8 sumber bawaan resmi.
- **Interactive Release Channel Studio**: Merombak total dropdown `<select>` menjadi studio rilis interaktif:
  - 3 kartu segmen terkurasi: `⚡ Dev / Pre-release` (Bleeding Edge), `🛡️ Stable / Official` (Rekomendasi), dan `🏷️ Pilih Tag Spesifik` (Riwayat Tag).
  - Browser tag rilis interaktif yang memuat riwayat rilis GitHub nyata lengkap dengan tanggal rilis, badge status (`Pre` vs `Stable`), dan tombol `(i)` catatan rilis untuk membaca changelog resmi per tag rilis.
  - Input langsung tag kustom / commit SHA untuk pengguna mahir.
- **Pemisahan Modular (`web/css/wizard-sources.css`)**: Mengikuti pedoman modularitas, memisahkan styling Step 1 ke file CSS tersendiri sehingga seluruh berkas proyek tetap berada di bawah batas ketat 1.000 baris kode.

## v2.1.15 (2026-10-12)

### Complete Setup Wizard Overhaul, Returning User Dashboard & Smart Mode Engine
- **Navigasi Fresh & 5-Step Guided Setup Wizard**: Rombak total onboarding pengguna baru menjadi Wizard terpandu 5 tahap:
  1. *Langkah 1 (Sumber & Rilis Patch)*: Pemilihan repositori patch dan saluran rilis tag dengan tombol info `(i)` untuk melihat catatan rilis/changelog resmi langsung di antarmuka.
  2. *Langkah 2 (Aplikasi Target)*: Grid pemilihan aplikasi multi-mpp yang adaptif dan dinamis.
  3. *Langkah 3 (Versi Aplikasi)*: Menampilkan kartu hero *Recommended Version* di posisi teratas + accordion penampil seluruh versi lengkap dengan badge klasifikasi `[Stable]`, `[Beta]`, `[Alpha]`, dan `[Pre-release]`.
  4. *Langkah 4 (Mode Target & Kurasi Patch)*: Pemilih mode interaktif (Mode Root vs Mode Non-Root) dan kurasi patch lengkap dengan konfigurasi opsi dinamis tanpa hardcoded parameters.
  5. *Langkah 5 (Build & Penyelesaian)*: Ringkasan menyeluruh konfigurasi, live terminal progress, integrasi pasang langsung ke Root Manager (APatch/Magisk/KSU/ReSukiSU/KSU-Next) atau unduh file flashable ZIP/APK.
- **Returning User Dashboard**: Pengguna yang telah menyelesaikan setup otomatis langsung disajikan Full Morphe Dashboard tanpa mengulang wizard. Menampilkan badge `[✓ Configured]` pada aplikasi yang sudah dikonfigurasi, eksekusi instan 1-klik *Quick Patch*, tombol `[⚙️ Setup Ulang]` di bilah atas, serta tombol `[⋮ Edit Setup]` per kartu aplikasi.
- **Smart MicroG / GmsCore Warning Modal**: Sistem peringatan interaktif yang mendeteksi pemilihan patch MicroG secara pintar (mencegah crash/duplikasi layanan Google Play pada Mode Root dan menjamin login Google Account tetap aktif pada Mode Non-Root).
- **Silent Developer Console**: Akses tersembunyi bagi pengembang via 5-klik cepat pada teks engine di Info Modal `(i)` untuk memicu GitHub Actions Release Dispatch secara senyap tanpa notifikasi toast, dengan sanitasi input ketat dan proteksi penuh dari hardcoded credential leaks.
- **Launcher Script Fix & 100% Guaranteed Live Reload (`run.bat` & `start.bat`)**: Memperbaiki syntax error cmd parsing pada `start.bat` yang sebelumnya menyebabkan batch script langsung tertutup (crash) saat mendeteksi IP/parentheses. Mengoptimalkan build binary ke `--release` otomatis, mengekspor `MODPATH` ke runtime daemon untuk pemindaian file disk `web/` secara langsung, serta menambahkan auto-unregister Service Worker dan pembersihan CacheStorage saat berjalan di localhost agar setiap update kode web langsung live seketika.
- **Modular Codebase Integrity (< 1,000 Lines Limit)**: Pemisahan bersih logika wizard ke `web/css/wizard.css` dan `web/js/ui-wizard.js`, memastikan 100% file di repositori tetap berada di bawah batas 1.000 baris.

## v2.1.14 (2026-10-12)

### Dedicated Port 8088 & Anti-Collision Engine (Fix Lynx Kernel Manager Conflict)
- **Port Conflict Resolution (Port 8088 Default)**: Changed default WebUI and daemon port from generic `8080` to dedicated `8088` across daemon, `start.bat`, `run.bat`, `action.sh`, and `service.sh` to eliminate collisions with other root managers (especially Lynx Kernel Manager / LKM which binds to `8080` by default).
- **Dynamic Port Hunting Fallback**: Implemented an automated port hunting loop in `daemon/src/main.rs`. If port `8088` is occupied, the daemon automatically probes sequential ports (`8089`, `8090`, up to `8103`) without crashing, and persists the active port in `.daemon_port`.
- **Verified Signature Probing in WebRoot (`webroot/index.html`)**: Upgraded KernelSU and APatch webroot loader to probe candidate ports and verify daemon API signatures (`jre_ready` / `daemon_version`), guaranteeing it will never erroneously embed or iframe third-party tools like Lynx Kernel Manager.
- **Client Auto-Discovery (`web/js/api.js`)**: Updated `checkDaemonStatus()` to probe ports `8088`, `8089`, `8090`, `8280`, and `8080`, automatically syncing `STATE.daemonUrl` with signature verification.

## v2.1.13 (2026-10-12)

### Live Disk Reloading & Local Launcher Auto-Sync Engine
- **Direct Live Disk-First Web Serving**: Upgraded `daemon/src/embedded.rs` static file handler to prioritize reading directly from the physical `web/` directory on disk at runtime before falling back to compile-time embedded assets. Any modification to HTML, JavaScript, CSS, or JSON is immediately reflected on browser refresh without restarting or recompiling the Rust binary.
- **Aggressive Cache-Control Headers**: Implemented `no-cache, no-store, must-revalidate, max-age=0` and `Pragma: no-cache` response headers on all static web assets, preventing browser HTTP caching from freezing stale web code during local testing.
- **Localhost Service Worker Cache Bypass**: Enhanced `web/sw.js` and `web/app.js` to automatically bypass Service Worker CacheStorage when running on `localhost` or `127.0.0.1`, purging legacy cache buckets and ensuring 100% fresh network fetches.
- **Smart Incremental Build & Stale Process Elimination**: Rebuilt `start.bat` and `run.bat` to automatically terminate any dangling background `rvx-daemon.exe` instances (freeing port 8080 and releasing Windows binary locks) and perform automatic fast incremental Cargo compilation (< 1s) whenever Rust code in `daemon/src/` is edited.

## v2.1.12 (2026-10-12)

### User-Friendly Workflow Hierarchy & Guided ZIP Module Installation
- **Intuitive 5-Step Workflow Hierarchy**: Structured the entire patcher experience into a sequential 5-stage pipeline across both Morphe Manager GUI and Revancify-Xisr Termux TUI:
  1. *Langkah 1*: Inisialisasi & Pemilihan Aplikasi & Sumber Patch (Catalog & Sources)
  2. *Langkah 2*: Pencocokan Versi Target APK (Target Version Matching with Recommended badges)
  3. *Langkah 3*: Kurasi Patch & Konfigurasi Opsi (Patch Selection, Golden Presets & Gear Options)
  4. *Langkah 4*: Kompilasi & Eksekusi Patch Engine (Rust daemon compiling APK & building module)
  5. *Langkah 5*: Selesai & Aktivasi Modul (Live Hot-Mount vs. Flashable ZIP)
- **Step Badges Across All Views**: Added sleek, non-intrusive `.morphe-step-badge` indicators (`LANGKAH X DARI 5`) on Screen 1 (Home), Screen 2 (Version Selection), Screen 3 (Expert Mode Patches), Screen 4 (Progress/Compilation), and Completion Hero Card.
- **Guided 2-Method Post-Patch Activation**: Upgraded `#postPatchHeroCard` with two dedicated cards eliminating all post-build confusion:
  - *Metode A (Live Hot-Mount)*: Instantly overlays patched APK into running Android system namespace without rebooting.
  - *Metode B (Flashable ZIP Modul)*: Provides a 4-step checklist to save the module ZIP, open Magisk / KernelSU / APatch, navigate to Modules > Install from Storage, flash the ZIP, and reboot.
- **Workflow Guide in System Info Sheet**: Integrated a persistent "Panduan Hierarki 5 Langkah Alur Kerja" section into the System & App Info `(i)` sheet, accessible at any point during patching.
- **Sequential Termux TUI Menu**: Re-ordered the Revancify-Xisr main menu to follow the exact 1..9 sequential hierarchy (1 Select App → 2 Change Source → 3 Select Version → 4 Edit Patches → 5 Edit Patch Options → 6 Preset Manager → 7 Patch App → 8 Mount / Export ZIP → 9 Settings).

## v2.1.11 (2026-10-12)

### Flexible Multi-Source Ecosystem & 1:1 Morphe Patch Sources Replica
- **1:1 Authentic Morphe Sources Sheet**: Rebuilt the Patch Sources bottom sheet to mirror `MorpheApp/morphe-manager`, complete with source avatar badges, metadata pills (`Pre-installed` vs `Custom`), detailed rows (`Patches ›`, `Version ›`, `Apps ›`), `Open in browser`, `Refresh`, and Material 3 toggle switches for `Pre-release patches` and `Experimental app versions`.
- **Unlimited Custom Source Creation**: Added dynamic custom patch source management. Users can now tap the `+` button in the Sources header to add ANY third-party or private GitHub repository (`owner/repo`) or raw manifest URL with automatic persistence in `localStorage`.
- **Pre-Configured Sources Catalog**: Expanded pre-installed sources beyond 2 to include the entire mainstream RVX ecosystem: Anddea Patches (`anddea/revanced-patches`), Morphe Official (`MorpheApp/morphe-patches`), Inotia00 RVX (`inotia00/revanced-patches`), and ReVanced Official (`ReVanced/revanced-patches`), alongside unlimited custom sources.
- **Dual Manifest Compatibility**: Engineered manifest loader to automatically discover and resolve between Morphe `patches-list.json` and ReVanced `patches.json` formats across jsdelivr and GitHub raw CDNs with zero manual configuration.
- **Termux CLI TUI Custom Sources Support**: Integrated `[+] Add Custom Source`, `[-] Delete Custom Source`, and `[R] Reset to Factory Defaults` directly into the Revancify-Xisr terminal interface for terminal-native source management.
- **Rust Core Custom Bundle Pipeline**: Updated `rvx-daemon` patcher engine and CLI to dynamically resolve and download custom `.mpp` patch bundles and manifests directly from custom repository releases.

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

