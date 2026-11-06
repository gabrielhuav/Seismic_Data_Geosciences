"""Verify, prepare or restore the bounded, original ComCat evidence package.

Only the acquisition manifest and response bodies it explicitly references are
copied. Historical SQL, author documents and private working evidence are never
discovered or copied. Preparing files locally does not publish them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/revisions"
PACKAGE = ROOT / "research-data/comcat"
EXPECTED_MANIFEST = "c5baf7d9dd447fc2b8f5aa2a677bef7386c9c382373b3ef7c88d440fa5b1ecc0"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_path(base, relative):
    relative = Path(relative)
    if relative.is_absolute() or ".." in relative.parts or relative.suffix != ".geojson":
        raise ValueError(f"Unexpected response path: {relative}")
    path = (base / relative).resolve()
    path.relative_to(base.resolve())
    return path


def verified_files(base):
    manifest_raw = (base / "manifest.json").read_bytes()
    if sha(manifest_raw) != EXPECTED_MANIFEST:
        raise ValueError("The frozen acquisition manifest does not match the declared capture")
    manifest = json.loads(manifest_raw)
    specs = [spec for cohort in manifest["cohorts"] for spec in (cohort["count"], cohort["query"])] + manifest["events"]
    files = {"manifest.json": manifest_raw}
    for spec in specs:
        for key in ("request_url", "response_url"):
            parsed = urlsplit(spec[key])
            if parsed.scheme != "https" or parsed.hostname != "earthquake.usgs.gov" or parsed.username or parsed.password:
                raise ValueError("Only the declared official ComCat responses may enter this package")
        raw = safe_path(base, spec["path"]).read_bytes()
        if len(raw) != spec["bytes"] or sha(raw) != spec["sha256"]:
            raise ValueError(f"Response length or hash mismatch: {spec['path']}")
        if spec["path"] in files:
            raise ValueError("Repeated response path in manifest")
        files[spec["path"]] = raw
    return files, specs


def write_identical_or_new(path, raw):
    if path.exists():
        if path.read_bytes() != raw:
            raise ValueError(f"Refusing to replace different existing evidence: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "verify", "restore"])
    args = parser.parse_args()
    source = RAW if args.action == "prepare" else PACKAGE
    files, specs = verified_files(source)
    if args.action != "verify":
        destination = PACKAGE if args.action == "prepare" else RAW
        # All input bytes are verified before any copies are written.
        for name, raw in files.items():
            target = destination / "manifest.json" if name == "manifest.json" else safe_path(destination, name)
            write_identical_or_new(target, raw)
    inventory = {"schema": "seismic-comcat-evidence/1", "acquisition_manifest_sha256": EXPECTED_MANIFEST,
                 "response_count": len(specs), "response_bytes": sum(s["bytes"] for s in specs),
                 "files": [{"path": name, "bytes": len(raw), "sha256": sha(raw)} for name, raw in sorted(files.items())],
                 "scope": "Exact official ComCat response bodies from the declared 2017/2022 current-selected acquisition; not a historical public catalogue.",
                 "rights": "Source-specific rights and contributor attribution are retained; the project software licence does not relicense observations or product contents."}
    if args.action == "prepare":
        write_identical_or_new(PACKAGE / "package_manifest.json", (json.dumps(inventory, indent=2) + "\n").encode())
    print(json.dumps({"action": args.action, "verified_responses": len(specs), "response_bytes": inventory["response_bytes"],
                      "acquisition_manifest_sha256": EXPECTED_MANIFEST}))


if __name__ == "__main__":
    main()
