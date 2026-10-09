#!/usr/bin/env python3
"""
Dynamic Patch Orchestrator for Morphe CLI & Multi-Source Patches
Menghubungkan konfigurasi dinamis, manifest lintas sumber, dan pembuatan argumen Morphe CLI.
"""

import sys
import os
import json
import urllib.request

def parse_compatible_versions(patches, pkg_name="com.google.android.youtube"):
    versions = set()
    for p in patches:
        compat = p.get('compatiblePackages')
        if not compat:
            continue
        
        if isinstance(compat, dict) and pkg_name in compat:
            for v in compat[pkg_name]:
                versions.add(str(v).strip())

        elif isinstance(compat, list):
            for entry in compat:
                if isinstance(entry, dict) and entry.get('name') == pkg_name:
                    for v in entry.get('versions', []):
                        versions.add(str(v).strip())

    from packaging.version import parse as semver_parse
    try:
        sorted_ver = sorted(list(versions), key=lambda x: semver_parse(x), reverse=True)
    except Exception:
        sorted_ver = sorted(list(versions), reverse=True)

    return sorted_ver

def build_cli_arguments(patches_manifest, target_version, config_payload, is_root=False):
    args = []
    
    valid_patch_names = set()
    root_specific_names = {"GmsCore support", "MicroG support", "Spoof signature", "GmsCore"}
    
    for p in patches_manifest:
        p_name = p.get('name')
        if not p_name:
            continue
        
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
            
            if p_versions and target_version not in p_versions:
                is_compatible = False

        if is_compatible:
            valid_patch_names.add(p_name)

    excluded_from_payload = set(config_payload.get('excluded_patches', []))
    included_from_payload = set(config_payload.get('included_patches', []))

    # Jika payload tidak menentukan included_patches, gunakan semua patch valid sebagai default
    if not included_from_payload:
        included_from_payload = set(valid_patch_names) - excluded_from_payload

    if is_root:
        for r_name in root_specific_names:
            excluded_from_payload.add(r_name)
            if r_name in included_from_payload:
                included_from_payload.remove(r_name)
    else:
        for r_name in root_specific_names:
            if r_name in valid_patch_names:
                included_from_payload.add(r_name)
            if r_name in excluded_from_payload:
                excluded_from_payload.remove(r_name)

    # In Morphe CLI:
    # -e = --enable <patchName>
    # -d = --disable <patchName>
    # Note: DO NOT use -i (in Morphe CLI, -i is reserved for --install to ADB device)

    # 1. Enable patches (-e <name>)
    for p_name in sorted(list(included_from_payload)):
        if p_name in valid_patch_names and p_name not in excluded_from_payload:
            args.extend(["-e", p_name])

    # 2. Disable patches (-d <name>)
    for p_name in sorted(list(excluded_from_payload)):
        if p_name in valid_patch_names or p_name in root_specific_names:
            args.extend(["-d", p_name])

    # 3. Tangani Options Kustomisasi (-O <key=value>)
    options = config_payload.get('options', {})
    for key, val in options.items():
        if isinstance(val, dict):
            for opt_key, opt_val in val.items():
                if opt_val is not None and opt_val != "":
                    args.extend(["-O", f"{opt_key}={opt_val}"])
        else:
            if val is not None and val != "":
                args.extend(["-O", f"{key}={val}"])

    return args

def main():
    if len(sys.argv) < 2:
        print("Usage: patch_orchestrator.py <command> [args...]")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "detect_version":
        manifest_path = sys.argv[2]
        fallback = sys.argv[3] if len(sys.argv) > 3 else "21.13.164"
        with open(manifest_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        patches = data.get('patches', [])
        versions = parse_compatible_versions(patches)
        print(versions[0] if versions else fallback)

    elif cmd == "generate_args":
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
