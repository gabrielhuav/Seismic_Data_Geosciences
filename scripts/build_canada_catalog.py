"""Acquire and package the explicitly open-licensed NRCan historical CSV.

Only this Open Government Portal resource is used. This script does not access
the separately licensed NEDB bulletin service or infer a FDSN event endpoint.
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
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/catalogs/nrcan-ca/eqarchive-en.csv"
EVIDENCE = ROOT / "outputs/expansion/nrcan-acquisition"
SOURCE_URL = "https://ftp.maps.canada.ca/pub/nrcan_rncan/Earthquakes_Tremblement-de-terre/canadian-earthquakes_tremblements-de-terre-canadien/eqarchive-en.csv"
DATASET_URL = "https://open.canada.ca/data/en/dataset/4cedd37e-0023-41fe-8eff-bea45385e469"
LICENSE_URL = "https://open.canada.ca/open-government-licence-canada"
EXPECTED_BYTES = 8_178_598
EXPECTED_SHA256 = "f10b91ddbc683406e2f1a642aa8a15fba3d1b46eef3a775f2798cfdc75a31241"
CATALOG_ID = "nrcan-ca-historical"
PROVIDER_NAME = "Natural Resources Canada / Geological Survey of Canada"
PUBLIC = ROOT / "research-data/catalogs/nrcan-ca"
TARGET = ROOT / "system/dist/data/catalogs/nrcan-ca"
FIELDS = ["id", "time", "latitude", "longitude", "depth", "mag", "magType", "net",
          "locationSource", "magSource", "horizontalError", "depthError", "magError",
          "updated", "place", "status", "file", "event_type", "event_url", "raw_depth"]
SOURCE_FIELDS = ["date", "latitude", "longitude", "depth", "magnitude", "magnitude type", "place", "", ""]
ATTRIBUTION = "Contains information licensed under the Open Government Licence – Canada. Source: Natural Resources Canada / Geological Survey of Canada, Earthquakes in Canada."


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(content):
    return hashlib.sha256(content).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def acquire():
    if RAW.exists():
        raise FileExistsError("Raw snapshot exists; do not replace a pinned acquisition silently")
    started = utc_now()
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Seismic-Geosciences-research/1.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        content = response.read(20_000_001)
        headers = dict(response.headers.items())
        final_url = response.url
        status = response.status
    if len(content) > 20_000_000:
        raise ValueError("Resource exceeds the bounded 20 MB acquisition limit")
    if b"<html" in content[:1000].lower():
        raise ValueError("The resource is HTML, not the requested CSV")
    if len(content) != EXPECTED_BYTES or sha(content) != EXPECTED_SHA256:
        raise ValueError("Official resource differs from the inspected snapshot; audit the new bytes before pinning")
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_bytes(content)
    dump(EVIDENCE / "receipt.json", {
        "started_at_utc": started, "completed_at_utc": utc_now(),
        "requested_url": SOURCE_URL, "final_url": final_url,
        "status": status, "response_headers": headers,
        "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
        "dataset_url": DATASET_URL, "license_url": LICENSE_URL,
        "license": "Open Government Licence - Canada 2.0",
    })


def inspect():
    content = RAW.read_bytes()
    reader = csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""))
    fields = next(reader)
    rows = list(reader)
    print(json.dumps({"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                      "fields": fields, "row_count": len(rows),
                      "first": rows[:3], "last": rows[-3:]}, ensure_ascii=False, indent=2))


def build():
    # A public clone can reproduce this optional package from the preserved CSV
    # and its public manifest, without the private acquisition HTTP headers.
    if not RAW.exists() and (PUBLIC / RAW.name).exists():
        preserved = (PUBLIC / RAW.name).read_bytes()
        if len(preserved) != EXPECTED_BYTES or sha(preserved) != EXPECTED_SHA256:
            raise ValueError("Preserved public CSV differs from the pinned snapshot")
        RAW.parent.mkdir(parents=True, exist_ok=True)
        RAW.write_bytes(preserved)
    content = RAW.read_bytes()
    if len(content) != EXPECTED_BYTES or sha(content) != EXPECTED_SHA256:
        raise ValueError("Raw NRCan snapshot differs from the pinned inspected bytes")
    receipt_path = EVIDENCE / "receipt.json"
    license_path = EVIDENCE / "license_evidence.json"
    if receipt_path.exists() and license_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        license_evidence = json.loads(license_path.read_text(encoding="utf-8"))
    else:
        preserved_manifest = json.loads((PUBLIC / "manifest.json").read_text(encoding="utf-8"))
        if preserved_manifest["files"][0]["sha256"] != EXPECTED_SHA256 or preserved_manifest["rights"]["data"] != "Open Government Licence - Canada 2.0":
            raise ValueError("Public manifest does not identify the pinned open-licensed snapshot")
        receipt = {"sha256": EXPECTED_SHA256, "bytes": EXPECTED_BYTES,
                   "completed_at_utc": preserved_manifest["snapshot_acquired_utc"],
                   "response_headers": {"Last-Modified": preserved_manifest["source_resource_last_modified"]}}
        license_evidence = {"dataset": {"resource_url": preserved_manifest["source_url"],
                                       "explicit_license": "Open Government Licence - Canada"}}
    if receipt["sha256"] != EXPECTED_SHA256 or receipt["bytes"] != EXPECTED_BYTES:
        raise ValueError("The acquisition receipt does not describe the input")
    if license_evidence["dataset"]["resource_url"] != SOURCE_URL or license_evidence["dataset"]["explicit_license"] != "Open Government Licence - Canada":
        raise ValueError("The licence evidence does not explicitly identify the requested CSV resource")

    reader = csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""))
    if next(reader) != SOURCE_FIELDS:
        raise ValueError("The source CSV schema differs from the inspected header")
    rows, raw_times, selected_times, latitudes, longitudes = [], [], [], [], []
    occurrences, selected_occurrences = Counter(), Counter()
    raw_types, selected_types, years = Counter(), Counter(), Counter()
    excluded = Counter()
    raw_depth_values = []
    missing = Counter()
    row_count = 0
    unnamed_populated_rows = 0
    id_hashes = {}
    for line_number, cells in enumerate(reader, start=2):
        row_count += 1
        if len(cells) != len(SOURCE_FIELDS):
            raise ValueError(f"Unexpected CSV width at line {line_number}")
        instant = datetime.strptime(cells[0], "%Y-%m-%dT%H:%M:%S%z")
        if instant.tzinfo is None or instant.utcoffset() != timedelta(0):
            raise ValueError(f"Origin time is not explicitly UTC at line {line_number}")
        time = instant.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        raw_times.append(time)
        numeric = {}
        for index, name in [(1, "latitude"), (2, "longitude"), (3, "raw_depth"), (4, "mag")]:
            numeric[name] = float(cells[index]) if cells[index] else None
            if numeric[name] is not None and not math.isfinite(numeric[name]):
                raise ValueError(f"Non-finite {name} at line {line_number}")
            missing[name] += numeric[name] is None
        if numeric["latitude"] is None or not -90 <= numeric["latitude"] <= 90:
            raise ValueError(f"Missing/invalid latitude at line {line_number}")
        if numeric["longitude"] is None or not -180 <= numeric["longitude"] <= 180:
            raise ValueError(f"Missing/invalid longitude at line {line_number}")
        raw_types[cells[5]] += 1
        raw_depth_values.append(numeric["raw_depth"])
        unnamed_populated_rows += any(cell.strip() for cell in cells[7:])

        # Content-derived record keys are never represented as agency event IDs.
        # Duplicate records receive distinct occurrence suffixes and are retained.
        full_hash = sha(compact(cells))
        short_hash = full_hash[:24]
        if short_hash in id_hashes and id_hashes[short_hash] != full_hash:
            raise ValueError("Derived record key prefix collision")
        id_hashes[short_hash] = full_hash
        occurrences[full_hash] += 1
        identifier = f"nrcan-local-{short_hash}-{occurrences[full_hash]}"
        if numeric["mag"] is None:
            excluded["missing_magnitude"] += 1
            continue
        if numeric["mag"] < 3.5:
            excluded["magnitude_below_3_5"] += 1
            continue
        # No event-type column exists. Do not fabricate earthquake classifications.
        record = {field: "" for field in FIELDS}
        record.update(id=identifier, time=time, latitude=numeric["latitude"],
                      longitude=numeric["longitude"], depth=None, mag=numeric["mag"],
                      magType=cells[5], horizontalError=None, depthError=None, magError=None,
                      place=", ".join(cell for cell in cells[6:] if cell), file=RAW.name,
                      event_type="", event_url=DATASET_URL, raw_depth=cells[3])
        rows.append([record[field] for field in FIELDS])
        selected_occurrences[full_hash] += 1
        selected_types[cells[5]] += 1
        selected_times.append(time)
        years[instant.year] += 1
        latitudes.append(numeric["latitude"])
        longitudes.append(numeric["longitude"])
    if not rows:
        raise ValueError("Magnitude selection unexpectedly produced no records")
    if len(rows) + sum(excluded.values()) != row_count:
        raise ValueError("Selection counts do not reconcile")
    if len({row[0] for row in rows}) != len(rows):
        raise ValueError("Derived row keys must be unique within the snapshot")

    bounds = [[min(latitudes), min(longitudes)], [max(latitudes), max(longitudes)]]
    coverage_period = {"start_utc": min(selected_times), "end_inclusive_utc": max(selected_times),
                       "meaning": "First and last observed origin time after the magnitude selection; not a completeness claim."}
    stats = {"raw_rows": row_count, "packaged_records": len(rows), "excluded_rows": dict(excluded),
             "excluded_non_earthquake_rows": None,
             "event_type_filter_applied": False, "source_event_type_column": None,
             "raw_exact_duplicate_rows_retained": sum(n-1 for n in occurrences.values()),
             "selected_exact_duplicate_rows_retained": sum(n-1 for n in selected_occurrences.values()),
             "source_magnitude_types": dict(sorted(raw_types.items())),
             "packaged_magnitude_types": dict(sorted(selected_types.items())),
             "by_origin_year": dict(sorted(years.items())),
             "source_missing_numeric_fields": dict(sorted(missing.items())),
             "source_coverage_period": {"start_utc": min(raw_times), "end_inclusive_utc": max(raw_times)},
             "source_raw_depth_numeric_range": [min(x for x in raw_depth_values if x is not None),
                                                  max(x for x in raw_depth_values if x is not None)],
             "unnamed_place_continuation_rows": unnamed_populated_rows,
             "observed_latitude_range": [min(latitudes), max(latitudes)],
             "observed_source_longitude_range": [min(longitudes), max(longitudes)]}
    identity = {"identifier_kind": "derived_row_key", "original_event_id": None,
                "source_event_id_column": None,
                "recipe": "nrcan-local- + first24hex(SHA256(UTF-8 compact JSON array of all original CSV cells)) + '-' + occurrence number of that exact cell array in source order",
                "meaning": "A local record key, not an observed agency event identifier or proof of a unique physical event."}
    events = {"schema_version": 1, "fields": FIELDS, "rows": rows, **identity,
              "depth_unit": None, "raw_depth_unit": None}
    event_bytes = compact(events)
    limits = [
        "Historical NRCan-distributed records from 1985 through 2019, not a 2020-2025 or live catalogue.",
        "Geographic coverage includes offshore and surrounding areas. No country is inferred from coordinates or place strings.",
        "The CSV supplies no original event identifiers. All id values are explicitly derived local row keys.",
        "Exact repeated source records are retained with distinct occurrence suffixes; row counts are not unique physical-event counts.",
        "No event-type field is provided. Event type remains empty; individual non-earthquake exclusions cannot be performed from this resource.",
        "Reported magnitude types retain their exact case and values. No magnitude scale conversion or homogeneity is asserted.",
        "Dates have an explicit +0000 UTC offset in the source; ISO formatting is normalized to Z without changing the instant.",
        "The source header and linked layer metadata do not document a depth unit. Common depth is null; raw_depth retains the source text without a unit conversion.",
        "Latitude and longitude are preserved geographic coordinates; the CSV does not state a horizontal datum.",
        "Uncertainties, solution authors, revision timestamps and review status are not supplied and remain absent.",
        "Two unnamed CSV columns hold place-name continuations or notes; nonempty cells from place onward are joined with a comma for display.",
        "The event_url field links to the source catalogue record, not an event-specific page.",
        "A distinct distribution provider does not prove observational independence from USGS ComCat contributions.",
        "This optional exploration does not modify the paper's frozen Mexico snapshot or revision pilot.",
    ]
    manifest = {"schema_version": 1, "catalog_id": CATALOG_ID, "provider": "nrcan",
                "provider_name": PROVIDER_NAME, "snapshot_commit": "sha256:" + EXPECTED_SHA256,
                "snapshot_acquired_utc": receipt["completed_at_utc"],
                "source_resource_last_modified": receipt["response_headers"].get("Last-Modified"),
                "source_url": SOURCE_URL, "dataset_url": DATASET_URL,
                "official_catalogue": {"institution": PROVIDER_NAME, "title": "Earthquakes in Canada", "url": DATASET_URL},
                "source_fields": SOURCE_FIELDS, "minimum_magnitude": 3.5,
                "coverage_period": coverage_period, "bounds": bounds,
                "files": [{"path": RAW.name, "url": SOURCE_URL, "bytes": len(content),
                           "sha256": EXPECTED_SHA256, "observed_rows": row_count}],
                "derived_asset_sha256": sha(event_bytes), **identity,
                "depth_unit": None, "raw_depth_unit": None,
                "depth_unit_status": "not_documented_in_source",
                "raw_depth_field": "raw_depth", "event_url_kind": "catalogue_landing_page",
                "attribution": ATTRIBUTION,
                "rights": {"data": "Open Government Licence - Canada 2.0", "license_url": LICENSE_URL,
                           "license_assertion_source": DATASET_URL, "license_scope": "The explicitly linked CSV resource only.",
                           "attribution": ATTRIBUTION,
                           "non_endorsement": "This application is not an official NRCan product and does not imply government endorsement."},
                **stats, "limits": limits}
    manifest_bytes = compact(manifest)
    TARGET.mkdir(parents=True, exist_ok=True)
    (TARGET / "events.json").write_bytes(event_bytes)
    (TARGET / "manifest.json").write_bytes(manifest_bytes)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / RAW.name).write_bytes(content)
    (PUBLIC / "manifest.json").write_bytes(manifest_bytes)
    (PUBLIC / "README.md").write_text(
        "# NRCan historical catalogue snapshot\n\n"
        "Original English CSV of **Earthquakes in Canada**, distributed by Natural Resources Canada / Geological Survey of Canada. "
        f"[Official dataset]({DATASET_URL}) · [Official resource]({SOURCE_URL}).\n\n"
        f"The resource is explicitly listed under the [Open Government Licence – Canada 2.0]({LICENSE_URL}). {ATTRIBUTION} "
        "No official status or government endorsement is implied. The project's software MIT licence does not replace this data licence.\n\n"
        f"The original {len(content):,} bytes are preserved, SHA-256 `{EXPECTED_SHA256}`. "
        f"The source contains {row_count:,} records from 1985–2019; the explorer selects {len(rows):,} records with reported magnitude ≥3.5. "
        "It preserves magnitude types and repeated rows. Original event IDs, event types and uncertainty/revision metadata are absent. "
        "All displayed record keys are locally derived. No territorial classification, magnitude conversion or independent-event count is inferred.\n\n"
        "The source does not document a depth unit in the CSV or linked layer metadata. `raw_depth` retains the literal source value; "
        "the common depth field is null and does not participate in kilometre filters. See `manifest.json` for the complete transformation contract. "
        "Acquisition headers and the licence-inspection evidence remain local, outside the web artifact.\n",
        encoding="utf-8")
    entry = {"id": CATALOG_ID, "provider": "nrcan", "provider_name": PROVIDER_NAME,
             "label": {"es": "Canadá y alrededores · 1985–2019", "en": "Canada and surroundings · 1985–2019"},
             "events_url": "data/catalogs/nrcan-ca/events.json", "manifest_url": "data/catalogs/nrcan-ca/manifest.json",
             "sha256": sha(event_bytes), "manifest_sha256": sha(manifest_bytes), "bounds": bounds,
             "years": [min(years), max(years)], "minimum_magnitude": 3.5,
             "snapshot": "sha256:" + EXPECTED_SHA256, "role": "exploration", "event_count": len(rows),
             "record_count": len(rows), "count_unit": "records", "coverage_period": coverage_period,
             "identifier_kind": "derived_row_key", "original_event_id": None,
             "depth_unit": None, "raw_depth_unit": None, "depth_unit_status": "not_documented_in_source",
             "raw_depth_field": "raw_depth", "event_type_provided": False,
             "provider_url": DATASET_URL}
    dump(ROOT / "outputs/expansion/canada_entry.json", entry)
    dump(ROOT / "outputs/expansion/canada_catalog_audit.json", {
        "checked_utc": utc_now(), "catalog_id": CATALOG_ID,
        "source_sha256": EXPECTED_SHA256, "source_bytes": len(content),
        "events_sha256": sha(event_bytes), "manifest_sha256": sha(manifest_bytes),
        "statistics": stats, "entry": entry,
        "source_public_copy_identical": (PUBLIC / RAW.name).read_bytes() == content,
        "original_mexico_assets_modified": False})
    print(json.dumps({"catalog_id": CATALOG_ID, "raw_rows": row_count,
                      "packaged_records": len(rows), "retained_exact_repeated_rows": stats["selected_exact_duplicate_rows_retained"],
                      "years": [min(years), max(years)], "bounds": bounds,
                      "events_sha256": sha(event_bytes), "manifest_sha256": sha(manifest_bytes)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--acquire", action="store_true", help="Acquire the official CSV once, without overwriting")
    parser.add_argument("--inspect", action="store_true", help="Inspect the CSV without writing a public package")
    args = parser.parse_args()
    if args.acquire:
        acquire()
    if args.inspect:
        inspect()
    else:
        build()


if __name__ == "__main__":
    main()
