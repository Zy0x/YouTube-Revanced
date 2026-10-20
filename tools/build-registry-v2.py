#!/usr/bin/env python3
"""Build the small, sharded browser registry from the verified catalog seed."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
SEED = WEB / "config" / "registry-catalog-seed.json"
OUTPUT = WEB / "registry" / "v2"

POPULAR_PACKAGES = [
    "com.google.android.youtube",
    "com.zhiliaoapp.musically",
    "com.twitter.android",
    "com.instagram.android",
    "com.google.android.apps.youtube.music",
    "com.reddit.frontpage",
    "com.spotify.music",
    "tv.twitch.android.app",
]


def compact_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def write_json(path: Path, value: object, *, integrity: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = compact_json(value)
    path.write_bytes(data)
    if integrity:
        path.with_suffix(path.suffix + ".sha256").write_text(
            hashlib.sha256(data).hexdigest() + "\n", encoding="ascii"
        )


def clean_source(source: dict) -> dict:
    native_available = bool(source.get("bundleUrl", "").endswith(".mpp"))
    return {
        "id": source["id"],
        "name": source.get("name") or source.get("repository", "").split("/")[-1],
        "repository": source.get("repository", ""),
        "sourceUrl": source.get("sourceUrl", ""),
        "description": source.get("description", ""),
        "iconUrl": source.get("iconUrl") or source.get("ownerAvatarUrl"),
        "patchCount": int(source.get("patchCount") or 0),
        "latestRelease": {
            "tag": source.get("version", ""),
            "publishedAt": source.get("publishedAt", ""),
            "prerelease": bool(source.get("prerelease")),
            "nativeMpp": {
                "available": native_available,
                "url": source.get("bundleUrl", "") if native_available else "",
                "sha256": "",
                "size": None,
            },
            "portable": {
                "available": False,
                "artifactHash": "",
                "artifactManifestUrl": "",
                "engineApiVersion": "",
                "patchCoverage": 0,
                "verifiedAt": "",
            },
        },
    }


def main() -> None:
    output_path = OUTPUT.resolve()
    if output_path.exists():
        if WEB.resolve() not in output_path.parents:
            raise RuntimeError(f"Refusing to clear output outside web root: {output_path}")
        shutil.rmtree(output_path)
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sources = [clean_source(item) for item in seed.get("sources", []) if item.get("id")]
    source_by_id = {item["id"]: item for item in sources}
    package_sources: dict[str, list[str]] = {}
    for raw_source in seed.get("sources", []):
        source_id = raw_source.get("id")
        if source_id not in source_by_id:
            continue
        for package_name in raw_source.get("packages", []):
            package_sources.setdefault(package_name, []).append(source_id)

    apps = []
    for raw_app in seed.get("apps", []):
        package_name = raw_app.get("packageName")
        if not package_name:
            continue
        source_ids = sorted(set(package_sources.get(package_name, [])))
        app = {
            "packageName": package_name,
            "name": raw_app.get("name") or package_name,
            "iconUrl": raw_app.get("iconUrl"),
            "versions": list(dict.fromkeys(raw_app.get("versions") or [])),
            "sourceIds": source_ids,
            "sourceCount": len(source_ids),
        }
        apps.append(app)
        write_json(
            OUTPUT / "apps" / f"{package_name}.json",
            {
                "schemaVersion": 2,
                "generatedAt": generated_at,
                **app,
                "sources": [source_by_id[source_id] for source_id in source_ids],
            },
        )

    priority = {package_name: index for index, package_name in enumerate(POPULAR_PACKAGES)}
    apps.sort(key=lambda app: (priority.get(app["packageName"], len(priority)), app["name"].casefold()))
    popular_apps = [app for app in apps if app["packageName"] in priority]
    source_summaries = []
    for source in sources:
        source_summaries.append(source)
        write_json(
            OUTPUT / "releases" / source["id"] / "latest.json",
            {
                "schemaVersion": 2,
                "generatedAt": generated_at,
                "sourceId": source["id"],
                "repository": source["repository"],
                **source["latestRelease"],
            },
        )

    index = {
        "schemaVersion": 2,
        "generatedAt": generated_at,
        "catalogGeneration": seed.get("catalogGeneration", generated_at),
        "catalogEtag": seed.get("catalogEtag", ""),
        "provider": seed.get("provider", "registry-seed"),
        "sourceCount": len(source_summaries),
        "appCount": len(apps),
        "popularApps": popular_apps,
        "sources": source_summaries,
        "appsIndexUrl": "registry/v2/apps/index.json",
        "signature": {"status": "unsigned-development"},
    }
    write_json(OUTPUT / "index.json", index, integrity=True)
    write_json(
        OUTPUT / "apps" / "index.json",
        {
            "schemaVersion": 2,
            "generatedAt": generated_at,
            "count": len(apps),
            "apps": apps,
            "signature": {"status": "unsigned-development"},
        },
        integrity=True,
    )
    print(f"Registry v2: {len(source_summaries)} sources, {len(apps)} apps -> {OUTPUT}")


if __name__ == "__main__":
    main()
