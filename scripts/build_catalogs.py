"""Verify and package optional exploratory catalogues without changing the paper.

The North America input is a pinned USGS ComCat CSV distribution maintained by
Actronix09. It is a current-preferred snapshot, not a historical revision archive
or an independent catalogue for each contributing solution agency. No upstream
executable is imported or run. Original longitude values remain unchanged.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/catalogs/usgs-na"
DIST = ROOT / "system/dist"
TARGET = DIST / "data/catalogs/usgs-na"
COMMIT = "8fe055ffe635875f7290906d45f70562a7896621"
REPOSITORY = "https://github.com/Actronix09/fuentes-alternas"
UPSTREAM_DIRECTORY = "sismos-usgs/datos/usgs/norteamerica"
RAW_BASE = f"https://raw.githubusercontent.com/Actronix09/fuentes-alternas/{COMMIT}/{UPSTREAM_DIRECTORY}/"
EVENT_URL_TEMPLATE = "https://earthquake.usgs.gov/earthquakes/eventpage/${event_id}"
UPSTREAM_MANIFEST_BLOB = "c2063a975ca692a23aebadb2f7a66c07ece14472"
UPSTREAM_MANIFEST_BYTES = 8287
PINNED_FILES = [
    {
        "path": "principal/usgs_principal_20200101_20210101_m3.5.csv",
        "bytes": 528455,
        "git_blob_sha": "416eaa837c52f92998ce40b8b3ca3f6368175418"
    },
    {
        "path": "principal/usgs_principal_20210101_20220101_m3.5.csv",
        "bytes": 415379,
        "git_blob_sha": "833ab742f4656dc1f882d4b458e9691e827ac116"
    },
    {
        "path": "principal/usgs_principal_20220101_20230101_m3.5.csv",
        "bytes": 390248,
        "git_blob_sha": "3de2ece173b6bfa6d58015af8b30da42cccb1b29"
    },
    {
        "path": "principal/usgs_principal_20230101_20240101_m3.5.csv",
        "bytes": 393361,
        "git_blob_sha": "e8226db056532e624ab95e1d4a9c750dcb60b6bf"
    },
    {
        "path": "principal/usgs_principal_20240101_20250101_m3.5.csv",
        "bytes": 384285,
        "git_blob_sha": "782772e612fe27af3acf85977256fa813b8b078c"
    },
    {
        "path": "principal/usgs_principal_20250101_20260101_m3.5.csv",
        "bytes": 385979,
        "git_blob_sha": "ba32b9ffbd51e1a493dc910a98968e9dce5d0724"
    },
    {
        "path": "aleutianas_este/usgs_aleutianas_este_20200101_20210101_m3.5.csv",
        "bytes": 21303,
        "git_blob_sha": "5f37d693bca52fba5ba7e1a26323060df3a733df"
    },
    {
        "path": "aleutianas_este/usgs_aleutianas_este_20210101_20220101_m3.5.csv",
        "bytes": 23938,
        "git_blob_sha": "561aca7379627f8dc7f7dbc614c8f6abd6b2e195"
    },
    {
        "path": "aleutianas_este/usgs_aleutianas_este_20220101_20230101_m3.5.csv",
        "bytes": 29503,
        "git_blob_sha": "de0c13bdc242767a128eb88bbd1682b469c6b04b"
    },
    {
        "path": "aleutianas_este/usgs_aleutianas_este_20230101_20240101_m3.5.csv",
        "bytes": 29308,
        "git_blob_sha": "a7f7e32cad9beafc3ddc47f95f0628858a680eec"
    },
    {
        "path": "aleutianas_este/usgs_aleutianas_este_20240101_20250101_m3.5.csv",
        "bytes": 23485,
        "git_blob_sha": "14c927cf01b40ab114cbdfb0f8100349773281df"
    },
    {
        "path": "aleutianas_este/usgs_aleutianas_este_20250101_20260101_m3.5.csv",
        "bytes": 20670,
        "git_blob_sha": "61714ba939c5b7ac7d8d9a1b63ddc363352fedd0"
    }
]
FIELDS = ["id", "time", "latitude", "longitude", "depth", "mag", "magType", "net",
          "locationSource", "magSource", "horizontalError", "depthError", "magError",
          "updated", "place", "status", "file", "event_type", "event_url"]
NUMERIC = {"latitude", "longitude", "depth", "mag", "horizontalError", "depthError", "magError"}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def safe_raw_path(relative):
    name = Path(relative)
    if name.is_absolute() or ".." in name.parts:
        raise ValueError("Unexpected upstream relative path")
    target = (RAW / name).resolve()
    target.relative_to(RAW.resolve())
    return target


def obtain(relative, download, *, expected_bytes, expected_blob, expected_sha=None):
    path = safe_raw_path(relative)
    if path.exists():
        raw = path.read_bytes()
    elif not download:
        raise FileNotFoundError(f"Missing {relative}; use --download to obtain pinned input")
    else:
        request = Request(RAW_BASE + quote(relative, safe="/"), headers={"User-Agent": "SeismicDataGeosciences-CatalogueAudit/1"})
        with urlopen(request, timeout=45) as response:
            raw = response.read()
        if len(raw) != expected_bytes or git_blob(raw) != expected_blob or (expected_sha and sha(raw) != expected_sha):
            raise ValueError(f"Pinned upstream checksum mismatch: {relative}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    if len(raw) != expected_bytes or git_blob(raw) != expected_blob or (expected_sha and sha(raw) != expected_sha):
        raise ValueError(f"Pinned local checksum mismatch: {relative}")
    return raw


def utc_instant(text):
    instant = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if instant.tzinfo is None or instant.utcoffset() != timedelta(0):
        raise ValueError(f"Expected an explicitly UTC time: {text}")
    return instant


def measurement(value, field, event_id):
    if value == "":
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"Non-finite {field} for {event_id}")
    return result


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json_bytes(value))


def build_north(download):
    manifest_raw = obtain("procedencia.json", download, expected_bytes=UPSTREAM_MANIFEST_BYTES,
                          expected_blob=UPSTREAM_MANIFEST_BLOB)
    upstream = json.loads(manifest_raw)
    upstream_files = {item["archivo"]: item for item in upstream["archivos"]}
    if set(upstream_files) != {item["path"] for item in PINNED_FILES}:
        raise ValueError("Pinned upstream file inventory changed")
    start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    stop = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows, files, identifiers = [], [], set()
    type_counts, years, agencies, missing = Counter(), Counter(), Counter(), Counter()
    per_window = Counter()
    timestamps, latitudes, longitudes, display_longitudes = [], [], [], []
    raw_row_count = 0
    for pinned in PINNED_FILES:
        relative = pinned["path"]
        spec = upstream_files[relative]
        raw = obtain(relative, download, expected_bytes=pinned["bytes"], expected_blob=pinned["git_blob_sha"], expected_sha=spec["sha256"])
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
        required = (set(FIELDS) - {"file", "event_type", "event_url"}) | {"type"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"Missing original CSV fields in {relative}")
        observed_file_rows = 0
        for source in reader:
            observed_file_rows += 1
            raw_row_count += 1
            identifier = source["id"]
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,100}", identifier):
                raise ValueError(f"Unsafe or empty original identifier in {relative}")
            if identifier in identifiers:
                # Do not silently merge conflicting current-preferred captures.
                raise ValueError(f"Repeated event ID in pinned North America files: {identifier}")
            identifiers.add(identifier)
            instant = utc_instant(source["time"])
            if not start <= instant < stop:
                raise ValueError(f"Origin time outside declared period: {identifier}")
            if source["updated"]:
                utc_instant(source["updated"])
            type_counts[source["type"]] += 1
            if source["type"] != "earthquake":
                continue
            record = {field: measurement(source[field], field, identifier) if field in NUMERIC else source[field]
                      for field in FIELDS if field not in {"file", "event_type", "event_url"}}
            if record["latitude"] is None or record["longitude"] is None or record["mag"] is None:
                raise ValueError(f"Missing selection coordinate/magnitude: {identifier}")
            lat, lon = record["latitude"], record["longitude"]
            if not -90 <= lat <= 90 or not -180 <= lon <= 180 or record["mag"] < 3.5:
                raise ValueError(f"Invalid coordinates or magnitude for declared selection: {identifier}")
            window = relative.split("/", 1)[0]
            selected_bounds = {w[0]: w[1:] for w in upstream["ventanas"]}[window]
            south, north, west, east = selected_bounds
            if not south <= lat <= north or not west <= lon <= east:
                raise ValueError(f"Record outside its declared query window: {identifier}")
            record.update(file=relative, event_type=source["type"], event_url="")
            rows.append([record[field] for field in FIELDS])
            years[instant.year] += 1
            agencies[record["locationSource"] or "(missing)"] += 1
            per_window[window] += 1
            for field in NUMERIC:
                missing[field] += record[field] is None
            timestamps.append(record["time"])
            latitudes.append(lat)
            longitudes.append(lon)
            # Context only: the packaged source longitude above is never changed.
            display_longitudes.append(lon - 360 if lon > 0 else lon)
        if observed_file_rows != spec["registros"]:
            raise ValueError(f"Declared/observed row count mismatch: {relative}")
        files.append({"path": relative, "upstream_path": UPSTREAM_DIRECTORY + "/" + relative,
                      "url": RAW_BASE + quote(relative, safe="/"), "sha256": sha(raw),
                      "git_blob_sha": pinned["git_blob_sha"], "bytes": len(raw), "observed_rows": observed_file_rows,
                      "query_url": spec["url"], "query_parameters": spec["parametros"]})
    event_bytes = json_bytes({"schema_version": 1, "fields": FIELDS, "rows": rows})
    statistics = {"raw_rows": raw_row_count, "unique_ids": len(identifiers), "duplicate_ids": 0,
                  "packaged_earthquakes": len(rows), "excluded_non_earthquake_rows": raw_row_count-len(rows),
                  "event_types": dict(type_counts), "by_origin_year": dict(sorted(years.items())),
                  "by_query_window": dict(per_window), "origin_sources": dict(sorted(agencies.items())),
                  "missing_numeric_fields": dict(sorted(missing.items())), "origin_time_first": min(timestamps),
                  "origin_time_last": max(timestamps), "observed_latitude_range": [min(latitudes), max(latitudes)],
                  "observed_source_longitude_range": [min(longitudes), max(longitudes)],
                  "observed_display_longitude_range": [min(display_longitudes), max(display_longitudes)]}
    manifest = {"schema_version": 1, "catalog_id": "usgs-na-2020-2025", "provider": "usgs",
                "provider_name": "USGS ComCat", "snapshot_repository": REPOSITORY, "snapshot_commit": COMMIT,
                "upstream_manifest_url": RAW_BASE + "procedencia.json", "upstream_manifest_sha256": sha(manifest_raw),
                "upstream_manifest_git_blob_sha": UPSTREAM_MANIFEST_BLOB,
                "upstream_extracted_utc": upstream["extraido_utc"],
                "coverage_period": {"start_utc": "2020-01-01T00:00:00Z", "end_exclusive_utc": "2026-01-01T00:00:00Z"},
                "selection_windows": upstream["ventanas"], "minimum_magnitude": upstream["magnitud_minima"],
                "bounds": [[14, -190], [84, -50]], "files": files, **statistics,
                "derived_asset_sha256": sha(event_bytes),
                "event_url_template": EVENT_URL_TEMPLATE,
                "event_url_kind": "A generated current-service link, not an observed source CSV field; URL-encode the event ID when applying the template.",
                "official_catalogue": {"institution": "U.S. Geological Survey and contributing seismic networks",
                                       "url": upstream["api"].rstrip("/") + "/", "doi": upstream["doi"]},
                "attribution": "U.S. Geological Survey and contributing networks; pinned distribution maintained by Actronix09. Upstream software credit: Actronix09 and Samy.",
                "rights": {"data": "Source-specific rights and contributing-agency roles are retained. Repository MIT does not relicense observations.",
                           "usgs_policy": "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits"},
                "limits": ["Two rectangular current-preferred extracts, not territorial classifications of the USA or Canada.",
                           "All rows are distributed by ComCat; origin and magnitude authors can be different contributing agencies.",
                           "Magnitudes retain their reported types, without conversion. Missing measurements remain null.",
                           "Positive Aleutian longitudes are stored unchanged; an unwrapped longitude can be used only for display.",
                           "This optional exploratory catalogue does not change the paper's frozen Mexico diagnostic or 36-event revision pilot."]}
    TARGET.mkdir(parents=True, exist_ok=True)
    (TARGET / "events.json").write_bytes(event_bytes)
    write_json(TARGET / "manifest.json", manifest)
    write_json(ROOT / "data/north_source_manifest.json", {key: manifest[key] for key in
               ["schema_version", "catalog_id", "snapshot_repository", "snapshot_commit", "upstream_manifest_url",
                "upstream_manifest_sha256", "upstream_manifest_git_blob_sha", "files", "rights", "limits"]})
    return manifest, statistics


def update_registry(north):
    path = DIST / "data/catalogs.json"
    existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    mexico_bytes = (DIST / "data/events.json").read_bytes()
    mexico_manifest_bytes = (DIST / "data/manifest.json").read_bytes()
    mexico = json.loads(mexico_manifest_bytes)
    if sha(mexico_bytes) != mexico["derived_asset_sha256"]:
        raise ValueError("Existing frozen Mexico bytes do not match their manifest")
    own_ids = {"usgs-na-2020-2025", "usgs-mx-historical"}
    retained = [item for item in existing.get("catalogs", []) if item["id"] not in own_ids]
    optional_entry = ROOT / "outputs/expansion/canada_entry.json"
    if optional_entry.exists():
        entry = json.loads(optional_entry.read_text(encoding="utf-8"))
        if entry["id"] != "nrcan-ca-historical" or entry["provider"] != "nrcan":
            raise ValueError("Unexpected optional Canada catalogue identity")
        retained = [item for item in retained if item["id"] != entry["id"]] + [entry]
    ssn_entry = ROOT / "research-data/catalogs/ssn-mx/catalog_entry.json"
    if ssn_entry.exists():
        entry = json.loads(ssn_entry.read_text(encoding="utf-8"))
        if entry["id"] != "ssn-mx-historical" or entry["provider"] != "ssn":
            raise ValueError("Unexpected native SSN catalogue identity")
        retained = [item for item in retained if item["id"] != entry["id"]] + [entry]
    north_manifest_bytes = (TARGET / "manifest.json").read_bytes()
    entries = [
        {"id": "usgs-na-2020-2025", "provider": "usgs", "provider_name": "USGS ComCat",
         "label": {"es": "Norteamérica · 2020–2025", "en": "North America · 2020–2025"},
         "events_url": "data/catalogs/usgs-na/events.json", "manifest_url": "data/catalogs/usgs-na/manifest.json",
         "sha256": north["derived_asset_sha256"], "manifest_sha256": sha(north_manifest_bytes),
         "bounds": [[14, -190], [84, -50]], "years": [2020, 2025], "minimum_magnitude": 3.5,
         "snapshot": COMMIT, "role": "exploration", "event_count": north["packaged_earthquakes"],
         "event_url_template": EVENT_URL_TEMPLATE,
         "coverage_period": north["coverage_period"]},
        {"id": "usgs-mx-historical", "provider": "usgs", "provider_name": "USGS ComCat",
         "label": {"es": "Región de México · instantánea del artículo", "en": "Mexico region · paper snapshot"},
         "events_url": "data/events.json", "manifest_url": "data/manifest.json",
         "sha256": sha(mexico_bytes), "manifest_sha256": sha(mexico_manifest_bytes),
         "bounds": [[14, -118], [33, -86]], "years": [1900, 2026], "minimum_magnitude": 3.5,
         "snapshot": mexico["snapshot_commit"], "role": "paper_snapshot", "event_count": mexico["packaged_earthquakes"]},
    ]
    for entry in retained:
        for asset_key, hash_key in [("events_url", "sha256"), ("manifest_url", "manifest_sha256")]:
            relative = Path(entry[asset_key])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Optional catalogue asset must remain within the static artifact")
            asset_path = (DIST / relative).resolve()
            asset_path.relative_to(DIST.resolve())
            if sha(asset_path.read_bytes()) != entry[hash_key]:
                raise ValueError(f"Optional catalogue asset mismatch: {entry['id']}")
        optional_manifest = json.loads((DIST / entry["manifest_url"]).read_text(encoding="utf-8"))
        if optional_manifest["derived_asset_sha256"] != entry["sha256"]:
            raise ValueError("Optional catalogue manifest does not describe its packaged bytes")
    providers = {item["id"]: item for item in existing.get("providers", []) if item["id"] != "usgs"}
    for entry in retained:
        providers.setdefault(entry["provider"], {"id": entry["provider"], "name": entry["provider_name"],
                                               **({"url": entry["provider_url"]} if entry.get("provider_url") else {})})
    registry = {"schema_version": 1, "default_catalog_id": "usgs-na-2020-2025",
                "legacy_catalog_id": "usgs-mx-historical",
                "providers": [{"id": "usgs", "name": "USGS ComCat", "url": "https://earthquake.usgs.gov/data/comcat/", "event_url_template": EVENT_URL_TEMPLATE}] + list(providers.values()),
                "catalogs": entries + retained,
                "selection_rule": "One active catalogue at a time. Records from distinct catalogues/providers are not merged or counted as independent events."}
    write_json(path, registry)
    return registry


def verify_registry():
    """Verify the committed explorer without downloading or rebuilding inputs."""
    registry = json.loads((DIST / "data/catalogs.json").read_text(encoding="utf-8"))
    catalogues = registry["catalogs"]
    ids = [item["id"] for item in catalogues]
    required = {"usgs-na-2020-2025", "usgs-mx-historical", "nrcan-ca-historical"}
    if (ROOT / "research-data/catalogs/ssn-mx/catalog_entry.json").exists():
        required.add("ssn-mx-historical")
    if len(ids) != len(set(ids)) or not required.issubset(ids):
        raise ValueError("Final explorer registry must retain all prepared named catalogues")
    if (registry["default_catalog_id"] != "usgs-na-2020-2025"
            or registry["legacy_catalog_id"] != "usgs-mx-historical"):
        raise ValueError("Default or legacy shared-view catalogue changed")
    provider_ids = [item["id"] for item in registry["providers"]]
    if len(provider_ids) != len(set(provider_ids)) or not {"usgs", "nrcan"}.issubset(provider_ids):
        raise ValueError("Final explorer must expose USGS and NRCan providers")
    if "ssn-mx-historical" in ids and "ssn" not in provider_ids:
        raise ValueError("Native SSN catalogue must retain its separate distributor")
    summary = []
    for item in catalogues:
        if item["provider"] not in provider_ids:
            raise ValueError(f"Unknown registered provider: {item['id']}")
        assets = {}
        for path_key, hash_key in [("events_url", "sha256"), ("manifest_url", "manifest_sha256")]:
            path = Path(item[path_key])
            if path.is_absolute() or ".." in path.parts:
                raise ValueError("Catalogue assets must remain within the static artifact")
            target = (DIST / path).resolve()
            target.relative_to(DIST.resolve())
            raw = target.read_bytes()
            if sha(raw) != item[hash_key]:
                raise ValueError(f"Registered catalogue hash mismatch: {item['id']} {path_key}")
            if path_key == "events_url" and "events_bytes" in item and len(raw) != item["events_bytes"]:
                raise ValueError(f"Registered catalogue byte count mismatch: {item['id']}")
            assets[path_key] = json.loads(raw)
        data, manifest = assets["events_url"], assets["manifest_url"]
        if manifest["derived_asset_sha256"] != item["sha256"]:
            raise ValueError(f"Manifest does not identify its event bytes: {item['id']}")
        if manifest.get("derived_asset_bytes") is not None and manifest["derived_asset_bytes"] != item.get("events_bytes"):
            raise ValueError(f"Manifest and registry byte counts differ: {item['id']}")
        fields = data["fields"]
        if len(fields) != len(set(fields)) or not set(FIELDS[:17]).issubset(fields):
            raise ValueError(f"Missing or repeated common catalogue fields: {item['id']}")
        if len(data["rows"]) != item["event_count"] or any(len(row) != len(fields) for row in data["rows"]):
            raise ValueError(f"Registered row count or field width mismatch: {item['id']}")
        id_index, file_index = fields.index("id"), fields.index("file")
        row_ids = [row[id_index] for row in data["rows"]]
        if any(not isinstance(key, str) or not key for key in row_ids) or len(set(row_ids)) != len(row_ids):
            raise ValueError(f"Catalogue record keys must be nonempty and unique: {item['id']}")
        file_paths = {entry["path"] for entry in manifest["files"]}
        if any(row[file_index] not in file_paths for row in data["rows"]):
            raise ValueError(f"Record lacks source-file provenance: {item['id']}")
        summary.append({"id": item["id"], "provider": item["provider"],
                        "records": len(data["rows"]), "fields": len(fields), "sha256": item["sha256"]})
    return {"catalogues": summary, "providers": provider_ids, "asset_hashes_verified": 2 * len(catalogues)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--download", action="store_true", help="Download missing files at the pinned commit; never refresh to live catalogues")
    mode.add_argument("--verify-only", action="store_true", help="Verify all registered packaged catalogues offline; do not rebuild or download")
    args = parser.parse_args()
    if args.verify_only:
        print(json.dumps(verify_registry()))
        return
    north, stats = build_north(args.download)
    registry = update_registry(north)
    output = ROOT / "outputs/expansion"
    output.mkdir(parents=True, exist_ok=True)
    report = {"checked_utc": datetime.now(timezone.utc).isoformat(), "catalog_id": north["catalog_id"],
              "snapshot_commit": COMMIT, "source_file_count": len(north["files"]),
              "source_bytes": sum(f["bytes"] for f in north["files"]), "statistics": stats,
              "packaged_events_sha256": north["derived_asset_sha256"],
              "registry_catalog_ids": [item["id"] for item in registry["catalogs"]],
              "original_mexico_assets_modified": False}
    (output / "north_catalog_audit.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"catalog_id": north["catalog_id"], "files": len(north["files"]), "bytes": report["source_bytes"],
                      "earthquakes": stats["packaged_earthquakes"], "duplicates": stats["duplicate_ids"],
                      "years": stats["by_origin_year"], "sha256": north["derived_asset_sha256"]}))


if __name__ == "__main__":
    main()
