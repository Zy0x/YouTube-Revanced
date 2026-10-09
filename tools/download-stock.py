#!/usr/bin/env python3
"""
Multi-Channel Fallback Downloader untuk Stock YouTube APK
Cerdas, tangguh terhadap pemblokiran, dan mendukung berbagai sumber mirror.
"""

import sys
import os
import re
import urllib.request
import json

USER_AGENTS = [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
]

def try_download(url, output_path, min_size_mb=40):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENTS[0]})
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                with open(output_path, 'wb') as f:
                    while chunk := resp.read(1024 * 1024):
                        f.write(chunk)
                if os.path.exists(output_path) and os.path.getsize(output_path) > min_size_mb * 1024 * 1024:
                    print(f"[+] Download berhasil dari {url} ({os.path.getsize(output_path) // (1024*1024)} MB)")
                    return True
    except Exception as e:
        # Gagal di sumber ini, coba sumber berikutnya
        pass
    return False

def scrape_apkmirror(version, output_path):
    v_slug = version.replace('.', '-')
    try:
        import requests
        from bs4 import BeautifulSoup
        s = requests.Session()
        s.headers.update({'User-Agent': USER_AGENTS[1]})

        url = f"https://www.apkmirror.com/apk/google-inc/youtube/youtube-{v_slug}-release/"
        print(f"[*] Mencoba APKMirror: {url}")
        res = s.get(url, timeout=20)
        if res.status_code != 200:
            return False

        soup = BeautifulSoup(res.text, 'html.parser')
        # Temukan link download APK arm64 atau noarch
        links = [a['href'] for a in soup.find_all('a', href=True) if '/apk/google-inc/youtube/youtube-' in a['href'] and '-download/' in a['href']]
        if not links:
            return False

        detail_url = "https://www.apkmirror.com" + links[0]
        res2 = s.get(detail_url, timeout=20)
        soup2 = BeautifulSoup(res2.text, 'html.parser')

        dl_btn = soup2.find('a', class_='downloadButton')
        if not dl_btn:
            return False

        final_page = "https://www.apkmirror.com" + dl_btn['href']
        res3 = s.get(final_page, timeout=20)
        soup3 = BeautifulSoup(res3.text, 'html.parser')

        raw_link = soup3.find('a', rel='nofollow')
        if not raw_link:
            return False

        file_url = "https://www.apkmirror.com" + raw_link['href']
        with s.get(file_url, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(output_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=1024*1024):
                    f.write(chunk)

        return os.path.exists(output_path) and os.path.getsize(output_path) > 40 * 1024 * 1024
    except Exception as e:
        print(f"[-] Scraper gagal: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: download-stock.py <version> <output_path> [custom_url]")
        sys.exit(1)

    version = sys.argv[1].lstrip('v')
    output_path = sys.argv[2]
    custom_url = sys.argv[3] if len(sys.argv) > 3 else None

    # 1. Jika pengguna memberikan direct URL
    if custom_url:
        print(f"[*] Mengunduh dari custom URL: {custom_url}")
        if try_download(custom_url, output_path):
            sys.exit(0)

    # 2. Coba mirror GitHub Release & Archive resmi
    mirrors = [
        f"https://github.com/Zy0x/YouTube-Revanced/releases/download/v{version}/youtube-{version}.apk",
        f"https://github.com/revanced-apks/builds/releases/download/v{version}/youtube.apk",
        f"https://archive.org/download/youtube-apk-{version.replace('.', '-')}/youtube-{version}.apk",
        f"https://github.com/j-hc/revanced-magisk-module/releases/download/2024-01-01/youtube-{version}.apk"
    ]

    for m in mirrors:
        if try_download(m, output_path):
            sys.exit(0)

    # 3. Coba APKMirror Scraper
    if scrape_apkmirror(version, output_path):
        sys.exit(0)

    print("❌ Gagal mengunduh Stock APK otomatis.")
    sys.exit(1)

if __name__ == '__main__':
    main()
