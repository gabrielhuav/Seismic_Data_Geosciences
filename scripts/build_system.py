"""Package only approved public data fields for the static research explorer."""
from __future__ import annotations
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "system" / "dist" / "data"
FIELDS = ["id", "time", "latitude", "longitude", "depth", "mag", "magType", "net",
          "locationSource", "magSource", "horizontalError", "depthError", "magError",
          "updated", "place", "status", "file"]
NUMERIC = {"latitude", "longitude", "depth", "mag", "horizontalError", "depthError", "magError"}


def dump(name, value):
    (DIST / name).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    manifest = json.loads((ROOT / "data/source_manifest.json").read_text(encoding="utf-8"))
    DIST.mkdir(parents=True, exist_ok=True)
    rows, seen = [], set()
    for spec in manifest["files"]:
        path = ROOT / "data/raw/usgs" / spec["path"]
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != spec["sha256"] or len(raw) != spec["bytes"]:
            raise ValueError(f"Input checksum mismatch: {path.name}")
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                if row["id"] in seen:
                    raise ValueError(f"Repeated event identifier {row['id']}")
                seen.add(row["id"])
                if row["type"] != "earthquake":
                    continue
                row["file"] = path.name
                values = []
                for field in FIELDS:
                    value = row[field]
                    values.append(float(value) if field in NUMERIC and value else (None if field in NUMERIC else value))
                rows.append(values)
    dump("events.json", {"schema_version": 1, "fields": FIELDS, "rows": rows})
    # Public build does not expose local paths or SSN-derived observations.
    public_manifest = {k: manifest[k] for k in ["schema_version", "manifest_inspected_at_utc", "snapshot_repository", "snapshot_commit", "upstream_audit_timestamp_utc", "description", "official_catalogue", "rights", "files"]}
    public_manifest["packaged_earthquakes"] = len(rows)
    public_manifest["excluded_non_earthquake_rows"] = len(seen) - len(rows)
    public_manifest["derived_asset_sha256"] = hashlib.sha256((DIST / "events.json").read_bytes()).hexdigest()
    dump("manifest.json", public_manifest)
    # Revision audit data use their own manifest and capture times.
    revision_dir = ROOT / "outputs/revisions"
    if (revision_dir / "system.json").exists():
        dump("revisions.json", json.loads((revision_dir / "system.json").read_text(encoding="utf-8")))
    else:
        dump("revisions.json", {"available": False, "note": "Revision audit has not been packaged."})
    print(json.dumps({"earthquakes": len(rows), "excluded": len(seen)-len(rows), "data_asset_bytes": (DIST / "events.json").stat().st_size}))


if __name__ == "__main__":
    main()
