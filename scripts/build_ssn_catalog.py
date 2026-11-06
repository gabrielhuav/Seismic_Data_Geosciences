"""Package the pinned, human-downloaded SSN CSV without running private code.

Acquisition uses the official catalogue UI. This offline adapter never submits
CAPTCHAs, contacts a service, replaces an acquisition, or infers missing fields.
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
import shutil

ROOT = Path(__file__).resolve().parents[1]
RAW_NAME = "ssn_19000101_20261106.csv"
RAW = ROOT / "data/raw/catalogs/ssn-mx" / RAW_NAME
PUBLIC = ROOT / "research-data/catalogs/ssn-mx"
TARGET = ROOT / "system/dist/data/catalogs/ssn-mx"
EXPECTED_BYTES = 45_950_120
EXPECTED_SHA256 = "0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993"
TERMS_SHA256 = "5a9b639321dfff0a2212a7f66334b7c341502eef4f4a33c28ecf16cea88b5a30"
TERMS_BYTES = 21_545
CATALOG_ID = "ssn-mx-historical"
PROVIDER_NAME = "Servicio Sismológico Nacional / Instituto de Geofísica, UNAM"
CATALOGUE_URL = "http://www2.ssn.unam.mx:8080/catalogo/"
LEGAL_URL = "http://www.ssn.unam.mx/aviso-legal/"
DOI = "10.21766/SSNMX/EC/MX"
DOWNLOAD_MTIME_UTC = "2026-11-06T21:03:16.394588Z"
MINIMUM_MAGNITUDE = 3.5
SOURCE_FIELDS = ["Fecha UTC", "Hora UTC", "Magnitud", "Latitud", "Longitud",
                 "Profundidad", "Referencia de localizacion", "Fecha local", "Hora local", "Estatus"]
FIELDS = ["id", "time", "latitude", "longitude", "depth", "mag", "magType", "net",
          "locationSource", "magSource", "horizontalError", "depthError", "magError",
          "updated", "place", "status", "file", "event_type", "event_url",
          "source_record", "raw_utc_date", "raw_utc_time", "raw_local_date", "raw_local_time",
          "raw_magnitude", "raw_depth", "raw_status"]
UNKNOWN_FIELDS = ["magType", "net", "locationSource", "magSource", "horizontalError",
                  "depthError", "magError", "updated", "event_type"]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(compact(value))


def verify_source(raw, expected_sha=EXPECTED_SHA256, expected_bytes=EXPECTED_BYTES):
    if len(raw) != expected_bytes or sha(raw) != expected_sha:
        raise ValueError("SSN CSV differs from the pinned inspected bytes")


def parse_time(date, time):
    # The column labels explicitly state UTC. No local offset is imputed.
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) or not re.fullmatch(r"\d{2}:\d{2}:\d{2}", time):
        raise ValueError("Unexpected SSN date/time representation")
    return datetime.strptime(date + "T" + time, "%Y-%m-%dT%H:%M:%S")


def row_key(cells, occurrences, prefixes):
    digest = sha(compact(cells))
    prefix = digest[:24]
    if prefix in prefixes and prefixes[prefix] != digest:
        raise ValueError("Derived SSN record-key prefix collision")
    prefixes[prefix] = digest
    occurrences[digest] += 1
    return "ssn-local-" + prefix + "-" + str(occurrences[digest]), digest


def parse_snapshot(raw, minimum_magnitude=MINIMUM_MAGNITUDE):
    """Audit all source rows; select numeric magnitudes and valid map records.

    The parser is separately testable with synthetic CSVs. Production build()
    first verifies the exact inspected source checksum and count.
    """
    if minimum_magnitude != MINIMUM_MAGNITUDE:
        raise ValueError("This pinned selection uses the fixed reported-M>=3.5 predicate")
    reader = csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    headers = []
    for _ in range(4):
        record = next(reader, None)
        if record is None or len(record) != 1:
            raise ValueError("SSN metadata must contain four one-cell records")
        headers.append(record[0])
    if next(reader, None) != SOURCE_FIELDS:
        raise ValueError("SSN source columns differ from the inspected schema")
    count_match = re.fullmatch(r"Total: (\d+) eventos\.", headers[3])
    period_match = re.fullmatch(r"Sismicidad del (\d{4}-\d{2}-\d{2}) al (\d{4}-\d{2}-\d{2}) \(UTC\), todas las magnitudes, todas las profundidades, en todo el pais\.", headers[2])
    generated_match = re.search(r"Archivo generado el (\d{4}-\d{2}-\d{2}) a las (\d{2}:\d{2}:\d{2}) \(tiempo del centro de Mexico\)", headers[1])
    if not count_match or not period_match or not generated_match:
        raise ValueError("SSN count, UTC query or generation label is not explicit")
    declared_rows = int(count_match[1])
    query_start = datetime.fromisoformat(period_match[1]).replace(tzinfo=timezone.utc)
    query_stop = datetime.fromisoformat(period_match[2]).replace(tzinfo=timezone.utc) + timedelta(days=1)
    generated_local = parse_time(generated_match[1], generated_match[2])
    rows = []
    occurrences, prefixes, selected_hashes = Counter(), {}, Counter()
    missing, invalid, invalid_tokens, excluded = Counter(), Counter(), Counter(), Counter()
    statuses, selected_statuses, years, selected_years, offsets = Counter(), Counter(), Counter(), Counter(), Counter()
    source_first = source_last = selected_first = selected_last = None
    source_mag_min, source_mag_max = math.inf, -math.inf
    lat_min, lat_max, lon_min, lon_max = math.inf, -math.inf, math.inf, -math.inf
    depth_min, depth_max = math.inf, -math.inf
    clock_rows, selected_clock_rows = [], []
    local_time_invalid = 0
    for ordinal in range(1, declared_rows + 1):
        cells = next(reader, None)
        if cells is None or len(cells) != len(SOURCE_FIELDS):
            raise ValueError(f"Unexpected SSN row width at source record {ordinal}")
        identifier, digest = row_key(cells, occurrences, prefixes)
        numeric = {}
        for index, field in [(2, "mag"), (3, "latitude"), (4, "longitude"), (5, "depth")]:
            text = cells[index]
            number = None
            if not text.strip():
                missing[field] += 1
            else:
                try:
                    number = float(text)
                except ValueError:
                    invalid[field] += 1
                    if field == "mag":
                        invalid_tokens[text] += 1
                if number is not None and not math.isfinite(number):
                    invalid[field] += 1
                    if field == "mag":
                        invalid_tokens[text] += 1
                    number = None
            numeric[field] = number
        statuses[cells[9]] += 1
        try:
            instant = parse_time(cells[0], cells[1]).replace(tzinfo=timezone.utc)
        except ValueError:
            excluded["invalid_utc_time"] += 1
            continue
        if not query_start <= instant < query_stop:
            excluded["outside_declared_query_period"] += 1
            continue
        time = instant.isoformat().replace("+00:00", "Z")
        source_first = min(source_first, time) if source_first else time
        source_last = max(source_last, time) if source_last else time
        years[instant.year] += 1
        later = False
        try:
            local = parse_time(cells[7], cells[8])
            offsets[str((instant.replace(tzinfo=None) - local).total_seconds() / 3600)] += 1
            later = local > generated_local
        except ValueError:
            local_time_invalid += 1
        if later:
            clock_rows.append(ordinal)
        mag, lat, lon, depth = (numeric[k] for k in ["mag", "latitude", "longitude", "depth"])
        if depth is not None:
            depth_min, depth_max = min(depth_min, depth), max(depth_max, depth)
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            excluded["invalid_coordinates"] += 1
            continue
        if mag is None:
            excluded["missing_or_invalid_magnitude"] += 1
            continue
        source_mag_min, source_mag_max = min(source_mag_min, mag), max(source_mag_max, mag)
        if mag < minimum_magnitude:
            excluded["magnitude_below_3_5"] += 1
            continue
        record = {field: None for field in FIELDS}
        record.update(id=identifier, time=time, latitude=lat, longitude=lon, depth=depth, mag=mag,
                      place=cells[6], status=cells[9], file=RAW_NAME, event_url="", source_record=ordinal,
                      raw_utc_date=cells[0], raw_utc_time=cells[1], raw_local_date=cells[7], raw_local_time=cells[8],
                      raw_magnitude=cells[2], raw_depth=cells[5], raw_status=cells[9])
        rows.append([record[field] for field in FIELDS])
        selected_hashes[digest] += 1
        selected_years[instant.year] += 1
        selected_statuses[cells[9]] += 1
        selected_first = min(selected_first, time) if selected_first else time
        selected_last = max(selected_last, time) if selected_last else time
        lat_min, lat_max, lon_min, lon_max = min(lat_min, lat), max(lat_max, lat), min(lon_min, lon), max(lon_max, lon)
        if later:
            selected_clock_rows.append(ordinal)
    footer_records = list(reader)
    if len(footer_records) != 7 or any(len(cells) != 1 for cells in footer_records):
        raise ValueError("SSN footer must retain exactly seven one-cell notes")
    footer = [cells[0] for cells in footer_records]
    if "Profundidad en kilometros." not in footer[0] or "solo una referencia" not in footer[1]:
        raise ValueError("Expected explicit SSN depth/reference semantics are absent")
    if len(rows) + sum(excluded.values()) != declared_rows:
        raise ValueError("SSN source/selection/exclusion counts do not reconcile")
    start_year, end_year = query_start.year, (query_stop - timedelta(days=1)).year
    stats = {"raw_rows": declared_rows, "packaged_records": len(rows), "excluded_rows": dict(excluded),
             "raw_exact_duplicate_rows_retained": sum(n - 1 for n in occurrences.values()),
             "selected_exact_duplicate_rows_retained": sum(n - 1 for n in selected_hashes.values()),
             "raw_missing_numeric_fields": dict(missing), "raw_invalid_numeric_fields": dict(invalid),
             "non_numeric_magnitude_tokens": dict(invalid_tokens), "raw_status_counts": dict(statuses),
             "selected_status_counts": dict(selected_statuses), "raw_by_origin_year": dict(sorted(years.items())),
             "by_origin_year": dict(sorted(selected_years.items())),
             "years_without_source_records": [y for y in range(start_year, end_year + 1) if y not in years],
             "years_with_source_records_but_no_selected_records": sorted(set(years) - set(selected_years)),
             "source_coverage_period": {"start_utc": source_first, "end_inclusive_utc": source_last},
             "coverage_period": {"start_utc": selected_first, "end_inclusive_utc": selected_last,
                                 "meaning": "First/last selected reported origin; not acquisition time or proof of completeness."},
             "source_numeric_magnitude_range": [source_mag_min, source_mag_max] if source_mag_min != math.inf else None,
             "source_depth_km_range": [depth_min, depth_max] if depth_min != math.inf else None,
             "bounds": [[lat_min, lon_min], [lat_max, lon_max]] if rows else None,
             "raw_local_time_invalid_rows": local_time_invalid,
             "observed_utc_minus_local_hour_counts": dict(offsets)}
    timing = {"header_generated_local": generated_local.isoformat(), "header_timezone_label": "tiempo del centro de Mexico",
              "observed_download_file_mtime_utc": DOWNLOAD_MTIME_UTC,
              "evidence_kind": "Filesystem last-write metadata of the human-downloaded file; no original HTTP response captured.",
              "records_later_than_header_local": len(clock_rows), "source_records_later_than_header_local": clock_rows,
              "selected_records_later_than_header_local": len(selected_clock_rows),
              "interpretation": "Header and native local/UTC values are preserved. Later local origin times are flagged, not repaired. No trusted publication/acquisition clock or atomic catalogue capture is inferred."}
    query = {"start_utc": query_start.isoformat().replace("+00:00", "Z"),
             "end_exclusive_utc": query_stop.isoformat().replace("+00:00", "Z"), "time_basis": "UTC",
             "magnitudes": "all", "depths": "all", "geography": "Source-declared national catalogue; not a territorial assignment.",
             "end_date_inclusive": period_match[2], "final_calendar_year_partial": True}
    return {"rows": rows, "source_header": headers, "source_footer": footer, "statistics": stats,
            "source_timing": timing, "query": query}


def build():
    if not RAW.exists():
        preserved = (PUBLIC / RAW_NAME).read_bytes()
        verify_source(preserved)
        RAW.parent.mkdir(parents=True, exist_ok=True)
        RAW.write_bytes(preserved)
    raw = RAW.read_bytes()
    verify_source(raw)
    if (PUBLIC / RAW_NAME).exists():
        verify_source((PUBLIC / RAW_NAME).read_bytes())
    terms_path = PUBLIC / "TERMS.txt"
    if not terms_path.exists():
        terms_path = ROOT / "outputs/ssn_recent_2026-11-06/ssn_legal_observed.txt"
    terms = terms_path.read_bytes()
    if len(terms) != TERMS_BYTES or sha(terms) != TERMS_SHA256:
        raise ValueError("SSN observed terms differ from the pinned inspected text")
    parsed = parse_snapshot(raw)
    stats = parsed["statistics"]
    if (stats["raw_rows"] != 402082 or stats["packaged_records"] != 242288
            or stats["excluded_rows"] != {"missing_or_invalid_magnitude": 17649, "magnitude_below_3_5": 142145}):
        raise ValueError("Packaged SSN counts differ from the independent inspected snapshot")
    identity = {"identifier_kind": "derived_row_key", "original_event_id": None,
                "source_event_id_column": None,
                "identifier_derivation": {"recipe": "ssn-local- + first24hex(SHA256(UTF-8 compact JSON array of all ten original CSV cells)) + '-' + occurrence number of that exact cell array in source order, before selection",
                                          "prefix_collision_checked": True,
                                          "meaning": "A deterministic local record key, not an original SSN ID or proof of a unique physical earthquake."}}
    events = {"schema_version": 1, "fields": FIELDS, "rows": parsed["rows"], **identity, "depth_unit": "km"}
    event_bytes = compact(events)
    public_raw_path = "research-data/catalogs/ssn-mx/" + RAW_NAME
    manifest = {"schema_version": 1, "catalog_id": CATALOG_ID, "provider": "ssn", "provider_name": PROVIDER_NAME,
                "snapshot_commit": "sha256:" + EXPECTED_SHA256,
                "official_catalogue": {"institution": PROVIDER_NAME, "title": "Catálogo de sismos", "url": CATALOGUE_URL, "doi": DOI},
                "source_url": CATALOGUE_URL, "source_fields": SOURCE_FIELDS,
                "source_header": parsed["source_header"], "source_footer": parsed["source_footer"],
                "query": parsed["query"], "source_timing": parsed["source_timing"],
                "time_basis": {"native_utc_columns": ["Fecha UTC", "Hora UTC"],
                               "raw_local_columns": ["Fecha local", "Hora local"],
                               "local_timezone_label": "tiempo del centro de Mexico", "no_local_offset_imputed": True},
                "selection": {"minimum_magnitude": MINIMUM_MAGNITUDE,
                              "coordinate_validation": "Finite latitude[-90,90], longitude[-180,180]; values unchanged.",
                              "time_validation": "Strict native UTC columns and declared query interval.",
                              "temporal_subselection_applied": False, "selected_rows": len(parsed["rows"]),
                              "excluded_rows": stats["excluded_rows"]},
                "minimum_magnitude": MINIMUM_MAGNITUDE, "depth_unit": "km", "event_type_provided": False,
                "magnitude_type_status": "not_provided_in_source", "event_url_kind": "not_provided_in_source",
                "files": [{"path": RAW_NAME, "url": CATALOGUE_URL, "url_kind": "catalogue_landing",
                           "public_copy_path": public_raw_path, "sha256": EXPECTED_SHA256,
                           "bytes": EXPECTED_BYTES, "observed_rows": stats["raw_rows"]}],
                "derived_asset_sha256": sha(event_bytes), "derived_asset_bytes": len(event_bytes), **identity, **stats,
                "field_availability": {field: "not_provided_in_source" for field in UNKNOWN_FIELDS},
                "field_semantics": {"status": "Literal SSN verificado/revisado field; not a revision archive or update timestamp.",
                                    "source_record": "One-based data-row ordinal after the five header records, before selection.",
                                    "place": "Unchanged reference to a nearby locality, not a state/country/tectonic-zone assignment.",
                                    "depth": "Reported km, explicitly documented in the source footer; zero remains an observed zero."},
                "transformations": ["Decode UTF-8 without modifying preserved source bytes.",
                                    "Combine explicitly labelled UTC date/time into ISO8601Z; preserve native date/time and local strings.",
                                    "Parse finite numeric magnitude, coordinates and depth; retain original magnitude/depth strings.",
                                    "Select reported M>=3.5 with valid UTC and map coordinates; preserve all other records in the raw CSV.",
                                    "Derive local row keys from all ten original cells and occurrence; retain duplicates if present.",
                                    "Keep absent magnitude type, event type, authors, errors and update timestamp null."],
                "rights": {"data": "SSN-specific Términos de Libre Uso together with the original CSV reproduction notice; no invented SPDX or Creative Commons licence.",
                           "legal_url": LEGAL_URL, "attribution": "SSN (2026): Universidad Nacional Autónoma de México, Instituto de Geofísica, Servicio Sismológico Nacional, México. Catálogo de sismos. " + CATALOGUE_URL + " DOI: " + DOI,
                           "observed_terms": {"path": "research-data/catalogs/ssn-mx/TERMS.txt", "sha256": TERMS_SHA256, "bytes": TERMS_BYTES,
                                              "kind": "Observed legal-page text, including the specific seismic-data free-use terms; not a server response or newly granted licence."},
                           "csv_notice": parsed["source_footer"][4],
                           "data_specific_terms": "The separately observed USO DE DATOS SÍSMICOS / TÉRMINOS DE LIBRE USO states any-purpose use with source credit. Preserve meaning, third-party rights and the original CSV nonprofit notice alongside those terms.",
                           "non_endorsement": "This application is not an official SSN/UNAM product and does not imply institutional endorsement. No institutional logos are used.",
                           "published_paper_notification": "The terms request a copy after publication; any email is a separate future action requiring human authorization.",
                           "software_license_scope": "The project's MIT licence applies to its own software, not these observations or third-party content."},
                "limits": ["One current-catalogue download, not a public-catalogue historical replay or retained revision archive.",
                           "No source event IDs or magnitude-type column is supplied; local keys are not original SSN IDs and M is not silently labelled Mw/Richter.",
                           "Unreported uncertainties/authors/types/updates remain null, not zero or inferred contributor codes.",
                           "The 2026 calendar year is partial. Missing source years are not physical zero-event years; no arbitrary completeness year is chosen.",
                           "Reference localities do not establish territorial or tectonic membership; offshore/surrounding coordinates remain unchanged.",
                           "A distinct distributor does not prove observational independence from ComCat or other catalogues.",
                           "Counts describe selected source records and are not earthquake probabilities, ground-motion hazard or damage estimates.",
                           "The original three catalogues and their six data/manifest hashes remain unchanged."]}
    manifest_bytes = compact(manifest)
    entry = {"id": CATALOG_ID, "provider": "ssn", "provider_name": PROVIDER_NAME,
             "label": {"es": "México · SSN directo · 1900–2026", "en": "Mexico · direct SSN · 1900–2026"},
             "events_url": "data/catalogs/ssn-mx/events.json", "events_bytes": len(event_bytes), "manifest_url": "data/catalogs/ssn-mx/manifest.json",
             "sha256": sha(event_bytes), "manifest_sha256": sha(manifest_bytes), "bounds": stats["bounds"],
             "years": [1900, 2026], "minimum_magnitude": MINIMUM_MAGNITUDE, "snapshot": "sha256:" + EXPECTED_SHA256,
             "role": "exploration", "event_count": len(parsed["rows"]), "record_count": len(parsed["rows"]),
             "count_unit": "records", "coverage_period": stats["coverage_period"],
             "identifier_kind": "derived_row_key", "original_event_id": None, "depth_unit": "km",
             "event_type_provided": False, "magnitude_type_status": "not_provided_in_source", "provider_url": CATALOGUE_URL}
    TARGET.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (TARGET / "events.json").write_bytes(event_bytes)
    (TARGET / "manifest.json").write_bytes(manifest_bytes)
    shutil.copyfile(RAW, PUBLIC / RAW_NAME)
    verify_source((PUBLIC / RAW_NAME).read_bytes())
    (PUBLIC / "TERMS.txt").write_bytes(terms)
    (PUBLIC / "manifest.json").write_bytes(manifest_bytes)
    write_json(PUBLIC / "catalog_entry.json", entry)
    (PUBLIC / "README.md").write_text(
        "# Direct SSN catalogue snapshot\n\n"
        f"Source: **{PROVIDER_NAME}**. [Official catalogue]({CATALOGUE_URL}) · DOI `{DOI}` · [SSN terms]({LEGAL_URL}).\n\n"
        f"The original CSV contains {stats['raw_rows']:,} records and {EXPECTED_BYTES:,} unchanged bytes, SHA-256 `{EXPECTED_SHA256}`. "
        f"The explorer selects {len(parsed['rows']):,} records with reported M >=3.5 and valid UTC/coordinates; the full raw CSV remains preserved here. "
        "This file was downloaded by a human through the official UI; no original HTTP response was captured. "
        "The header's local generation label, native UTC/local times, filesystem download metadata and their timing discrepancy are separately retained in the manifest.\n\n"
        "The UTC columns are native, not inferred from local time. Depth is explicitly in kilometres. "
        "Magnitude types, original event IDs, solution authors, event types, uncertainties and update timestamps are not supplied. "
        "Derived local row keys and source-row ordinals do not establish unique physical events. Status strings are not revision histories. "
        "No state or country is assigned from the reference locality, and no magnitude-scale conversion or completeness claim is made.\n\n"
        "Preserve the original CSV nonprofit reproduction notice and the separate SSN data-specific Términos de Libre Uso ([observed text](TERMS.txt)) together. "
        "The latter states any-purpose use with source credit, preservation of meaning, no institutional endorsement and separate third-party rights. "
        "No SPDX/Creative Commons licence is invented; the software MIT licence does not relicense the data. "
        "This is an academic exploration, not an official SSN/UNAM service or an earthquake prediction. "
        "Any requested post-publication notification is a separately authorized human action.\n",
        encoding="utf-8")
    report = {"checked_utc": datetime.now(timezone.utc).isoformat(), "source_bytes": EXPECTED_BYTES,
              "source_sha256": EXPECTED_SHA256, "events_bytes": len(event_bytes), "events_sha256": sha(event_bytes),
              "manifest_sha256": sha(manifest_bytes), "statistics": stats, "source_timing": parsed["source_timing"],
              "entry": entry, "source_public_copy_identical": True, "original_catalogues_modified": False}
    out = ROOT / "outputs/ssn_recent_2026-11-06/ssn_catalog_build.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"catalog_id": CATALOG_ID, "source_records": stats["raw_rows"], "selected_records": len(parsed["rows"]),
                      "events_bytes": len(event_bytes), "events_sha256": sha(event_bytes), "manifest_sha256": sha(manifest_bytes)}))
    return entry


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    build()


if __name__ == "__main__":
    main()
