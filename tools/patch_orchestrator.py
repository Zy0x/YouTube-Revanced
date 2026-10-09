#!/usr/bin/env python3
"""
Dynamic Patch Orchestrator for Morphe CLI & Multi-Source Patches
Menghubungkan konfigurasi dinamis, manifest lintas sumber, dan pembuatan argumen Morphe CLI.
"""

import sys
import os
import json
import urllib.request
import subprocess

def fetch_json(url):
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))

def parse_compatible_versions(patches, pkg_name="com.google.android.youtube"):
    """
    Universal Parser: Mendukung format Anddea (dict of list) dan format ReVanced/Inotia00 (list of objects)
    """
    versions = set()
    for p in patches:
        compat = p.get('compatiblePackages')
        if not compat:
            continue
        
        # Format 1: Anddea / Morphe (dict: {"com.google.android.youtube": ["21.13.164", ...]})
        if isinstance(compat, dict) and pkg_name in compat:
            for v in compat[pkg_name]:
                versions.add(str(v).strip())

        # Format 2: ReVanced / Inotia00 (list: [{"name": "com.google.android.youtube", "versions": [...] }])
        elif isinstance(compat, list):
            for entry in compat:
                if isinstance(entry, dict) and entry.get('name') == pkg_name:
                    for v in entry.get('versions', []):
                        versions.add(str(v).strip())

    # Sort semver descending
    from packaging.version import parse as semver_parse
    try:
        sorted_ver = sorted(list(versions), key=lambda x: semver_parse(x), reverse=True)
    except Exception:
        sorted_ver = sorted(list(versions), reverse=True)

    return sorted_ver

def build_cli_arguments(patches_manifest, target_version, config_payload, is_root=False):
    """
    Secara dinamis membangun argumen Morphe CLI berdasarkan:
    1. Manifest patch resmi dari sumber aktif
    2. Versi target YouTube yang dipilih
    3. Konfigurasi kustomisasi (included, excluded, options)
    4. Varian target (Root vs Non-Root)
    """
    args = []
    
    # 1. Analisis Patch yang Kompatibel
    valid_patch_names = set()
    root_specific_names = {"GmsCore support", "MicroG support", "Spoof signature", "GmsCore"}
    
    for p in patches_manifest:
        p_name = p.get('name')
        if not p_name:
            continue
        
        # Cek apakah patch kompatibel dengan versi ini (jika ada batasan versi)
        compat = p.get('compatiblePackages')
        is_compatible = True
        if compat:
            p_versions = []
            if isinstance(compat, dict):
                p_versions = compat.get("com.google.android.youtube", [])
            elif isinstance(compat, list):
                for entry in compat:
                    if entry.get('name') == "com.google.android.youtube":
                        p_versions = entry.get('versions', [])
            
            # Jika daftar versi ditentukan dan tidak kosong, pastikan target_version kompatibel
            if p_versions and target_version not in p_versions:
                is_compatible = False

        if is_compatible:
            valid_patch_names.add(p_name)

    # 2. Tangani Exclusions & Inclusions
    excluded_from_payload = set(config_payload.get('excluded_patches', []))
    included_from_payload = set(config_payload.get('included_patches', []))

    # Jika mode Root: Wajib exclude GmsCore / MicroG support dan Spoof Signature
    if is_root:
        for r_name in root_specific_names:
            excluded_from_payload.add(r_name)
            if r_name in included_from_payload:
                included_from_payload.remove(r_name)
    else:
        # Jika Non-Root: Wajib sertakan GmsCore support
        for r_name in root_specific_names:
            if r_name in valid_patch_names:
                included_from_payload.add(r_name)

    # Tambahkan argumen exclude (-e)
    for p_name in sorted(list(excluded_from_payload)):
        if p_name in valid_patch_names or p_name in root_specific_names:
            args.extend(["-e", p_name])

    # Tambahkan argumen include (-i) jika ditentukan secara eksplisit
    for p_name in sorted(list(included_from_payload)):
        if p_name in valid_patch_names and p_name not in excluded_from_payload:
            args.extend(["-i", p_name])

    # 3. Tangani Options Kustomisasi (-Okey=value)
    options = config_payload.get('options', {})
    for key, val in options.items():
        if val is None or val == "":
            continue
        # Format Morphe CLI: -Okey=val
        args.append(f"-O{key}={val}")

    return args

def main():
    if len(sys.argv) < 2:
        print("Usage: patch_orchestrator.py <command> [args...]")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "detect_version":
        # Argument: manifest_path, fallback_version
        manifest_path = sys.argv[2]
        fallback = sys.argv[3] if len(sys.argv) > 3 else "21.13.164"
        with open(manifest_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        patches = data.get('patches', [])
        versions = parse_compatible_versions(patches)
        print(versions[0] if versions else fallback)

    elif cmd == "generate_args":
        # Argument: manifest_path, target_version, config_json_path, variant (root/nonroot), output_args_file
        manifest_path = sys.argv[2]
        target_version = sys.argv[3]
        config_path = sys.argv[4]
        is_root = (sys.argv[5].lower() == "root")
        out_file = sys.argv[6]

        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest_data = json.load(f)
        
        config_data = {}
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)

        args = build_cli_arguments(
            manifest_data.get('patches', []),
            target_version,
            config_data,
            is_root=is_root
        )

        with open(out_file, 'w', encoding='utf-8') as f:
            for a in args:
                f.write(f"{a}\n")

        print(f"[+] Berhasil men-generate {len(args)} argumen Morphe CLI ({'Root' if is_root else 'Non-Root'}) ke {out_file}")

if __name__ == '__main__':
    main()
