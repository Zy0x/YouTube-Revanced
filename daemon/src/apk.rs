//! Read APK identity from the manifest instead of trusting filenames or pm output.
use crate::state::AppState;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ApkIdentity {
    pub package: String,
    pub version: String,
}

fn u16_at(bytes: &[u8], at: usize) -> Result<usize, String> {
    bytes
        .get(at..at + 2)
        .map(|v| u16::from_le_bytes([v[0], v[1]]) as usize)
        .ok_or_else(|| "Manifest APK terpotong".into())
}
fn u32_at(bytes: &[u8], at: usize) -> Result<usize, String> {
    bytes
        .get(at..at + 4)
        .map(|v| u32::from_le_bytes(v.try_into().unwrap()) as usize)
        .ok_or_else(|| "Manifest APK terpotong".into())
}
fn length8(bytes: &[u8], at: &mut usize) -> Result<usize, String> {
    let first = *bytes.get(*at).ok_or("String manifest terpotong")? as usize;
    *at += 1;
    if first & 0x80 == 0 {
        return Ok(first);
    }
    let second = *bytes.get(*at).ok_or("String manifest terpotong")? as usize;
    *at += 1;
    Ok(((first & 0x7f) << 8) | second)
}
fn string_pool(bytes: &[u8], start: usize, size: usize) -> Result<Vec<String>, String> {
    let header = u16_at(bytes, start + 2)?;
    let count = u32_at(bytes, start + 8)?;
    let utf8 = u32_at(bytes, start + 16)? & 0x100 != 0;
    let data = u32_at(bytes, start + 20)?;
    if count > 100_000 || header + count * 4 > size {
        return Err("String pool manifest tidak valid".into());
    }
    let mut strings = Vec::with_capacity(count);
    let chunk = bytes
        .get(start..start + size)
        .ok_or("String pool manifest terpotong")?;
    for index in 0..count {
        let mut at = data
            .checked_add(u32_at(chunk, header + index * 4)?)
            .ok_or("Offset string tidak valid")?;
        let value = if utf8 {
            length8(chunk, &mut at)?;
            let len = length8(chunk, &mut at)?;
            String::from_utf8(
                chunk
                    .get(at..at + len)
                    .ok_or("String manifest terpotong")?
                    .to_vec(),
            )
            .map_err(|_| "UTF-8 manifest tidak valid")?
        } else {
            let first = u16_at(chunk, at)?;
            at += 2;
            let len = if first & 0x8000 != 0 {
                let second = u16_at(chunk, at)?;
                at += 2;
                ((first & 0x7fff) << 16) | second
            } else {
                first
            };
            if len > chunk.len() / 2 {
                return Err("Panjang string manifest tidak valid".into());
            }
            let words = chunk
                .get(at..at + len * 2)
                .ok_or("String manifest terpotong")?
                .chunks_exact(2)
                .map(|b| u16::from_le_bytes([b[0], b[1]]))
                .collect::<Vec<_>>();
            String::from_utf16(&words).map_err(|_| "UTF-16 manifest tidak valid")?
        };
        strings.push(value);
    }
    Ok(strings)
}

pub fn manifest_identity(bytes: &[u8]) -> Result<ApkIdentity, String> {
    if u16_at(bytes, 0)? != 3 {
        return Err("AndroidManifest bukan binary XML Android".into());
    }
    let end = u32_at(bytes, 4)?;
    if end > bytes.len() {
        return Err("AndroidManifest terpotong".into());
    }
    let mut at = u16_at(bytes, 2)?;
    let mut strings = Vec::new();
    while at + 8 <= end {
        let kind = u16_at(bytes, at)?;
        let header = u16_at(bytes, at + 2)?;
        let size = u32_at(bytes, at + 4)?;
        if size < 8 || header > size || at + size > end {
            return Err("Chunk manifest tidak valid".into());
        }
        if kind == 1 {
            strings = string_pool(bytes, at, size)?;
        }
        if kind == 0x0102
            && strings.get(u32_at(bytes, at + 20)?).map(String::as_str) == Some("manifest")
        {
            let offset = u16_at(bytes, at + 24)?;
            let stride = u16_at(bytes, at + 26)?;
            let count = u16_at(bytes, at + 28)?;
            if stride < 20 || header + offset + count * stride > size {
                return Err("Atribut manifest tidak valid".into());
            }
            let mut package = None;
            let mut version = None;
            for i in 0..count {
                let attr = at + header + offset + i * stride;
                let name = strings
                    .get(u32_at(bytes, attr + 4)?)
                    .map(String::as_str)
                    .unwrap_or("");
                let raw = u32_at(bytes, attr + 8)?;
                let data = u32_at(bytes, attr + 16)?;
                let value = strings
                    .get(raw)
                    .or_else(|| {
                        if bytes.get(attr + 15) == Some(&3) {
                            strings.get(data)
                        } else {
                            None
                        }
                    })
                    .cloned();
                if name == "split" && value.as_deref().is_some_and(|v| !v.is_empty())
                    || name == "isSplitRequired" && data == 1
                {
                    return Err("APK split memerlukan bundle lengkap; pilih APK universal".into());
                }
                if name == "package" {
                    package = value.clone();
                }
                if name == "versionName" {
                    version = value;
                }
            }
            return match (package, version) {
                (Some(package), Some(version)) if !package.is_empty() && !version.is_empty() => {
                    Ok(ApkIdentity { package, version })
                }
                _ => Err("Paket atau versi APK tidak dapat diverifikasi dari manifest".into()),
            };
        }
        at += size;
    }
    Err("Elemen manifest APK tidak ditemukan".into())
}

pub fn inspect_apk(path: &Path) -> Result<ApkIdentity, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("APK tidak dapat dibaca: {}", e))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| format!("APK rusak atau unduhan belum lengkap: {}", e))?;
    let mut manifest = Vec::new();
    {
        let mut entry = zip
            .by_name("AndroidManifest.xml")
            .map_err(|_| "Berkas bukan APK mandiri. Pilih APK universal, bukan APKM/split APK.")?;
        if entry.size() > 4 * 1024 * 1024 {
            return Err("Manifest APK terlalu besar".into());
        }
        entry
            .read_to_end(&mut manifest)
            .map_err(|e| format!("Manifest APK rusak: {}", e))?;
    }
    let identity = manifest_identity(&manifest)?;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("Isi APK rusak: {}", e))?;
        if !entry.is_dir() {
            std::io::copy(&mut entry, &mut std::io::sink())
                .map_err(|e| format!("CRC APK tidak valid: {}", e))?;
        }
    }
    Ok(identity)
}

pub fn validate_target(path: &Path, package: &str, version: &str) -> Result<(), String> {
    let identity = inspect_apk(path)?;
    if identity.package != package || identity.version != version {
        return Err(format!(
            "APK berisi {} v{}, tetapi pilihan Anda {} v{}",
            identity.package, identity.version, package, version
        ));
    }
    Ok(())
}

pub fn cache_path(cache: &Path, package: &str, version: &str) -> std::path::PathBuf {
    cache.join(format!("{}-{}.apk", package, version))
}

pub async fn find_local_stock(
    state: &AppState,
    package_name: &str,
    version: &str,
    build_dir: &Path,
    input: Option<&str>,
) -> Option<PathBuf> {
    let alias = match package_name {
        "com.google.android.youtube" => "youtube",
        "com.google.android.apps.youtube.music" => "ytmusic",
        _ => package_name,
    };
    let mut candidates = vec![
        cache_path(build_dir, package_name, version),
        build_dir.join(format!("{}-{}.apk", alias, version)),
    ];
    if let Some(path) = input.filter(|path| !path.is_empty()) {
        candidates.push(PathBuf::from(path));
    }
    candidates.push(state.modpath.join(format!("stock-{}.apk", alias)));

    // Fallback directories on Android shared storage
    let dl_dir = Path::new("/sdcard/Download");
    candidates.push(dl_dir.join(format!("{}-{}.apk", alias, version)));
    candidates.push(dl_dir.join(format!("{}-{}.apk", package_name, version)));
    let xisr_cache = Path::new("/sdcard/Revancify-Xisr/cache");
    candidates.push(xisr_cache.join(format!("{}-{}.apk", alias, version)));
    candidates.push(xisr_cache.join(format!("{}-{}.apk", package_name, version)));

    if let Ok(mut entries) = tokio::fs::read_dir(dl_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let p = entry.path();
            if p.extension().is_some_and(|ext| ext == "apk") && !candidates.contains(&p) {
                let name = p
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                if name.contains(alias) || name.contains(package_name) {
                    candidates.push(p);
                }
            }
        }
    }

    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        let path = candidate.clone();
        let package = package_name.to_string();
        let target = version.to_string();
        match tokio::task::spawn_blocking(move || {
            validate_target(&path, &package, &target)
        })
        .await
        {
            Ok(Ok(())) => return Some(candidate),
            Ok(Err(error)) => state.log(format!(
                "DEPENDENCY_STATUS|apk|invalid|{}",
                error.replace('|', " ")
            )),
            Err(error) => state.log(format!("DEPENDENCY_STATUS|apk|invalid|{}", error)),
        }
    }
    None
}

pub async fn locate_or_download_stock(
    state: &AppState,
    package_name: &str,
    version: &str,
    build_dir: &Path,
    input: Option<&str>,
) -> Result<PathBuf, String> {
    if !package_name
        .split('.')
        .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        || version.is_empty()
        || !version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return Err("Paket atau versi APK tidak valid".into());
    }
    let target = cache_path(build_dir, package_name, version);
    if let Some(source) = find_local_stock(state, package_name, version, build_dir, input).await {
        if source != target {
            state.log("DEPENDENCY_STATUS|apk|preparing|Menyalin APK terpasang/lokal yang paket dan versinya cocok");
            let part = target.with_extension("apk.import.part");
            tokio::fs::copy(&source, &part)
                .await
                .map_err(|e| format!("APK terpasang tidak dapat disalin: {}", e))?;
            tokio::fs::rename(&part, &target)
                .await
                .map_err(|e| format!("Tidak dapat menyimpan cache APK: {}", e))?;
        }
        return Ok(target);
    }
    state.log("DEPENDENCY_STATUS|apk|downloading|APK yang sesuai belum tersedia; mencari unduhan versi yang dipilih");
    let mut reasons = Vec::new();
    for attempt in 1..=2 {
        if attempt > 1 {
            state.log("DEPENDENCY_STATUS|apk|retrying|Mengulang persiapan APK dari sumber unduhan");
        }
        match crate::apkmirror::scrape_and_download_apkmirror(state, package_name, version, &target)
            .await
        {
            Ok(path) => match validate_target(&path, package_name, version) {
                Ok(()) => return Ok(path),
                Err(error) => reasons.push(error),
            },
            Err(error) => reasons.push(error),
        }
    }
    Err(format!(
        "APK asli {} v{} belum dapat disiapkan. {}. Versi tidak diganti otomatis; periksa koneksi atau sediakan APK universal yang sesuai.",
        package_name,
        version,
        reasons.join("; ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn le16(out: &mut Vec<u8>, n: u16) {
        out.extend(n.to_le_bytes());
    }
    fn le32(out: &mut Vec<u8>, n: u32) {
        out.extend(n.to_le_bytes());
    }
    fn manifest(package: &str, version: &str) -> Vec<u8> {
        let strings = ["manifest", "package", "versionName", package, version];
        let mut text = vec![];
        let mut offsets = vec![];
        for s in strings {
            offsets.push(text.len() as u32);
            text.push(s.len() as u8);
            text.push(s.len() as u8);
            text.extend(s.as_bytes());
            text.push(0);
        }
        while text.len() % 4 != 0 {
            text.push(0);
        }
        let mut pool = vec![];
        le16(&mut pool, 1);
        le16(&mut pool, 28);
        le32(&mut pool, (28 + 20 + text.len()) as u32);
        le32(&mut pool, 5);
        le32(&mut pool, 0);
        le32(&mut pool, 0x100);
        le32(&mut pool, 48);
        le32(&mut pool, 0);
        for offset in offsets {
            le32(&mut pool, offset);
        }
        pool.extend(text);
        let mut tag = vec![];
        le16(&mut tag, 0x0102);
        le16(&mut tag, 16);
        le32(&mut tag, 76);
        le32(&mut tag, 1);
        le32(&mut tag, u32::MAX);
        le32(&mut tag, u32::MAX);
        le32(&mut tag, 0);
        le16(&mut tag, 20);
        le16(&mut tag, 20);
        le16(&mut tag, 2);
        le16(&mut tag, 0);
        le16(&mut tag, 0);
        le16(&mut tag, 0);
        for (name, value) in [(1, 3), (2, 4)] {
            le32(&mut tag, u32::MAX);
            le32(&mut tag, name);
            le32(&mut tag, value);
            le16(&mut tag, 8);
            tag.push(0);
            tag.push(3);
            le32(&mut tag, value);
        }
        let mut xml = vec![];
        le16(&mut xml, 3);
        le16(&mut xml, 8);
        le32(&mut xml, (8 + pool.len() + tag.len()) as u32);
        xml.extend(pool);
        xml.extend(tag);
        xml
    }
    fn fixture() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "rvx-apk-test-{}-{}.apk",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn reads_identity_and_rejects_wrong_version_without_trusting_filename() {
        let path = fixture();
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        zip.start_file(
            "AndroidManifest.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(&manifest("com.example.app", "1.2.3"))
            .unwrap();
        zip.start_file("classes.dex", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"dex\n035\0test").unwrap();
        zip.finish().unwrap();
        assert!(validate_target(&path, "com.example.app", "1.2.3").is_ok());
        assert!(validate_target(&path, "com.example.app", "2.0")
            .unwrap_err()
            .contains("1.2.3"));
        assert!(validate_target(&path, "com.wrong.package", "1.2.3").is_err());
        let len = std::fs::metadata(&path).unwrap().len();
        std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(len / 2)
            .unwrap();
        assert!(inspect_apk(&path).is_err());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn rejects_truncated_and_non_android_manifests() {
        assert!(manifest_identity(b"<html>error</html>").is_err());
        let bytes = manifest("com.example.app", "1.2.3");
        assert!(manifest_identity(&bytes[..bytes.len() - 5]).is_err());
    }
    #[test]
    #[ignore = "requires RVX_VALIDATION_APK copied read-only from the test device"]
    fn verifies_real_infinix_youtube_apk() {
        let path = std::env::var("RVX_VALIDATION_APK").expect("Set RVX_VALIDATION_APK");
        validate_target(Path::new(&path), "com.google.android.youtube", "21.13.164").unwrap();
    }
}
