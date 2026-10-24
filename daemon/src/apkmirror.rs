use crate::state::AppState;
use futures_util::StreamExt;
use std::fs::File;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

const USER_AGENT: &str = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

pub fn validate_apk_file(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() < 10 * 1024 * 1024 {
        return Ok(false);
    }

    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return Ok(false),
    };

    if archive.by_name("AndroidManifest.xml").is_ok() {
        return Ok(true);
    }

    // If it's an APKM or bundle containing base.apk
    if archive.by_name("base.apk").is_ok() {
        let temp_path = path.with_extension("base.tmp");
        {
            let mut base_file = archive.by_name("base.apk").map_err(|e| e.to_string())?;
            let mut out_file = File::create(&temp_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut base_file, &mut out_file).map_err(|e| e.to_string())?;
        }
        drop(archive);
        let _ = std::fs::rename(&temp_path, path);
        return Ok(true);
    }

    Ok(false)
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    Some(tag[start..end].to_string())
}

pub async fn scrape_and_download_apkmirror(
    state: &AppState,
    package_name: &str,
    version: &str,
    target_file: &Path,
) -> Result<PathBuf, String> {
    let (org_slug, app_slug) = match package_name {
        "com.google.android.youtube" => ("google-inc", "youtube"),
        "com.google.android.apps.youtube.music" => ("google-inc", "youtube-music"),
        "com.twitter.android" => ("x-corp", "twitter"),
        "com.reddit.frontpage" => ("redditinc", "reddit"),
        _ => ("google-inc", "youtube"),
    };

    let v_slug = version.replace('.', "-");
    let initial_url = format!(
        "https://www.apkmirror.com/apk/{}/{}/{}-{}-release/",
        org_slug, app_slug, app_slug, v_slug
    );

    state.log(format!("🔍 Mencari rilis di APKMirror: {}", initial_url));

    let res1 = state
        .client
        .get(&initial_url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Gagal memuat halaman utama APKMirror: {}", e))?;

    if !res1.status().is_success() {
        return Err(format!("APKMirror mengembalikan status {}", res1.status()));
    }

    let html1 = res1.text().await.map_err(|e| e.to_string())?;

    // Step 1: Find variant download link
    let mut variant_url = None;
    let markers = ["-android-apk-download/", "-apk-download/"];
    for marker in markers {
        if let Some(pos) = html1.find(marker) {
            if let Some(href_start) = html1[..pos].rfind("href=\"") {
                let start = href_start + 6;
                let end = pos + marker.len();
                let path = &html1[start..end];
                variant_url = Some(format!("https://www.apkmirror.com{}", path));
                break;
            }
        }
    }

    let variant_url = variant_url.ok_or_else(|| {
        "Tidak menemukan link varian APK pada halaman rilis APKMirror".to_string()
    })?;

    state.log(format!("📄 Mengambil detail varian: {}", variant_url));

    let res2 = state
        .client
        .get(&variant_url)
        .header("User-Agent", USER_AGENT)
        .header("Referer", &initial_url)
        .send()
        .await
        .map_err(|e| format!("Gagal memuat halaman varian: {}", e))?;

    let html2 = res2.text().await.map_err(|e| e.to_string())?;

    // Step 2: Find downloadButton href
    let mut download_page_url = None;
    if let Some(pos) = html2.find("downloadButton") {
        if let Some(tag_start) = html2[..pos].rfind('<') {
            if let Some(tag_end) = html2[pos..].find('>') {
                let tag = &html2[tag_start..pos + tag_end];
                if let Some(href) = extract_attr(tag, "href") {
                    download_page_url = Some(format!("https://www.apkmirror.com{}", href));
                }
            }
        }
    }

    let download_page_url = download_page_url.ok_or_else(|| {
        "Tidak menemukan tombol unduh pada halaman varian APKMirror".to_string()
    })?;

    state.log("📥 Mengambil link direct download...");

    let res3 = state
        .client
        .get(&download_page_url)
        .header("User-Agent", USER_AGENT)
        .header("Referer", &variant_url)
        .send()
        .await
        .map_err(|e| format!("Gagal memuat halaman unduh: {}", e))?;

    let html3 = res3.text().await.map_err(|e| e.to_string())?;

    // Step 3: Find direct download link (download.php?id=...)
    let mut direct_dl_url = None;
    if let Some(pos) = html3.find("/wp-content/themes/APKMirror/download.php?") {
        if let Some(start) = html3[..pos].rfind("href=\"") {
            let start = start + 6;
            if let Some(end) = html3[pos..].find('"') {
                let path = &html3[start..pos + end];
                direct_dl_url = Some(format!("https://www.apkmirror.com{}", path));
            }
        }
    }

    let direct_dl_url = direct_dl_url.ok_or_else(|| {
        "Tidak menemukan direct link download.php dari APKMirror".to_string()
    })?;

    state.log("⬇️ Mengunduh Stock APK dari APKMirror...");

    let res4 = state
        .client
        .get(&direct_dl_url)
        .header("User-Agent", USER_AGENT)
        .header("Referer", &download_page_url)
        .send()
        .await
        .map_err(|e| format!("Gagal memulai unduhan APK: {}", e))?;

    if !res4.status().is_success() {
        return Err(format!("Download stream error: HTTP {}", res4.status()));
    }

    let total_size = res4.content_length().unwrap_or(0);
    let mut stream = res4.bytes_stream();
    let mut file = tokio::fs::File::create(target_file)
        .await
        .map_err(|e| format!("Gagal membuat berkas target: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut last_reported = 0;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Stream read error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 && downloaded - last_reported > 15 * 1024 * 1024 {
            let pct = (downloaded * 100) / total_size;
            state.log(format!("  Mengunduh: {}% ({} MB / {} MB)", pct, downloaded / (1024 * 1024), total_size / (1024 * 1024)));
            last_reported = downloaded;
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    if validate_apk_file(target_file)? {
        Ok(target_file.to_path_buf())
    } else {
        Err("Berkas yang diunduh bukan APK/APKM yang valid".to_string())
    }
}
