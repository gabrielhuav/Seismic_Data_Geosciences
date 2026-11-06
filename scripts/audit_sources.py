"""Audit pinned ComCat CSVs and read a historical SSN-derived SQL snapshot.

Only Python's standard library is required. No SQL or upstream Python is executed.
The historical repository is read-only. Generated time candidates are hypotheses,
not recovered observations. Outputs are local QA artifacts, not research claims.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import subprocess
import sys
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
NUM = r"(NULL|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)"
TXT = r"(NULL|'(?:[^']|'')*')"
SISMO_RE = re.compile(
    rf"VALUES \((\d+), {NUM}, {NUM}, {NUM}, {NUM}, {TXT}, {TXT}, {TXT}\);"
)
TIEMPO_RE = re.compile(rf"VALUES \((\d+), {TXT}, {TXT}, ")
USGS_FIELDS = [
    "time", "latitude", "longitude", "depth", "mag", "magType", "nst", "gap",
    "dmin", "rms", "net", "id", "updated", "place", "type", "horizontalError",
    "depthError", "magError", "magNst", "status", "locationSource", "magSource",
]
SSN_MISSING_FIELDS = [
    "original_ssn_event_id", "original_utc_date", "original_local_time",
    "magnitude_type", "review_status", "source_agency", "revision_timestamp",
    "horizontal_error", "depth_error", "magnitude_error",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def read_manifest(path: Path) -> dict:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    names = [f["path"] for f in manifest["files"]]
    if len(set(names)) != len(names):
        raise ValueError("Manifest contains repeated paths")
    for item in manifest["files"]:
        if Path(item["path"]).name != item["path"]:
            raise ValueError("Manifest paths must be plain file names")
        expected = (
            "https://raw.githubusercontent.com/Actronix09/fuentes-alternas/"
            + manifest["snapshot_commit"] + "/" + item["upstream_path"]
        )
        if item["url"] != expected:
            raise ValueError("Unexpected download URL")
    return manifest


def read_or_download(item: dict, directory: Path, download: bool) -> tuple[bytes, dict]:
    target = directory / item["path"]
    receipt = {"path": item["path"], "url": item["url"], "downloaded_this_run": False}
    if not target.exists():
        if not download:
            raise FileNotFoundError(f"Missing {target}; rerun with --download")
        request = Request(item["url"], headers={"User-Agent": "SeismicDataSourceAudit/1"})
        with urlopen(request, timeout=30) as response:
            blob = response.read()
            receipt.update({
                "retrieved_at_utc": utc_now(),
                "response_url": response.url,
                "content_type": response.headers.get("Content-Type"),
                "etag": response.headers.get("ETag"),
            })
        if len(blob) != item["bytes"] or sha256(blob) != item["sha256"]:
            raise ValueError(f"Downloaded bytes fail pinned checks: {item['path']}")
        directory.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)
        receipt["downloaded_this_run"] = True
    blob = target.read_bytes()
    if len(blob) != item["bytes"] or sha256(blob) != item["sha256"]:
        raise ValueError(f"Pinned bytes fail verification: {target}")
    receipt.update({"bytes": len(blob), "sha256": sha256(blob), "verified": True})
    return blob, receipt


def number(value: str) -> float | None:
    if value in ("", "NULL"):
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"Non-finite numeric value: {value}")
    return result


def parse_instant(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError(f"Timestamp has no timezone: {value}")
    return result.astimezone(timezone.utc)


def audit_usgs(manifest: dict, directory: Path, output: Path, download: bool) -> dict:
    by_id = {}
    repeated_ids = []
    files = []
    type_profile = {}
    bounds = manifest["official_catalogue"]["bounds"]
    for item in manifest["files"]:
        blob, receipt = read_or_download(item, directory, download)
        reader = csv.DictReader(io.StringIO(blob.decode("utf-8"), newline=""))
        if reader.fieldnames != USGS_FIELDS:
            raise ValueError(f"Unexpected CSV schema: {item['path']}")
        count = 0
        for row in reader:
            count += 1
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Malformed CSV row in {item['path']}")
            if not row["id"]:
                raise ValueError("Empty ComCat ID")
            parse_instant(row["time"])
            parse_instant(row["updated"])
            lat, lon = number(row["latitude"]), number(row["longitude"])
            if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError(f"Invalid coordinates: {row['id']}")
            if not (
                bounds["minlatitude"] <= lat <= bounds["maxlatitude"]
                and bounds["minlongitude"] <= lon <= bounds["maxlongitude"]
            ):
                raise ValueError(f"Outside declared rectangle: {row['id']}")
            for field in ("depth", "mag", "horizontalError", "depthError", "magError"):
                number(row[field])
            if row["id"] in by_id:
                repeated_ids.append({
                    "id": row["id"], "same_record": by_id[row["id"]] == row,
                    "next_file": item["path"],
                })
            else:
                by_id[row["id"]] = row
        receipt["rows"] = count
        files.append(receipt)

    for event_type in sorted({row["type"] for row in by_id.values()}):
        rows = [row for row in by_id.values() if row["type"] == event_type]
        type_profile[event_type] = {
            "unique_events": len(rows),
            "magnitude_types": dict(sorted(Counter(row["magType"] for row in rows).items())),
            "missing_fields": {
                field: sum(row[field] == "" for row in rows) for field in USGS_FIELDS
            },
            "source_values": {
                field: dict(sorted(Counter(row[field] for row in rows).items()))
                for field in ("net", "locationSource", "magSource", "status")
            },
            "unm_exact_any_source": sum(
                any(row[field].lower() == "unm" for field in ("net", "locationSource", "magSource"))
                for row in rows
            ),
            "unm_exact_or_compound_any_source": sum(
                any(re.search(r"(^|_)unm($|_)", row[field], re.I)
                    for field in ("net", "locationSource", "magSource"))
                for row in rows
            ),
        }

    rows = list(by_id.values())
    with (output / "usgs_records.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=USGS_FIELDS)
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda row: (row["time"], row["id"])))
    return {
        "raw_rows": sum(f["rows"] for f in files), "unique_ids": len(rows),
        "duplicate_ids": repeated_ids, "files": files,
        "event_time_range_utc": [min(r["time"] for r in rows), max(r["time"] for r in rows)],
        "updated_range_utc": [min(r["updated"] for r in rows), max(r["updated"] for r in rows)],
        "by_event_type": type_profile,
        "limits": [
            "The regional rectangle includes ocean and parts of other countries.",
            "Preferred summaries contain an updated field, not a revision history.",
            "A non-UNM source code does not establish statistical independence.",
            "Missing errors remain missing, never zero-valued uncertainty.",
            "Magnitude types remain source-specific and are not homogenized.",
        ],
    }


def sql_text(token: str) -> str | None:
    return None if token == "NULL" else token[1:-1].replace("''", "'")


def git_read(directory: Path, *args: str) -> str | None:
    result = subprocess.run(
        ["git", "--no-optional-locks", "-C", str(directory), *args],
        text=True, encoding="utf-8", capture_output=True, check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def audit_ssn(directory: Path, output: Path, manifest: dict) -> dict:
    sql_dir = directory / "sql"
    times, profile_files = {}, []
    for name in ("02-dim_tiempo.sql", "03-dim_sismos.sql"):
        blob = (sql_dir / name).read_bytes()
        normalized_hash = sha256(blob.replace(b"\r\n", b"\n"))
        expected_hash = manifest["historical_ssn"]["expected_file_hashes_lf"]["sql/" + name]
        if normalized_hash != expected_hash:
            raise ValueError(f"Historical file differs from declared snapshot: {name}")
        profile_files.append({
            "path": "sql/" + name, "bytes_local": len(blob),
            "sha256_local": sha256(blob),
            "sha256_after_crlf_to_lf_for_comparison_only": normalized_hash,
            "matches_expected_lf_sha256": True,
            "crlf_pairs": blob.count(b"\r\n"),
        })
    time_inserts = 0
    with (sql_dir / "02-dim_tiempo.sql").open(encoding="utf-8") as stream:
        for line in stream:
            if not line.startswith("INSERT"):
                continue
            time_inserts += 1
            match = TIEMPO_RE.search(line)
            if not match:
                raise ValueError("Unparsed historical time INSERT")
            identifier = int(match.group(1))
            if identifier in times:
                raise ValueError(f"Repeated historical time ID: {identifier}")
            times[identifier] = (sql_text(match.group(2)), sql_text(match.group(3)))

    fields = [
        "historical_row_id", "date_literal", "hour_utc_literal",
        "h0_literal_timestamp_candidate_utc", "h1_next_day_timestamp_candidate_utc",
        "magnitude", "latitude", "longitude", "depth_km", "reference", "state", "state_name",
    ]
    ids, dates, missing = set(), Counter(), Counter()
    total, outside, no_time = 0, 0, 0
    bounds = manifest["official_catalogue"]["bounds"]
    with (output / "ssn_records.csv").open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=fields)
        writer.writeheader()
        with (sql_dir / "03-dim_sismos.sql").open(encoding="utf-8") as source:
            for line in source:
                if not line.startswith("INSERT"):
                    continue
                total += 1
                match = SISMO_RE.search(line)
                if not match:
                    raise ValueError("Unparsed historical earthquake INSERT")
                identifier = int(match.group(1))
                if identifier in ids:
                    raise ValueError(f"Repeated historical earthquake ID: {identifier}")
                ids.add(identifier)
                mag, lat, lon, depth = [number(match.group(i)) for i in range(2, 6)]
                hour, day = times.get(identifier, (None, None))
                h0, h1 = None, None
                if hour and day:
                    literal_day = date.fromisoformat(day)
                    h0 = datetime.fromisoformat(day + "T" + hour).replace(tzinfo=timezone.utc)
                    h1 = h0 + timedelta(days=1)
                    dates[literal_day.isoformat()] += 1
                else:
                    no_time += 1
                for key, value in (("magnitude", mag), ("latitude", lat), ("longitude", lon), ("depth", depth)):
                    missing[key] += value is None
                if lat is not None and lon is not None and not (
                    bounds["minlatitude"] <= lat <= bounds["maxlatitude"]
                    and bounds["minlongitude"] <= lon <= bounds["maxlongitude"]
                ):
                    outside += 1
                writer.writerow(dict(zip(fields, [
                    identifier, day, hour, h0.isoformat() if h0 else None,
                    h1.isoformat() if h1 else None, mag, lat, lon, depth,
                    sql_text(match.group(6)), sql_text(match.group(7)), sql_text(match.group(8)),
                ])))
    head = git_read(directory, "rev-parse", "HEAD")
    status = git_read(directory, "status", "--porcelain")
    return {
        "historical_repository_head": head,
        "git_inspection_available": head is not None and status is not None,
        "matches_declared_source_commit": (
            head == manifest["historical_ssn"]["source_commit"] if head is not None else None
        ),
        "historical_worktree_porcelain": status,
        "files": profile_files, "earthquake_insert_rows": total,
        "time_insert_rows": time_inserts, "unique_historical_row_ids": len(ids),
        "row_id_range": [min(ids), max(ids)],
        "literal_date_range": [min(dates), max(dates)],
        "outside_regional_rectangle": outside, "without_joined_time": no_time,
        "time_ids_without_earthquake": len(set(times) - ids),
        "missing_numeric_fields": dict(missing),
        "fields_not_retained": SSN_MISSING_FIELDS,
        "time_hypotheses": {
            "h0": "Literal date plus UTC-labelled time, treated as a candidate UTC instant.",
            "h1": "H0 plus one calendar day; an alternative candidate, not an observed correction.",
            "assumptions": "No timezone, DST correction or historical offset is asserted. H0/H1 are a sensitivity set, not a claim that both are physically plausible for every event.",
        },
        "excluded": "Imputed impact, affected population, economic damage and risk fields are not read.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download missing pinned CSVs only")
    parser.add_argument("--historical-dir", type=Path, default=ROOT.parent / "DWSismos")
    parser.add_argument("--skip-ssn", action="store_true", help="Audit ComCat only when historical files are unavailable")
    args = parser.parse_args()
    manifest_path = ROOT / "data" / "source_manifest.json"
    manifest = read_manifest(manifest_path)
    output = ROOT / "outputs" / "audit"
    output.mkdir(parents=True, exist_ok=True)
    started = utc_now()
    result = {
        "schema_version": 1, "started_at_utc": started,
        "source_manifest_sha256": sha256(manifest_path.read_bytes()),
        "audit_script_sha256": sha256(Path(__file__).read_bytes()),
        "snapshot_commit": manifest["snapshot_commit"],
        "usgs": audit_usgs(manifest, ROOT / "data" / "raw" / "usgs", output, args.download),
        "ssn": None,
    }
    if not args.skip_ssn:
        result["ssn"] = audit_ssn(args.historical_dir.resolve(), output, manifest)
    previous_summary = output / "audit_summary.json"
    if previous_summary.exists():
        previous = json.loads(previous_summary.read_text(encoding="utf-8"))
        prior_files = {item["path"]: item for item in previous.get("usgs", {}).get("files", [])}
        for item in result["usgs"]["files"]:
            prior = prior_files.get(item["path"], {})
            if not item["downloaded_this_run"] and prior.get("sha256") == item["sha256"]:
                for key in ("retrieved_at_utc", "response_url", "content_type", "etag"):
                    if key in prior:
                        item[key] = prior[key]
    result["completed_at_utc"] = utc_now()
    (output / "audit_summary.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    profile = {
        "schema_version": 1, "verified_at_utc": result["completed_at_utc"],
        "snapshot_commit": manifest["snapshot_commit"],
        "source_file_count": len(manifest["files"]),
        "source_bytes": sum(item["bytes"] for item in manifest["files"]),
        "usgs": {key: value for key, value in result["usgs"].items() if key != "files"},
        "ssn": result["ssn"],
    }
    (output / "profile.json").write_text(
        json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "usgs_raw_rows": result["usgs"]["raw_rows"],
        "usgs_unique_ids": result["usgs"]["unique_ids"],
        "event_types": {k: v["unique_events"] for k, v in result["usgs"]["by_event_type"].items()},
        "ssn_rows": result["ssn"]["earthquake_insert_rows"] if result["ssn"] else None,
        "summary": str(output / "audit_summary.json"),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, csv.Error) as exc:
        print(f"Audit failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
