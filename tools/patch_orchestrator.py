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

    excluded_from_payload = set(
        config_payload.get('excluded_patches', []) 
        or config_payload.get('excludedPatches', [])
    )
    included_from_payload = set(
        config_payload.get('included_patches', []) 
        or config_payload.get('includedPatches', [])
    )

    # Jika payload tidak menentukan included_patches, gunakan semua patch valid sebagai default
    if not included_from_payload:
        included_from_payload = set(valid_patch_names) - excluded_from_payload

    if is_root:
        root_excluded = set(
            config_payload.get('root_excluded_patches', []) 
            or config_payload.get('rootExcludedPatches', [])
        )
        excluded_from_payload.update(root_excluded)
        for r_name in root_specific_names:
            if r_name in valid_patch_names:
                excluded_from_payload.add(r_name)
        included_from_payload = included_from_payload - excluded_from_payload
    else:
        nonroot_included = set(
            config_payload.get('non_root_included_patches', []) 
            or config_payload.get('nonRootIncludedPatches', [])
        )
        included_from_payload.update(nonroot_included)
        for r_name in root_specific_names:
            if r_name in valid_patch_names:
                included_from_payload.add(r_name)
        excluded_from_payload = excluded_from_payload - included_from_payload

    # Petakan opsi ke patch pemiliknya sesuai manifest
    option_key_to_patches = {}
    for p in patches_manifest:
        p_name = p.get('name')
        if not p_name:
            continue
        for opt in p.get('options', []):
            opt_k = opt.get('key')
            if opt_k:
                option_key_to_patches.setdefault(opt_k, []).append(p_name)

    patch_options = {}
    raw_options = config_payload.get('options', {})
    for k, v in raw_options.items():
        if isinstance(v, dict):
            # Format berjenjang: { "Patch Name": { "key": "val" } }
            p_name = k
            if p_name not in patch_options:
                patch_options[p_name] = {}
            for opt_k, opt_v in v.items():
                if opt_v is not None and str(opt_v).strip() != "":
                    patch_options[p_name][opt_k] = str(opt_v).strip()
        else:
            # Format rata (flat): { "key": "val" }
            if v is not None and str(v).strip() != "":
                matched_patches = option_key_to_patches.get(k, [])
                for p_name in matched_patches:
                    if p_name in included_from_payload:
                        if p_name not in patch_options:
                            patch_options[p_name] = {}
                        patch_options[p_name][k] = str(v).strip()

    # Sesuai picocli BNF di Morphe CLI:
    # (-p=<patchesFile> [[[-O=<String=Object>]... (-e=<name> | --ei=<index>)] [(-d=<name> | --di=<index>)]]...)... <apk>
    # 1. Enable patches (-e <name>) beserta opsi (-O <key=val>) yang mendahuluinya
    for p_name in sorted(list(included_from_payload)):
        if p_name in valid_patch_names and p_name not in excluded_from_payload:
            opts = patch_options.get(p_name, {})
            for opt_k, opt_v in opts.items():
                args.extend(["-O", f"{opt_k}={opt_v}"])
            args.extend(["-e", p_name])

    # 2. Disable patches (-d <name>) - hanya untuk patch yang valid di manifest
    for p_name in sorted(list(excluded_from_payload)):
        if p_name in valid_patch_names:
            args.extend(["-d", p_name])

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
