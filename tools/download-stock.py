#!/usr/bin/env python3
"""
Multi-Channel Fallback Downloader untuk Stock YouTube APK
Cerdas, otomatis memfilter Standalone APK vs BUNDLE, dan mendukung ekstraksi base.apk.
"""

import sys
import os
import re
import urllib.request
import json
import zipfile

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
]

def validate_and_fix_apk(file_path):
    """
    Memastikan file APK memiliki AndroidManifest.xml di root.
    Jika file ternyata merupakan APKM / Bundle ZIP, otomatis ekstrak base.apk di dalamnya.
    """
    if not os.path.exists(file_path) or os.path.getsize(file_path) < 20 * 1024 * 1024:
        return False

    try:
        with zipfile.ZipFile(file_path, 'r') as z:
            namelist = z.namelist()
            # 1. Jika valid APK standar (memiliki AndroidManifest.xml)
            if 'AndroidManifest.xml' in namelist:
                print(f"[+] Verifikasi Berhasil: File adalah Standalone APK valid ({os.path.getsize(file_path) // (1024*1024)} MB).")
                return True

            # 2. Jika file adalah APKM / Split bundle (memiliki base.apk di dalamnya)
            if 'base.apk' in namelist:
                print("[*] Terdeteksi bundle APKM. Mengekstrak base.apk...")
                temp_extract = file_path + ".base.apk"
                with z.open('base.apk') as src, open(temp_extract, 'wb') as dst:
                    while chunk := src.read(1024 * 1024):
                        dst.write(chunk)
                os.replace(temp_extract, file_path)
                print(f"[+] Berhasil mengekstrak base.apk ({os.path.getsize(file_path) // (1024*1024)} MB).")
                return True
    except Exception as e:
        print(f"[-] Validasi file zip/apk gagal: {e}")

    return False

def try_download(url, output_path):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENTS[0]})
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                with open(output_path, 'wb') as f:
                    while chunk := resp.read(1024 * 1024):
                        f.write(chunk)
                if validate_and_fix_apk(output_path):
                    return True
    except Exception:
        pass
    return False

def scrape_apkmirror(version, output_path):
    v_slug = version.replace('.', '-')
    try:
        import requests
        from bs4 import BeautifulSoup
        s = requests.Session()
        s.headers.update({'User-Agent': USER_AGENTS[0]})

        url = f"https://www.apkmirror.com/apk/google-inc/youtube/youtube-{v_slug}-release/"
        print(f"[*] Mencari di APKMirror: {url}")
        res = s.get(url, timeout=20)
        if res.status_code != 200:
            return False

        soup = BeautifulSoup(res.text, 'html.parser')
        rows = soup.find_all('div', class_='table-row')
        
        # Prioritas 1: Cari baris dengan badge "APK" murni (bukan BUNDLE)
        apk_detail_link = None
        bundle_detail_link = None

        for row in rows:
            badge = row.find('span', class_='apkm-badge')
            link = row.find('a', class_='accent_color')
            if badge and link and 'href' in link.attrs:
                badge_text = badge.text.strip().upper()
                full_href = "https://www.apkmirror.com" + link['href']
                if badge_text == 'APK' and not apk_detail_link:
                    apk_detail_link = full_href
                elif badge_text == 'BUNDLE' and not bundle_detail_link:
                    bundle_detail_link = full_href

        chosen_link = apk_detail_link or bundle_detail_link
        if not chosen_link:
            return False

        print(f"[*] Mengambil halaman unduh: {chosen_link}")
        res2 = s.get(chosen_link, timeout=20)
        soup2 = BeautifulSoup(res2.text, 'html.parser')

        dl_btn = soup2.find('a', class_='downloadButton')
        if not dl_btn:
            return False

        final_page = "https://www.apkmirror.com" + dl_btn['href']
        res3 = s.get(final_page, timeout=20)
        soup3 = BeautifulSoup(res3.text, 'html.parser')

        raw_link = soup3.find('a', rel='nofollow')
        if not raw_link or 'href' not in raw_link.attrs:
            return False

        file_url = "https://www.apkmirror.com" + raw_link['href']
        print(f"[*] Mengunduh file dari: {file_url}")
        with s.get(file_url, stream=True, timeout=90) as r:
            r.raise_for_status()
            with open(output_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=1024*1024):
                    f.write(chunk)

        return validate_and_fix_apk(output_path)
    except Exception as e:
        print(f"[-] Scraper gagal: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: download-stock.py <version> <output_path> [custom_url]")
        sys.exit(1)

    version = sys.argv[1].lstrip('v')
    # Validasi format versi untuk mencegah path traversal atau injeksi karakter
    if not re.match(r'^[0-9]+(\.[0-9]+)*(-[a-zA-Z0-9.]+)?$', version):
        print(f"[-] Format versi YouTube tidak valid atau terdeteksi karakter mencurigakan: {version}")
        sys.exit(1)

    output_path = sys.argv[2]
    base_dir = os.path.realpath(os.getcwd())
    resolved_output_path = os.path.realpath(os.path.join(base_dir, output_path))
    if os.path.commonpath([base_dir, resolved_output_path]) != base_dir:
        print(f"[-] output_path tidak valid, terdeteksi path traversal: {output_path}")
        sys.exit(1)
    output_path = resolved_output_path
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    custom_url = sys.argv[3] if len(sys.argv) > 3 else None

    # 1. Custom URL jika disediakan
    if custom_url:
        print(f"[*] Mengunduh dari custom URL: {custom_url}")
        if try_download(custom_url, output_path):
            sys.exit(0)

    # 2. Coba mirror GitHub Release & Archive resmi
    mirrors = [
        f"https://github.com/Zy0x/YouTube-Revanced/releases/download/v{version}/youtube-{version}.apk",
        f"https://github.com/revanced-apks/builds/releases/download/v{version}/youtube.apk",
        f"https://archive.org/download/youtube-apk-{version.replace('.', '-')}/youtube-{version}.apk"
    ]

    for m in mirrors:
        if try_download(m, output_path):
            sys.exit(0)

    # 3. APKMirror Scraper (memprioritaskan Standalone APK, auto-extract base.apk jika bundle)
    if scrape_apkmirror(version, output_path):
        sys.exit(0)

    print("❌ Gagal mengunduh Stock APK yang valid.")
    sys.exit(1)

if __name__ == '__main__':
    main()
