"""Audit retained ComCat origin-product versions, without reconstructing snapshots.

Standard-library-only, bounded empirical pilot. The cohorts are selected using
CURRENT preferred parameters, so past events that moved out of the selection are
not recovered. The earliest retained product is not necessarily the first issued
solution. Product uploaders, solution agencies, and magnitude agencies are kept
separate. Only public ``origin`` products enter the primary comparison.

Run ``python scripts/audit_revisions.py --fetch`` once with network access, then
``python scripts/audit_revisions.py`` for hash-checked offline reproduction.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import statistics
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "revisions"
OUT = ROOT / "outputs" / "revisions"
API = "https://earthquake.usgs.gov/fdsnws/event/1/"
YEARS = (2017, 2022)
THRESHOLDS = (5.5, 6.0, 6.5, 7.0, 7.5, 8.0)
STATE_FIELDS = (
    "eventtime", "latitude", "longitude", "depth", "depth-type", "magnitude",
    "magnitude-type", "origin-source", "magnitude-source",
    "eventtime-error", "horizontal-error", "vertical-error", "magnitude-error",
    "latitude-error", "longitude-error", "standard-error", "azimuthal-gap",
    "minimum-distance", "num-phases-used", "num-stations-used", "magnitude-num-stations-used",
    "error-ellipse-azimuth", "error-ellipse-intermediate", "error-ellipse-major",
    "error-ellipse-minor", "error-ellipse-plunge", "error-ellipse-rotation",
)
TEXT_STATE_FIELDS = {"eventtime", "depth-type", "magnitude-type", "origin-source", "magnitude-source"}
LIMITATIONS = [
    "Current-cohort selection: the query uses current preferred time, location and magnitude.",
    "The rectangle includes offshore areas and parts of neighbouring countries; it is not a country assignment.",
    "Only retained products observed at retrieval are audited; archive completeness is unknown.",
    "Earliest retained active origin is not necessarily the first issued origin.",
    "No historical preferred-product sequence or complete as-of catalogue is reconstructed.",
    "Product updateTime, indexTime, event origin time and retrieval time are different clocks.",
    "Event properties.updated can change when a non-origin product changes.",
    "The most recently retained active US origin is not an independently validated ground truth.",
    "Magnitude differences are compared only within an unchanged magnitude type; no scale conversion is performed.",
    "Public origin, internal-origin and phase-data products remain separate.",
    "The metadata_only count means unchanged selected parameter, uncertainty and station-count fields; other omitted fields can change, so it does not prove absence of a revision.",
    "No earthquake prediction, observed damage or population-at-risk estimate is produced.",
]
DOCS = {
    "query_api": API,
    "product_versions": "https://earthquake.usgs.gov/data/comcat/products.php",
    "geojson_detail": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php",
    "unm_contributor": "https://earthquake.usgs.gov/data/comcat/contributor/unm/",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def iso_ms(value):
    if value is None:
        return None
    return datetime.fromtimestamp(int(value) / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def as_float(value):
    try:
        result = float(value)
    except (ValueError, TypeError):
        return None
    return result if math.isfinite(result) else None


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def query_parameters(year):
    return {
        "format": "geojson", "starttime": f"{year}-01-01T00:00:00.000Z",
        "endtime": f"{year}-12-31T23:59:59.999Z", "minlatitude": 14,
        "maxlatitude": 33, "minlongitude": -118, "maxlongitude": -86,
        "minmagnitude": 5.5, "eventtype": "earthquake",
    }


def download(url, relative_path):
    """Preserve exact HTTP response body bytes and both sides of retrieval time."""
    request = Request(url, headers={"User-Agent": "SeismicDataGeosciences-revision-audit/1.0 (research; no credentials)"})
    started = utc_now()
    for attempt in range(3):
        try:
            with urlopen(request, timeout=90) as response:
                raw = response.read()
                headers = {key: response.headers.get(key) for key in ("Content-Type", "Date", "ETag", "Last-Modified")}
                final_url = response.url
                status = response.status
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)
    # Parsing is validation only; the saved body is never serialized again.
    json.loads(raw)
    # Content-addressed bodies also preserve partial acquisitions after failures.
    relative_path = relative_path.with_name(relative_path.stem + "_" + sha256(raw) + relative_path.suffix)
    path = RAW / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != raw:
        raise ValueError("Content-addressed evidence collision")
    if not path.exists():
        path.write_bytes(raw)
    return {
        "path": relative_path.as_posix(), "request_url": url, "response_url": final_url,
        "retrieval_started_utc": started, "retrieved_utc": utc_now(), "http_status": status,
        "response_headers": headers, "bytes": len(raw), "sha256": sha256(raw),
    }


def fetch():
    """Count both cohorts first, fail rather than truncate, then fetch every ID."""
    manifest_path = RAW / "manifest.json"
    if manifest_path.exists():
        raise FileExistsError("An acquisition already exists. Reproduce offline; do not overwrite evidence.")
    manifest = {"schema_version": 1, "acquisition_started_utc": utc_now(), "cohorts": [], "events": [], "documents": DOCS, "limitations": LIMITATIONS}
    for year in YEARS:
        params = query_parameters(year)
        count_record = download(API + "count?" + urlencode(params), Path(f"cohort_{year}_count.geojson"))
        count = json.loads((RAW / count_record["path"]).read_bytes())
        expected = int(count["count"])
        allowed = int(count["maxAllowed"])
        if expected > allowed:
            raise ValueError(f"Cohort {year} exceeds API maximum: {expected}>{allowed}; split query before proceeding.")
        manifest["cohorts"].append({"year": year, "parameters": params, "count": count_record, "expected_count": expected, "max_allowed": allowed})
    for cohort in manifest["cohorts"]:
        params = dict(cohort["parameters"], orderby="time-asc", limit=cohort["max_allowed"])
        record = download(API + "query?" + urlencode(params), Path(f"cohort_{cohort['year']}.geojson"))
        collection = json.loads((RAW / record["path"]).read_bytes())
        features = collection["features"]
        if len(features) != cohort["expected_count"] or collection["metadata"].get("count", len(features)) != len(features):
            raise ValueError("Count/query disagreement: current catalogue may have changed; no truncated analysis is accepted.")
        ids = [feature["id"] for feature in features]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate event IDs in cohort query")
        cohort.update(query=record, event_ids=ids, returned_count=len(ids))
        for event_id in ids:
            if not event_id.isalnum():
                raise ValueError(f"Unexpected event identifier: {event_id!r}")
            url = API + "query?" + urlencode({"format": "geojson", "eventid": event_id, "includesuperseded": "true"})
            item = download(url, Path("events") / f"{event_id}.geojson")
            item.update(query_event_id=event_id, cohort_year=cohort["year"])
            manifest["events"].append(item)
            write_json(RAW / "acquisition_progress.json", manifest)
            print(f"Retrieved {len(manifest['events'])}: {event_id}", flush=True)
    manifest["acquisition_finished_utc"] = utc_now()
    write_json(manifest_path, manifest)
    return manifest


def load_verified(record):
    raw = (RAW / record["path"]).read_bytes()
    if len(raw) != record["bytes"] or sha256(raw) != record["sha256"]:
        raise ValueError(f"Evidence hash/length mismatch: {record['path']}")
    return json.loads(raw)


def product_key(product):
    return (product["source"], product["type"], product["code"], int(product["updateTime"]))


def unique_products(products):
    """Identical repeats are harmless; conflicting version identities are fatal."""
    by_key = {}
    for product in products:
        key = product_key(product)
        if key in by_key and by_key[key] != product:
            raise ValueError(f"Conflicting product version identity: {key}")
        by_key[key] = product
    return sorted(by_key.values(), key=lambda product: (product["source"], product["type"], product["code"], int(product["updateTime"])))


def source_roles(product):
    props = product.get("properties", {})
    return {
        "uploader": product["source"], "event_source": props.get("eventsource"),
        "origin_source": props.get("origin-source"), "magnitude_source": props.get("magnitude-source"),
    }


def primary_series(products, canonical_event_id):
    # No source-only filtering: a US uploader can publish an ISC-GEM origin.
    return sorted((p for p in unique_products(products) if (p["source"], p["type"], p["code"]) == ("us", "origin", canonical_event_id)), key=lambda p: int(p["updateTime"]))


def numerical_state(product):
    props = product.get("properties", {})
    return tuple(props.get(key) if key in TEXT_STATE_FIELDS else as_float(props.get(key)) for key in STATE_FIELDS)


def haversine_km(first, last):
    a, b = first.get("properties", {}), last.get("properties", {})
    coordinates = [as_float(a.get("latitude")), as_float(a.get("longitude")), as_float(b.get("latitude")), as_float(b.get("longitude"))]
    if any(value is None for value in coordinates):
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, coordinates)
    term = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(term)))


def endpoint_metrics(series, summary_updated=None):
    active = [p for p in series if p.get("status") != "DELETE"]
    result = {"retained_version_count": len(series), "retained_active_count": len(active), "retained_delete_count": len(series) - len(active), "latest_retained_is_delete": bool(series and series[-1].get("status") == "DELETE"), "initial_solution_known": False}
    if not active:
        return result
    first, last = active[0], active[-1]
    a, b = first.get("properties", {}), last.get("properties", {})
    m1, m2 = as_float(a.get("magnitude")), as_float(b.get("magnitude"))
    same_type = bool(a.get("magnitude-type")) and a.get("magnitude-type") == b.get("magnitude-type")
    comparable = same_type and m1 is not None and m2 is not None
    d1, d2 = as_float(a.get("depth")), as_float(b.get("depth"))
    result.update(
        earliest_retained_active_update_ms=int(first["updateTime"]), latest_retained_active_update_ms=int(last["updateTime"]),
        earliest_retained_active_update_utc=iso_ms(first["updateTime"]), latest_retained_active_update_utc=iso_ms(last["updateTime"]),
        earliest_magnitude=m1, latest_magnitude=m2, earliest_magnitude_type=a.get("magnitude-type"), latest_magnitude_type=b.get("magnitude-type"),
        same_endpoint_magnitude_type=same_type, comparable_endpoint_magnitude=comparable,
        same_type_magnitude_delta=round(m2 - m1, 10) if comparable else None,
        earliest_depth_km=d1, latest_depth_km=d2, depth_delta_km=(d2 - d1) if d1 is not None and d2 is not None else None,
        epicentre_displacement_km=haversine_km(first, last),
        earliest_event_time=a.get("eventtime"), latest_event_time=b.get("eventtime"),
        event_summary_updated_utc=iso_ms(summary_updated),
        summary_update_minus_latest_origin_days=(int(summary_updated) - int(last["updateTime"])) / 86400000 if summary_updated is not None else None,
        parameter_state_count=len({numerical_state(p) for p in active}),
        adjacent_parameter_changes=sum(numerical_state(x) != numerical_state(y) for x, y in zip(active, active[1:])),
        adjacent_metadata_only_updates=sum(numerical_state(x) == numerical_state(y) for x, y in zip(active, active[1:])),
        endpoint_threshold_crossings=[threshold for threshold in THRESHOLDS if comparable and (m1 >= threshold) != (m2 >= threshold)],
    )
    type_values = {}
    for product in active:
        props = product.get("properties", {})
        value = as_float(props.get("magnitude"))
        mag_type = str(props.get("magnitude-type") or "")
        if value is not None and mag_type:
            type_values.setdefault(mag_type, []).append(value)
    result["retained_within_type_threshold_variation"] = {mag_type: [threshold for threshold in THRESHOLDS if min(values) < threshold <= max(values)] for mag_type, values in sorted(type_values.items())}
    return result


def flattened_row(event_id, year, product, evidence):
    props = product.get("properties", {})
    row = {
        "event_id": event_id, "cohort_year": year, "product_id": product.get("id"),
        "uploader_source": product["source"], "product_type": product["type"], "product_code": product["code"],
        "update_time_ms": int(product["updateTime"]), "update_time_utc": iso_ms(product["updateTime"]),
        "index_time_ms": product.get("indexTime"), "index_time_utc": iso_ms(product.get("indexTime")),
        "status": product.get("status"), "preferred_weight_at_retrieval": product.get("preferredWeight"),
        "is_primary_us_series": (product["source"], product["type"], product["code"]) == ("us", "origin", event_id),
        "evidence_sha256": evidence["sha256"], "request_url": evidence["request_url"],
        "retrieved_utc": evidence["retrieved_utc"],
    }
    for field in ("eventsource", "eventsourcecode", "origin-source", "magnitude-source", "eventtime", "latitude", "longitude", "depth", "depth-type", "magnitude", "magnitude-type", "evaluation-status", "review-status", "horizontal-error", "vertical-error", "magnitude-error", "standard-error"):
        row[field.replace("-", "_")] = props.get(field)
    return row


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = list(dict.fromkeys(field for row in rows for field in row))
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value, separators=(",", ":")) if isinstance(value, (list, dict)) else value for key, value in row.items()})


def distribution(values):
    values = sorted(value for value in values if value is not None)
    return {"n": len(values), "min": min(values) if values else None, "median": statistics.median(values) if values else None, "max": max(values) if values else None}


def analyse(manifest):
    for cohort in manifest["cohorts"]:
        count = load_verified(cohort["count"])
        collection = load_verified(cohort["query"])
        if count["count"] != len(collection["features"]) or cohort["event_ids"] != [f["id"] for f in collection["features"]]:
            raise ValueError("Cohort evidence no longer agrees")
    rows, events, related, system_events = [], [], [], []
    uploader, origin_agencies, magnitude_agencies, statuses = Counter(), Counter(), Counter(), Counter()
    for evidence in manifest["events"]:
        event = load_verified(evidence)
        canonical_id = event["id"]
        products = event["properties"].get("products", {})
        origins = unique_products(products.get("origin", []))
        if any(product["type"] != "origin" for product in origins):
            raise ValueError("Non-origin product inside the origin array")
        series = primary_series(origins, canonical_id)
        metrics = endpoint_metrics(series, event["properties"].get("updated"))
        active_primary = [p for p in series if p.get("status") != "DELETE"]
        metrics.update(event_id=canonical_id, query_event_id=evidence["query_event_id"], cohort_year=evidence["cohort_year"],
            observed_origin_product_count=len(origins), origin_branch_count=len({(p["source"], p["type"], p["code"]) for p in origins}),
            current_preferred_magnitude=event["properties"].get("mag"), current_preferred_magnitude_type=event["properties"].get("magType"),
            current_summary_sources=event["properties"].get("sources"), current_associated_ids=event["properties"].get("ids"),
            evidence_sha256=evidence["sha256"], request_url=evidence["request_url"], retrieved_utc=evidence["retrieved_utc"],
            primary_latest_origin_source=active_primary[-1].get("properties", {}).get("origin-source") if active_primary else None,
            primary_latest_magnitude_source=active_primary[-1].get("properties", {}).get("magnitude-source") if active_primary else None)
        if origins:
            latest_any_update = max(int(p["updateTime"]) for p in origins)
            metrics["latest_any_origin_update_ms"] = latest_any_update
            metrics["latest_any_origin_update_utc"] = iso_ms(latest_any_update)
            metrics["summary_update_minus_latest_any_origin_days"] = (int(event["properties"]["updated"]) - latest_any_update) / 86400000
        for p in origins:
            rows.append(flattened_row(canonical_id, evidence["cohort_year"], p, evidence))
            roles = source_roles(p)
            uploader[roles["uploader"]] += 1
            origin_agencies[roles["origin_source"] or "MISSING"] += 1
            magnitude_agencies[roles["magnitude_source"] or "MISSING"] += 1
            statuses[p.get("status", "MISSING")] += 1
        events.append(metrics)
        system_events.append({
            "id": canonical_id, "cohort_year": evidence["cohort_year"],
            "event_url": event["properties"].get("url"),
            "query_url": evidence["request_url"],
            "raw_url": evidence["request_url"],
            "raw_file": (Path("data") / "raw" / "revisions" / evidence["path"]).as_posix(),
            "raw_sha256": evidence["sha256"], "retrieved_utc": evidence["retrieved_utc"],
            "versions": [{
                "update_time_utc": iso_ms(p["updateTime"]), "update_time_ms": int(p["updateTime"]),
                "product_id": p.get("id"), "magnitude": as_float(p.get("properties", {}).get("magnitude")),
                "magnitude_type": p.get("properties", {}).get("magnitude-type"),
                "depth_km": as_float(p.get("properties", {}).get("depth")),
                "latitude": as_float(p.get("properties", {}).get("latitude")),
                "longitude": as_float(p.get("properties", {}).get("longitude")),
                "origin_source": p.get("properties", {}).get("origin-source"),
                "magnitude_source": p.get("properties", {}).get("magnitude-source"),
                "uploader_source": p["source"], "product_type": p["type"], "product_code": p["code"],
                "status": p.get("status"),
            } for p in series],
            "note": "One retained US origin-product branch. Earliest retained is not necessarily first issued. Query/raw URL is a live service and can change; the archived file is identified by SHA-256. No historical preferred-product sequence is reconstructed.",
        })
        related.append({"event_id": canonical_id, "internal_origin_count": len(products.get("internal-origin", [])), "phase_data_count": len(products.get("phase-data", [])), "excluded_from_primary": True})
    OUT.mkdir(parents=True, exist_ok=True)
    write_csv(OUT / "origin_versions.csv", rows)
    write_csv(OUT / "event_metrics.csv", events)
    write_csv(OUT / "separate_product_counts.csv", related)
    summary = {
        "schema_version": 1, "analysis_generated_utc": utc_now(), "raw_manifest_sha256": sha256((RAW / "manifest.json").read_bytes()),
        "analysis_script_sha256": sha256(Path(__file__).read_bytes()),
        "cohort_parameters": [dict(year=c["year"], current_count=c["returned_count"], parameters=c["parameters"]) for c in manifest["cohorts"]],
        "primary_selector": {"source": "us", "type": "origin", "code": "canonical event ID"},
        "event_count": len(events), "origin_product_version_count": len(rows), "origin_status_counts": dict(statuses),
        "events_with_primary_us_series": sum(e["retained_active_count"] > 0 for e in events),
        "events_with_multiple_primary_active_versions": sum(e["retained_active_count"] > 1 for e in events),
        "primary_us_active_version_count": sum(e["retained_active_count"] for e in events),
        "primary_us_delete_version_count": sum(e["retained_delete_count"] for e in events),
        "events_with_latest_primary_tombstone": sum(e["latest_retained_is_delete"] for e in events),
        "uploader_source_version_counts": dict(uploader), "origin_agency_version_counts": dict(origin_agencies), "magnitude_agency_version_counts": dict(magnitude_agencies),
        "events_with_same_endpoint_magnitude_type": sum(e.get("same_endpoint_magnitude_type", False) for e in events),
        "events_with_changed_same_type_endpoint_magnitude": sum(e.get("same_type_magnitude_delta") not in (None, 0) for e in events),
        "same_type_endpoint_magnitude_delta": distribution(e.get("same_type_magnitude_delta") for e in events),
        "endpoint_depth_delta_km": distribution(e.get("depth_delta_km") for e in events),
        "endpoint_epicentre_displacement_km": distribution(e.get("epicentre_displacement_km") for e in events),
        "summary_update_minus_latest_primary_origin_days": distribution(e.get("summary_update_minus_latest_origin_days") for e in events),
        "summary_update_minus_latest_any_origin_days": distribution(e.get("summary_update_minus_latest_any_origin_days") for e in events),
        "endpoint_threshold_crossing_event_counts": {str(t): sum(t in e.get("endpoint_threshold_crossings", []) for e in events) for t in THRESHOLDS},
        "any_retained_within_type_threshold_variation_event_counts": {str(t): sum(any(t in crossings for crossings in e.get("retained_within_type_threshold_variation", {}).values()) for e in events) for t in THRESHOLDS},
        "metadata_only_adjacent_primary_updates": sum(e.get("adjacent_metadata_only_updates", 0) for e in events),
        "unchanged_selected_fields_adjacent_primary_updates": sum(e.get("adjacent_metadata_only_updates", 0) for e in events),
        "parameter_changing_adjacent_primary_updates": sum(e.get("adjacent_parameter_changes", 0) for e in events),
        "selected_parameter_state_fields": list(STATE_FIELDS),
        "separate_internal_origin_version_count": sum(e["internal_origin_count"] for e in related),
        "separate_phase_data_version_count": sum(e["phase_data_count"] for e in related),
        "earth_model_for_epicentre_distance": {"method": "haversine on mean-radius sphere", "radius_km": 6371.0088},
        "limitations": LIMITATIONS, "documents": DOCS,
    }
    write_json(OUT / "summary.json", summary)
    write_json(OUT / "event_metrics.json", events)
    write_json(OUT / "system.json", {
        "available": True, "schema_version": 1,
        "scope": "Current-catalog-selected 2017/2022 cohort, M >= 5.5, latitude 14 to 33 and longitude -118 to -86. The rectangle includes offshore areas and neighbouring countries. Retained US origin-product versions only.",
        "events": system_events, "summary": summary,
    })
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Acquire bounded current cohorts and all retained detail products; never overwrite an existing acquisition.")
    args = parser.parse_args()
    manifest = fetch() if args.fetch else json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))
    analyse(manifest)


if __name__ == "__main__":
    main()
