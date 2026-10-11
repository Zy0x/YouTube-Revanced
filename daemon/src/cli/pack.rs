use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

pub async fn run_pack(modpath: PathBuf, output: Option<PathBuf>) -> anyhow::Result<()> {
    let out_zip = output.unwrap_or_else(|| modpath.join("YouTube-RVX-Flashable.zip"));
    println!("📦 [Pack] Packaging flashable Magisk/KernelSU/APatch module...");
    println!("  Source: {}", modpath.display());
    println!("  Output: {}", out_zip.display());

    if let Some(parent) = out_zip.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let file = File::create(&out_zip)?;
    let mut zip = zip::ZipWriter::new(file);

    let default_options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(9));

    // Essential items to include in module ZIP
    let items_to_pack = [
        "module.prop",
        "customize.sh",
        "service.sh",
        "action.sh",
        "uninstall.sh",
        "META-INF",
        "bin",
        "webroot",
        "app",
        "ori",
        "youtube",
    ];

    for item in items_to_pack {
        let src_path = modpath.join(item);
        if src_path.exists() {
            if src_path.is_file() {
                add_file_to_zip(&mut zip, &src_path, item, default_options)?;
            } else if src_path.is_dir() {
                add_dir_to_zip(&mut zip, &src_path, item, default_options)?;
            }
        }
    }

    zip.finish()?;
    let metadata = std::fs::metadata(&out_zip)?;
    let size_mb = metadata.len() as f64 / (1024.0 * 1024.0);
    println!("✅ [Pack] Module ZIP created successfully! ({:.2} MB)", size_mb);
    Ok(())
}

fn add_file_to_zip<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    src: &Path,
    archive_name: &str,
    options: SimpleFileOptions,
) -> anyhow::Result<()> {
    let mut file = File::open(src)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    let clean_name = archive_name.replace('\\', "/");
    let mut opts = options;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = src.metadata() {
            let mode = meta.permissions().mode();
            opts = opts.unix_permissions(mode);
        }
    }
    #[cfg(not(unix))]
    {
        if clean_name.ends_with(".sh") || clean_name.contains("bin/") || clean_name.contains("update-binary") {
            opts = opts.unix_permissions(0o755);
        } else {
            opts = opts.unix_permissions(0o644);
        }
    }

    zip.start_file(clean_name, opts)?;
    zip.write_all(&buffer)?;
    Ok(())
}

fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    src_dir: &Path,
    base_prefix: &str,
    options: SimpleFileOptions,
) -> anyhow::Result<()> {
    for entry in std::fs::read_dir(src_dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        let rel_name = format!("{}/{}", base_prefix, name_str);

        if path.is_dir() {
            add_dir_to_zip(zip, &path, &rel_name, options)?;
        } else if path.is_file() {
            add_file_to_zip(zip, &path, &rel_name, options)?;
        }
    }
    Ok(())
}
