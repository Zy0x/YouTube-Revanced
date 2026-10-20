#!/usr/bin/env python3
"""Build the fast-start registry seed from daemon cache files."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build_out"
OUTPUT = ROOT / "web" / "config" / "registry-catalog-seed.json"


def read_json(*names):
    for name in names:
        path = BUILD / name
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"None of these cache files exist: {', '.join(names)}")


catalog = read_json("registry-catalog-cache-v2.json", "registry-catalog-cache.json")
app_payload = read_json("registry-apps-cache.json")

supported = {
    package
    for source in catalog.get("sources", [])
    for package in source.get("packages", [])
    if isinstance(package, str) and package
}

for source in catalog.get("sources", []):
    source.pop("releaseNotes", None)

catalog["apps"] = [
    app for app in app_payload.get("apps", [])
    if app.get("packageName") in supported
]
catalog["appCount"] = len(catalog["apps"])

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)
print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
