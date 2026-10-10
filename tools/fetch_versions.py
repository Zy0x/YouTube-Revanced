#!/usr/bin/env python3
"""
Dynamic Version Fetcher from APKMirror (mirip Revancify-Xisr & Morphe)
Mengambil daftar versi lengkap aplikasi (YouTube, dsb) langsung dari APKMirror.
"""

import sys
import os
import re
import json
import argparse
import urllib.request

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
]

def fetch_apkmirror_versions(app_category="youtube", max_pages=5):
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("[-] Modul 'requests' atau 'beautifulsoup4' belum terpasang. Pasang dengan: pip install requests beautifulsoup4")
        return []

    headers = {'User-Agent': USER_AGENTS[0]}
    versions = []
    seen = set()

    for p in range(1, max_pages + 1):
        url = f"https://www.apkmirror.com/uploads/page/{p}/?appcategory={app_category}"
        print(f"[*] Mengambil halaman {p}/{max_pages} dari APKMirror: {url}")
        try:
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code != 200:
                print(f"[-] Halaman {p} mengembalikan status {r.status_code}, berhenti.")
                break

            soup = BeautifulSoup(r.text, 'html.parser')
            links = soup.find_all('a', class_='fontBlack')
            for a in links:
                text = a.text.strip()
                # Tangkap versi seperti "YouTube 21.13.164" atau "YouTube 20.05.46"
                m = re.search(r'([0-9]+\.[0-9]+\.[0-9]+)', text)
                if m:
                    ver = m.group(1)
                    is_beta = 'beta' in text.lower() or 'alpha' in text.lower()
                    if ver not in seen:
                        seen.add(ver)
                        versions.append({
                            'version': ver,
                            'isBeta': is_beta,
                            'title': text
                        })
        except Exception as e:
            print(f"[-] Kesalahan pada halaman {p}: {e}")
            break

    print(f"[+] Berhasil mengumpulkan {len(versions)} versi unik untuk '{app_category}'.")
    return versions

def main():
    parser = argparse.ArgumentParser(description="Fetch versions from APKMirror")
    parser.add_argument("--app", default="youtube", help="Kategori aplikasi (default: youtube)")
    parser.add_argument("--pages", type=int, default=5, help="Jumlah halaman untuk di-scrape (default: 5)")
    parser.add_argument("--output", default="web/config/youtube-versions.json", help="Path berkas output JSON")
    args = parser.parse_args()

    results = fetch_apkmirror_versions(args.app, args.pages)
    if results:
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
        print(f"[+] Disimpan ke: {args.output}")

        # Sinkronkan juga ke config/ jika ada
        if os.path.exists("config") and args.output.startswith("web/config/"):
            target_cfg = os.path.join("config", os.path.basename(args.output))
            with open(target_cfg, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2)
            print(f"[+] Disinkronkan ke: {target_cfg}")

if __name__ == "__main__":
    main()
