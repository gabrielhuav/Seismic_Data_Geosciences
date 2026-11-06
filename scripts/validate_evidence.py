"""Validate evidence contracts independently with SQLite and synthetic histories.

The SQL oracle checks retained projections, not past public catalogue truth.
Synthetic public histories are generated separately and are never observations.
Only public functions of evidence_contract are called by this evaluation.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import platform
import sqlite3

from scripts import evidence_contract as contract

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/revisions"
OUT = ROOT / "outputs/validation"
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
ACK = list(contract.REQUIRED_ASSUMPTIONS)


def iso_us(value):
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("Oracle requires a zoned timestamp")
    delta = stamp.astimezone(timezone.utc) - EPOCH
    return delta.days * 86400000000 + delta.seconds * 1000000 + delta.microseconds


def instant(ms):
    return (EPOCH + timedelta(milliseconds=ms)).isoformat().replace("+00:00", "Z")


def number(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("Oracle rejects Boolean measurements")
    parsed = Decimal(str(value))
    if not parsed.is_finite():
        raise ValueError("Oracle rejects non-finite measurements")
    return float(parsed)


class SqlOracle:
    """Rank versions in SQLite; apply attribute predicates after temporal ranking."""
    def __init__(self, payload):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE versions (
            source TEXT, kind TEXT, code TEXT, update_ms INTEGER, event_id TEXT,
            status TEXT, product_id TEXT, origin_source TEXT, magnitude_source TEXT,
            origin_us INTEGER, lat REAL, lon REAL, depth REAL, mag REAL,
            mag_type TEXT COLLATE BINARY, event_type TEXT COLLATE BINARY,
            PRIMARY KEY(source, kind, code, update_ms))""")
        events = payload["features"] if payload["type"] == "FeatureCollection" else [payload]
        seen = {}
        for event in events:
            for product in event["properties"].get("products", {}).get("origin", []):
                key = tuple(product[k] for k in ("source", "type", "code", "updateTime"))
                canonical = json.dumps(product, sort_keys=True, separators=(",", ":"))
                if key in seen:
                    if seen[key] != (event["id"], canonical):
                        raise ValueError("Oracle found a conflicting identity or association")
                    continue
                seen[key] = (event["id"], canonical)
                props = product.get("properties", {})
                status = product["status"].upper()
                if status not in {"UPDATE", "DELETE"}:
                    raise ValueError("Oracle requires a documented UPDATE/DELETE status")
                self.db.execute("INSERT INTO versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    product["source"], product["type"], product["code"], int(product["updateTime"]),
                    event["id"], status, product.get("id"), props.get("origin-source"),
                    props.get("magnitude-source"), iso_us(props["eventtime"]) if props.get("eventtime") else None,
                    number(props.get("latitude")), number(props.get("longitude")), number(props.get("depth")),
                    number(props.get("magnitude")), props.get("magnitude-type"), props.get("event-type"),
                ))
        self.db.commit()

    def select(self, cutoff_ms, query):
        where, args = ["status = 'UPDATE'"], [cutoff_ms]
        for field, column in (("magnitude", "mag"), ("latitude", "lat"), ("longitude", "lon")):
            for bound, comparison in (("min", ">="), ("max", "<=")):
                key = f"{bound}_{field}"
                if key in query:
                    where.append(f"{column} {comparison} ?")
                    args.append(query[key])
        for key, column in (("magnitude_types", "mag_type"), ("event_types", "event_type")):
            if key in query:
                where.append(column + " IN (" + ",".join("?" for _ in query[key]) + ")")
                args.extend(query[key])
        if "start_time_utc" in query:
            where.append("origin_us >= ?")
            args.append(iso_us(query["start_time_utc"]))
        if "end_time_utc" in query:
            where.append("origin_us < ?")
            args.append(iso_us(query["end_time_utc"]))
        sql = """WITH ranked AS (
            SELECT *, ROW_NUMBER() OVER (
              PARTITION BY source,kind,code ORDER BY update_ms DESC
            ) AS position FROM versions WHERE update_ms <= ?
        ) SELECT * FROM ranked WHERE position = 1 AND """ + " AND ".join(where)
        selected = list(self.db.execute(sql, args))
        terminal = list(self.db.execute("""WITH ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY source,kind,code ORDER BY update_ms DESC)
            AS position FROM versions WHERE update_ms <= ?
        ) SELECT * FROM ranked WHERE position=1 AND status='DELETE'""", (cutoff_ms,)))
        active = self.db.execute("""WITH ranked AS (
            SELECT status, ROW_NUMBER() OVER (PARTITION BY source,kind,code ORDER BY update_ms DESC)
            AS position FROM versions WHERE update_ms <= ?
        ) SELECT COUNT(*) FROM ranked WHERE position=1 AND status='UPDATE'""", (cutoff_ms,)).fetchone()[0]
        return selected, terminal, active

    def close(self):
        self.db.close()


def sql_signature(rows):
    return sorted((r["source"], r["kind"], r["code"], r["update_ms"], r["event_id"], r["status"],
                   r["product_id"], r["origin_source"], r["magnitude_source"], r["origin_us"],
                   r["lat"], r["lon"], r["depth"], r["mag"], r["mag_type"], r["event_type"]) for r in rows)


def contract_signature(rows):
    return sorted((r["lineage"]["product_source"], r["lineage"]["product_type"], r["lineage"]["product_code"],
                   iso_us(r["producer_update_time_utc"]) // 1000, r["event_id_at_capture"], r["status"].upper(),
                   r["product_id"], r["origin_source"], r["magnitude_source"],
                   iso_us(r["origin_time_utc"]) if r["origin_time_utc"] else None,
                   r["latitude"], r["longitude"], r["depth_km"], r["magnitude"], r["magnitude_type"], r["event_type"])
                  for r in rows)


QUERIES = [
    ("unfiltered", {}),
    ("reported_magnitude_at_least_5.5", {"min_magnitude": 5.5}),
    ("mww_at_least_5.5", {"min_magnitude": 5.5, "magnitude_types": ["mww"]}),
    ("reported_magnitude_at_most_5.5", {"max_magnitude": 5.5}),
    ("exact_mb", {"magnitude_types": ["mb"]}),
    ("exact_mB", {"magnitude_types": ["mB"]}),
    ("regional_rectangle", {"min_latitude": 14, "max_latitude": 33, "min_longitude": -118, "max_longitude": -86}),
    ("origin_year_2017", {"start_time_utc": "2017-01-01T00:00:00Z", "end_time_utc": "2018-01-01T00:00:00Z"}),
    ("origin_year_2022", {"start_time_utc": "2022-01-01T00:00:00Z", "end_time_utc": "2023-01-01T00:00:00Z"}),
    ("earthquake_type", {"event_types": ["earthquake"]}),
]


def compare(raw, payload, cutoffs, queries):
    oracle = SqlOracle(payload)
    checks, failures = [], []
    try:
        for cutoff in cutoffs:
            for name, query in queries:
                expected, deleted, active = oracle.select(cutoff, query)
                actual = contract.retained_projection_conditional(raw, instant(cutoff), ACK, query=query)
                equal = (sql_signature(expected) == contract_signature(actual["records"])
                         and sql_signature(deleted) == contract_signature(actual["retained_deletions"])
                         and active == actual["active_lineage_count_before_query"])
                row = {"cutoff_utc": instant(cutoff), "query_id": name,
                       "selected_lineages": len(expected), "retained_deletions": len(deleted), "agrees": equal}
                checks.append(row)
                if not equal:
                    failures.append({**row, "expected": sql_signature(expected), "actual": contract_signature(actual["records"])})
    finally:
        oracle.close()
    return checks, failures


def real_validation():
    manifest_bytes = (RAW / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    checks, failures, sources = [], [], []
    for index, spec in enumerate(manifest["events"], 1):
        path = (RAW / spec["path"]).resolve()
        path.relative_to(RAW.resolve())
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != spec["sha256"] or len(raw) != spec["bytes"]:
            raise ValueError("Real evidence failed a hash or length check")
        payload = json.loads(raw)
        times = sorted({int(p["updateTime"]) for p in payload["properties"]["products"].get("origin", [])})
        # Exercise each retained boundary both immediately before and at its timestamp.
        cutoffs = sorted({t + offset for t in times for offset in (-1, 0)})
        rows, errors = compare(raw, payload, cutoffs, QUERIES)
        for row in rows: row["event_id"] = payload["id"]
        checks.extend(rows)
        failures.extend({"event_id": payload["id"], **error} for error in errors)
        sources.append({"path": spec["path"], "sha256": spec["sha256"], "cutoffs": len(cutoffs), "checks": len(rows)})
        if index % 6 == 0: print(f"Validated retained projections: {index}/{len(manifest['events'])}", flush=True)
    return {"manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(), "sources": sources,
            "event_count": len(sources), "cutoff_count": sum(s["cutoffs"] for s in sources),
            "query_count": len(QUERIES), "check_count": len(checks), "disagreements": len(failures),
            "queries": [{"id": name, "parameters": query} for name, query in QUERIES],
            "scope": "Original captured details; correctness of retained projections only, not historical public truth."}, checks, failures


def fixture_product(code, when, mag=6.0, *, source="us", status="UPDATE", lat=16, public=None, index=None):
    props = {} if status == "DELETE" else {"eventtime": instant(0), "magnitude": str(mag), "magnitude-type": "mww",
        "latitude": str(lat), "longitude": "-96", "depth": "10", "origin-source": source,
        "magnitude-source": source, "event-type": "earthquake"}
    return {"source": source, "type": "origin", "code": code, "updateTime": when,
            "indexTime": index if index is not None else (public if public is not None else when),
            "id": f"synthetic:{source}:{code}:{when}", "status": status, "properties": props}


def synthetic_histories():
    """Known complete histories and deliberately incomplete exported evidence."""
    def upsert(code, at, mag=6.0, **options):
        producer = options.pop("producer", at)
        product = fixture_product(code, producer, mag, public=at, **options)
        return {"at": at, "action": "publish", "event_id": code, "product": product}
    initial = upsert("A", 1000)
    revised = upsert("A", 2000, 5.0)
    final = upsert("A", 4000)
    cases = [
        {"family": "omitted_magnitude_revision", "history": [initial, revised, final], "remove_products": [revised["product"]["id"]]},
        {"family": "omitted_deletion", "history": [initial, upsert("A", 2000, status="DELETE"), final], "remove_updates": [2000]},
        {"family": "public_availability_clock_absent", "history": [upsert("A", 4000, producer=1000)], "remove_products": []},
        {"family": "past_preference_history_absent", "history": [initial, upsert("A", 1001, 5.0, source="alt"),
             {"at": 2000, "action": "prefer", "event_id": "A", "source": "alt"},
             {"at": 4000, "action": "prefer", "event_id": "A", "source": "us"}], "remove_products": []},
        {"family": "withdrawn_member_not_enumerated", "history": [initial, upsert("B", 1001),
             {"at": 4000, "action": "withdraw", "event_id": "B"}], "remove_products": []},
        {"family": "filtering_before_version_selection", "history": [initial, revised, final], "remove_products": []},
        {"family": "index_clock_used_as_producer_clock", "history": [upsert("A", 1000, index=4500)], "remove_products": []},
        {"family": "omitted_spatial_revision", "history": [initial, upsert("A", 2000, lat=35), final], "remove_updates": [2000]},
    ]
    return deepcopy(cases)


def public_state(history, at):
    """Independent public mutation replay; no evidence-contract functions used."""
    events = {}
    for action in sorted(history, key=lambda a: a["at"]):
        if action["at"] > at: break
        identifier = action["event_id"]
        if action["action"] == "withdraw":
            events.pop(identifier, None)
        elif action["action"] == "prefer":
            events[identifier]["preferred"] = action["source"]
        else:
            p = action["product"]
            event = events.setdefault(identifier, {"origins": {}, "preferred": p["source"]})
            if p["status"] == "DELETE": event["origins"].pop(p["source"], None)
            else: event["origins"][p["source"]] = deepcopy(p)
    return events


def accepts(product, minimum):
    props = product.get("properties", {})
    if product.get("status") == "DELETE": return False
    lat = number(props.get("latitude"))
    mag = number(props.get("magnitude"))
    return lat is not None and 14 <= lat <= 33 and (minimum is None or (mag is not None and mag >= minimum))


def public_count(history, at, minimum):
    result = 0
    for event in public_state(history, at).values():
        product = event["origins"].get(event["preferred"])
        result += int(product is not None and accepts(product, minimum))
    return result


def exported_evidence(case):
    current = public_state(case["history"], 5000)
    features = []
    for identifier, state in sorted(current.items()):
        products = [deepcopy(a["product"]) for a in case["history"] if a["action"] == "publish" and a["event_id"] == identifier
                    and a["product"]["id"] not in case.get("remove_products", [])
                    and a["product"]["updateTime"] not in case.get("remove_updates", [])]
        preferred = state["origins"].get(state["preferred"])
        props = preferred.get("properties", {}) if preferred else {}
        features.append({"type": "Feature", "id": identifier,
            "geometry": {"type": "Point", "coordinates": [-96, 16, 10]},
            "properties": {"time": 0, "mag": number(props.get("magnitude")), "magType": props.get("magnitude-type"),
                "type": "earthquake", "net": state["preferred"], "updated": 5000, "products": {"origin": products}}})
    return {"type": "FeatureCollection", "features": features}


def illustrative_baseline(payload, at, minimum, policy):
    """Policies are explicit toy baselines, not implementations of other tools."""
    total = 0
    for event in payload["features"]:
        products = [p for p in event["properties"]["products"]["origin"] if p["source"] == event["properties"]["net"]]
        clock = "indexTime" if policy == "index_clock_backcast" else "updateTime"
        candidates = [p for p in products if p[clock] <= at]
        if policy == "filter_before_resolve": candidates = [p for p in candidates if accepts(p, minimum)]
        chosen = max(candidates, key=lambda p: p[clock], default=None)
        total += int(chosen is not None and accepts(chosen, minimum))
    return total


def synthetic_validation():
    rows, examples = [], []
    for case in synthetic_histories():
        payload = exported_evidence(case)
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        examples.append({**case, "synthetic": True, "capture_ms": 5000, "cutoff_ms": 3000,
                         "exported_evidence": payload, "exported_sha256": hashlib.sha256(raw).hexdigest()})
        for minimum in (None, 5.5, 6.1):
            truth = public_count(case["history"], 3000, minimum)
            query = {"min_latitude": 14, "max_latitude": 33}
            if minimum is not None: query["min_magnitude"] = minimum
            oracle = SqlOracle(payload)
            expected, deleted, active = oracle.select(3000, query)
            oracle.close()
            result = contract.retained_projection_conditional(raw, instant(3000), ACK, query=query)
            projection_matches = sql_signature(expected) == contract_signature(result["records"])
            historical = contract.historical_catalog_not_identifiable(raw, instant(3000))
            row = {"family": case["family"], "minimum_magnitude": minimum, "synthetic_public_event_count": truth,
                   "conditional_retained_lineage_count": result["selected_lineage_count"],
                   "conditional_projection_agrees_with_sql": projection_matches,
                   "unconditional_historical_claim_declined": historical["result"] is None and not historical["historical_publication_reconstructed"]}
            for policy in ("producer_clock_current_preference", "filter_before_resolve", "index_clock_backcast"):
                answer = illustrative_baseline(payload, 3000, minimum, policy)
                row[policy] = answer
                row[policy + "_differs_from_synthetic_public_count"] = answer != truth
            rows.append(row)
    summary = {"synthetic": True, "families": len(examples), "query_cases": len(rows),
        "projection_disagreements": sum(not r["conditional_projection_agrees_with_sql"] for r in rows),
        "historical_claims_declined": sum(r["unconditional_historical_claim_declined"] for r in rows),
        "baseline_disagreements": {policy: sum(r[policy + "_differs_from_synthetic_public_count"] for r in rows)
            for policy in ("producer_clock_current_preference", "filter_before_resolve", "index_clock_backcast")},
        "limitations": ["Constructed cases do not estimate operational failure prevalence.",
            "The three policies are illustrative baselines, not libcomcat, Timeline or INGV benchmarks.",
            "Conditional output counts product lineages; public replay counts preferred events. Those units are never treated as equivalent.",
            "Declining all historical claims is the contract's prescribed conservative behavior, not learned loss detection or a reconstruction-accuracy score."]}
    return summary, rows, examples


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(dict.fromkeys(k for row in rows for k in row)))
        writer.writeheader(); writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic-only", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    synthetic, synthetic_rows, fixtures = synthetic_validation()
    result = {"generated_utc": datetime.now(timezone.utc).isoformat(),
              "validation_script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "contract_script_sha256": hashlib.sha256(Path(contract.__file__).read_bytes()).hexdigest(),
              "runtime": {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version},
              "oracle": "SQLite ROW_NUMBER temporal ranking and post-selection SQL predicates; independent Decimal parsing and integer time coordinates.",
              "synthetic_controlled_evidence_loss": synthetic}
    if not args.synthetic_only:
        real, real_rows, failures = real_validation()
        result["retained_real_evidence"] = real
        write_csv(OUT / "retained_projection_checks.csv", real_rows)
        (OUT / "disagreements.json").write_text(json.dumps(failures, indent=2), encoding="utf-8")
    write_csv(OUT / "synthetic_policy_checks.csv", synthetic_rows)
    (OUT / "synthetic_histories.json").write_text(json.dumps(fixtures, indent=2), encoding="utf-8")
    (OUT / "summary.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    concise = {key: value for key, value in result.items() if key != "retained_real_evidence"}
    if not args.synthetic_only:
        concise["retained_real_evidence"] = {key: value for key, value in result["retained_real_evidence"].items() if key not in {"sources", "queries"}}
    print(json.dumps(concise, indent=2))
    if synthetic["projection_disagreements"] or (not args.synthetic_only and result["retained_real_evidence"]["disagreements"]):
        raise SystemExit("Independent projection validation found disagreements; inspect outputs/validation.")


if __name__ == "__main__": main()
