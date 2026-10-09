#!/usr/bin/env python3
"""
Script helper untuk mengunduh Stock YouTube APK yang bersih dan resmi
berdasarkan nomor versi target.
"""

import sys
import os
import re
import urllib.request
import json

def download_youtube_stock(version, output_path):
    print(f"[*] Mencari Stock APK YouTube v{version}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    # Format versi untuk URL (e.g. 21.13.164 -> 21-13-164)
    v_slug = version.replace('.', '-')
    
    # 1. Coba download dari endpoint mirror / github release cache
    mirror_urls = [
        f"https://github.com/Zy0x/YouTube-Revanced/releases/download/v{version}/youtube-{version}.apk",
        f"https://github.com/revanced-apks/builds/releases/download/v{version}/youtube.apk",
        f"https://archive.org/download/youtube-apk-{v_slug}/youtube-{version}.apk"
    ]

    for url in mirror_urls:
        try:
            print(f"[*] Mencoba mirror: {url}")
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    with open(output_path, 'wb') as f:
                        f.write(resp.read())
                    if os.path.exists(output_path) and os.path.getsize(output_path) > 50 * 1024 * 1024:
                        print(f"[+] Berhasil mengunduh Stock APK ({os.path.getsize(output_path)} bytes)!")
                        return True
        except Exception as e:
            continue

    # 2. Jika mirror belum tersedia, gunakan APKMirror scraper
    try:
        import requests
        from bs4 import BeautifulSoup
        
        session = requests.Session()
        session.headers.update(headers)
        
        search_url = f"https://www.apkmirror.com/apk/google-inc/youtube/youtube-{v_slug}-release/"
        print(f"[*] Mencari di APKMirror: {search_url}")
        res = session.get(search_url, timeout=20)
        
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            # Cari baris APK (non-bundle/apk standar atau arm64-v8a)
            apk_rows = soup.find_all('div', class_='table-row')
            download_page_link = None
            for row in apk_rows:
                badge = row.find('span', class_='apkm-badge')
                if badge and 'APK' in badge.text:
                    link = row.find('a', class_='accent_color')
                    if link and 'href' in link.attrs:
                        download_page_link = "https://www.apkmirror.com" + link['href']
                        break
            
            if download_page_link:
                print(f"[*] Menuju link detail: {download_page_link}")
                res2 = session.get(download_page_link, timeout=20)
                soup2 = BeautifulSoup(res2.text, 'html.parser')
                download_btn = soup2.find('a', class_='downloadButton')
                
                if download_btn and 'href' in download_btn.attrs:
                    final_page = "https://www.apkmirror.com" + download_btn['href']
                    res3 = session.get(final_page, timeout=20)
                    soup3 = BeautifulSoup(res3.text, 'html.parser')
                    final_download_link = soup3.find('a', rel='nofollow')
                    
                    if final_download_link and 'href' in final_download_link.attrs:
                        file_url = "https://www.apkmirror.com" + final_download_link['href']
                        print(f"[*] Mengunduh file dari: {file_url}")
                        with session.get(file_url, stream=True, timeout=60) as r:
                            r.raise_for_status()
                            with open(output_path, 'wb') as f:
                                for chunk in r.iter_content(chunk_size=1024*1024):
                                    f.write(chunk)
                        if os.path.getsize(output_path) > 30 * 1024 * 1024:
                            print(f"[+] Download Stock APK berhasil ({os.path.getsize(output_path)} bytes)!")
                            return True
    except Exception as e:
        print(f"[-] Scraper error: {e}")

    print(f"[-] Gagal mengunduh Stock APK otomatis untuk versi {version}.")
    print("    Silakan sediakan file 'stock-youtube.apk' di direktori build.")
    return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Penggunaan: download-stock.py <version> <output_path>")
        sys.exit(1)
    
    ver = sys.argv[1].lstrip('v')
    out = sys.argv[2]
    success = download_youtube_stock(ver, out)
    if not success:
        sys.exit(1)
