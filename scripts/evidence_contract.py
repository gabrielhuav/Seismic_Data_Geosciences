"""Evidence contracts for captured ComCat JSON, using only the standard library.

These functions describe what supplied bytes support. They do not fetch data,
reconstruct public catalogue states, calibrate probabilities, or infer physical
earthquake truth. Retained product versions are a conditional projection only.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
REQUIRED_ASSUMPTIONS = {
    "retained_versions_only": "Only versions present in the supplied bytes are considered.",
    "producer_time_not_publication": "Product updateTime is a producer version clock, not proven public availability.",
    "fixed_retrieved_event_cohort": "The event cohort is the supplied cohort; missing or withdrawn events are not recovered.",
    "product_identifier_lineage": "Lineage is product source, type and code; origin authorship is kept separately.",
    "no_historical_preference_or_association": "Current associations and preferences do not establish their historical states.",
}
QUERY_KEYS = {
    "min_magnitude", "max_magnitude", "magnitude_types", "event_types",
    "start_time_utc", "end_time_utc", "min_latitude", "max_latitude",
    "min_longitude", "max_longitude",
}
HISTORICAL_GAPS = [
    "Complete membership of the public catalogue at the requested time is not established.",
    "First public availability of each retained product is not established by updateTime.",
    "Completeness of retained versions, including missing withdrawals, is not established.",
    "Historical preference weights, management products and indexer configuration are not established.",
    "Historical event associations, merges, splits and alias discovery are not established.",
]


def _instant(value: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError("A timezone-aware ISO timestamp is required")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"Invalid ISO timestamp: {value}") from exc
    if result.tzinfo is None:
        raise ValueError("Naive timestamps are not accepted")
    return result.astimezone(timezone.utc)


def _iso(value: str) -> str:
    return _instant(value).isoformat().replace("+00:00", "Z")


def _numeric(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("Boolean values are not numeric measurements")
    try:
        result = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid numeric measurement: {value!r}") from exc
    if not math.isfinite(result):
        raise ValueError("Non-finite measurements are not accepted")
    return result


def _millisecond_instant(value: Any) -> str:
    numeric = _numeric(value)
    if numeric is None:
        raise ValueError("Missing product updateTime or event origin time")
    try:
        result = datetime.fromtimestamp(numeric / 1000, timezone.utc)
    except (OverflowError, OSError, ValueError) as exc:
        raise ValueError("Invalid epoch-millisecond timestamp") from exc
    return result.isoformat().replace("+00:00", "Z")


def _reject_constant(value: str) -> None:
    raise ValueError(f"Non-standard JSON constant: {value}")


def _evidence(raw_bytes: bytes, expected_sha256: str | None = None) -> tuple[list[dict], str]:
    if not isinstance(raw_bytes, bytes):
        raise TypeError("Supply the original captured bytes, not a reserialized dictionary")
    digest = hashlib.sha256(raw_bytes).hexdigest()
    if expected_sha256 is not None and digest != expected_sha256.lower():
        raise ValueError("Captured bytes do not match the expected SHA-256")
    try:
        payload = json.loads(raw_bytes.decode("utf-8"), parse_constant=_reject_constant)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Evidence must be UTF-8 GeoJSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("Evidence must be a GeoJSON object")
    kind = payload.get("type")
    if kind == "Feature":
        events = [payload]
    elif kind == "FeatureCollection":
        events = payload.get("features")
        if not isinstance(events, list):
            raise ValueError("FeatureCollection.features must be an array")
    else:
        raise ValueError("Expected a GeoJSON Feature or FeatureCollection")
    seen = set()
    for event in events:
        if not isinstance(event, dict) or event.get("type") != "Feature":
            raise ValueError("Every event must be a GeoJSON Feature")
        identifier = event.get("id")
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise ValueError("Captured event IDs must be nonempty and unique")
        seen.add(identifier)
        if not isinstance(event.get("properties"), dict):
            raise ValueError("Event properties must be an object")
    return events, digest


def _query(query: Mapping | None) -> dict:
    result = dict(query or {})
    if set(result) - QUERY_KEYS:
        raise ValueError(f"Unsupported query fields: {sorted(set(result) - QUERY_KEYS)}")
    for name in ("magnitude_types", "event_types"):
        if name in result:
            values = result[name]
            if not isinstance(values, (list, tuple)) or any(not isinstance(v, str) for v in values):
                raise ValueError(f"{name} must be a list of strings")
            result[name] = list(values)
    for name in ("start_time_utc", "end_time_utc"):
        if name in result:
            result[name] = _iso(result[name])
    for name in QUERY_KEYS - {"magnitude_types", "event_types", "start_time_utc", "end_time_utc"}:
        if name in result:
            result[name] = _numeric(result[name])
            if result[name] is None:
                raise ValueError(f"{name} cannot be null")
    for field in ("magnitude", "latitude", "longitude"):
        low, high = result.get(f"min_{field}"), result.get(f"max_{field}")
        if low is not None and high is not None and low > high:
            raise ValueError(f"Reversed {field} bounds; antimeridian queries require explicit separate queries")
    if "start_time_utc" in result and "end_time_utc" in result:
        if _instant(result["start_time_utc"]) >= _instant(result["end_time_utc"]):
            raise ValueError("Time queries use a nonempty half-open interval [start, end)")
    return result


def _matches(row: dict, query: dict) -> bool:
    for field in ("magnitude", "latitude", "longitude"):
        for bound, compare in (("min", lambda a, b: a >= b), ("max", lambda a, b: a <= b)):
            name = f"{bound}_{field}"
            if name in query and (row.get(field) is None or not compare(row[field], query[name])):
                return False
    for name, field in (("magnitude_types", "magnitude_type"), ("event_types", "event_type")):
        if name in query and row.get(field) not in query[name]:
            return False
    if "start_time_utc" in query or "end_time_utc" in query:
        if row.get("origin_time_utc") is None:
            return False
        when = _instant(row["origin_time_utc"])
        if "start_time_utc" in query and when < _instant(query["start_time_utc"]):
            return False
        if "end_time_utc" in query and when >= _instant(query["end_time_utc"]):
            return False
    return True


def _summary(event: dict) -> dict:
    props = event["properties"]
    geometry = event.get("geometry") or {}
    coordinates = geometry.get("coordinates") or []
    return {
        "event_id_at_capture": event["id"],
        "origin_time_utc": _millisecond_instant(props["time"]) if props.get("time") is not None else None,
        "longitude": _numeric(coordinates[0]) if len(coordinates) > 0 else None,
        "latitude": _numeric(coordinates[1]) if len(coordinates) > 1 else None,
        "depth_km": _numeric(coordinates[2]) if len(coordinates) > 2 else None,
        "magnitude": _numeric(props.get("mag")),
        "magnitude_type": props.get("magType"),
        "event_type": props.get("type"),
        "summary_net": props.get("net"),
        "summary_updated_epoch_ms": props.get("updated"),
    }


def snapshot_observed(
    raw_bytes: bytes, retrieved_at_utc: str, query: Mapping | None = None,
    *, expected_sha256: str | None = None,
) -> dict:
    """Evaluate a query on current event summaries in captured bytes.

    The retrieval time is supplied by the capture receipt. This function verifies
    bytes when a hash is supplied; it cannot independently authenticate that time.
    """
    events, digest = _evidence(raw_bytes, expected_sha256)
    spec = _query(query)
    rows = [_summary(event) for event in events]
    selected = [row for row in rows if _matches(row, spec)]
    return {
        "schema_version": SCHEMA_VERSION, "contract": "snapshot_observed",
        "evidence_sha256": digest, "retrieved_at_utc": _iso(retrieved_at_utc),
        "retrieval_time_basis": "supplied_capture_receipt",
        "query": spec, "query_time_interval": "[start_time_utc, end_time_utc)",
        "captured_event_count": len(rows), "count": len(selected), "records": selected,
        "scope": "Supplied current summary bytes at capture; not a physical-event population or a historical replay.",
        "missing_value_policy": "Missing attributes remain null; records with unknown required filter values do not pass that filter.",
        "capture_caveat": "HTTP responses are observations during a capture interval, not proof of an atomic global catalogue snapshot.",
        "historical_publication_reconstructed": False,
    }


def retained_projection_conditional(
    raw_bytes: bytes, cutoff_utc: str, assumptions: Sequence[str],
    *, product_type: str = "origin", query: Mapping | None = None,
) -> dict:
    """Select latest retained version per product identity before a producer cutoff.

    Multiple lineages for an event remain multiple records. The returned count is
    a count of retained product lineages passing a query, never unique earthquakes.
    """
    if isinstance(assumptions, str) or not isinstance(assumptions, Sequence):
        raise ValueError("Acknowledge every required assumption explicitly by its key")
    supplied = set(assumptions)
    if supplied != set(REQUIRED_ASSUMPTIONS):
        raise ValueError(f"Required assumption keys: {sorted(REQUIRED_ASSUMPTIONS)}")
    events, digest = _evidence(raw_bytes)
    cutoff = _instant(cutoff_utc)
    spec = _query(query)
    latest = {}
    considered = 0
    for event in events:
        products = event["properties"].get("products", {})
        if not isinstance(products, dict) or not isinstance(products.get(product_type, []), list):
            raise ValueError("Products must map product types to arrays")
        for product in products.get(product_type, []):
            considered += 1
            if not isinstance(product, dict):
                raise ValueError("Every retained product must be an object")
            if (not isinstance(product.get("status"), str)
                    or product["status"].upper() not in {"UPDATE", "DELETE"}):
                raise ValueError("Every retained product must have an explicit UPDATE or DELETE status")
            identity = (product.get("source"), product.get("type", product_type), product.get("code"))
            if any(not isinstance(part, str) or not part for part in identity):
                raise ValueError("Product source, type and code are required for lineage")
            if identity[1] != product_type:
                raise ValueError("Product type contradicts its containing product array")
            when = _instant(_millisecond_instant(product.get("updateTime")))
            if when > cutoff:
                continue
            previous = latest.get(identity)
            if previous and previous[0] == when and previous[1] != product:
                raise ValueError("Conflicting retained bytes for one product identity and version")
            if previous and previous[2] != event["id"]:
                raise ValueError("One product identity occurs under multiple captured event IDs; resolve associations explicitly")
            if previous is None or previous[0] < when:
                latest[identity] = (when, product, event["id"])
    active, deletions = [], []
    for identity, (when, product, captured_event_id) in sorted(latest.items()):
        props = product.get("properties", {})
        if not isinstance(props, dict):
            raise ValueError("Product properties must be an object")
        row = {
            "event_id_at_capture": captured_event_id,
            "lineage": {"product_source": identity[0], "product_type": identity[1], "product_code": identity[2]},
            "producer_update_time_utc": when.isoformat().replace("+00:00", "Z"),
            "status": product.get("status"), "product_id": product.get("id"),
            "origin_source": props.get("origin-source"),
            "magnitude_source": props.get("magnitude-source"),
            "origin_time_utc": _iso(props["eventtime"]) if props.get("eventtime") else None,
            "latitude": _numeric(props.get("latitude")), "longitude": _numeric(props.get("longitude")),
            "depth_km": _numeric(props.get("depth")), "magnitude": _numeric(props.get("magnitude")),
            "magnitude_type": props.get("magnitude-type"), "event_type": props.get("event-type"),
        }
        if str(product.get("status", "")).upper() == "DELETE":
            deletions.append(row)
        else:
            active.append(row)
    selected = [row for row in active if _matches(row, spec)]
    return {
        "schema_version": SCHEMA_VERSION, "contract": "retained_projection_conditional",
        "evidence_sha256": digest, "producer_cutoff_utc": _iso(cutoff_utc),
        "assumptions": dict(REQUIRED_ASSUMPTIONS), "query": spec,
        "retained_versions_considered": considered, "selected_lineage_count": len(selected),
        "active_lineage_count_before_query": len(active), "records": selected,
        "retained_deletions": deletions,
        "count_unit": "retained_product_lineages_not_unique_earthquakes",
        "scope": "Latest retained product version per source/type/code at or before the producer cutoff, using captured event associations only.",
        "historical_publication_reconstructed": False, "preferred_origin_reconstructed": False,
        "incomplete_evidence": list(HISTORICAL_GAPS),
    }


def historical_catalog_not_identifiable(raw_bytes: bytes, cutoff_utc: str) -> dict:
    """Refuse a past-public-catalogue claim from present/superseded bytes alone.

    A retained projection remains possible; this refusal addresses a stronger claim.
    It does not assert that particular missing revisions actually existed.
    """
    events, digest = _evidence(raw_bytes)
    return {
        "schema_version": SCHEMA_VERSION, "contract": "historical_catalog_not_identifiable",
        "evidence_sha256": digest, "requested_past_time_utc": _iso(cutoff_utc),
        "captured_known_event_count": len(events), "historical_publication_reconstructed": False,
        "result": None, "unestablished_requirements": list(HISTORICAL_GAPS),
        "reason": "Current and superseded products alone do not demonstrate the past public catalogue query result.",
        "permitted_alternative": "An observed captured snapshot or an explicitly conditional retained projection, labelled with its evidence scope.",
    }


def _synthetic_replay(kind: str, history: dict, when: str) -> tuple[dict, int]:
    """Observe a tiny symbolic history; used only to verify counterexamples.

    T0--T3 are totally ordered toy times. This is not a ComCat replay engine.
    """
    if when not in {"T1", "T3"}:
        raise ValueError("Synthetic replay supports only T1 and T3")
    if kind == "producer_clock_is_not_public_availability":
        retained = [
            {key: version[key] for key in ("id", "update", "magnitude")}
            for version in history["versions"] if version["published"] <= when
        ]
        evidence = {"capture": when, "retained_versions": retained}
        answer = sum(version["magnitude"] >= 5.5 for version in retained)
    elif kind == "past_preference_is_not_current_preference":
        choices = [change for change in history["preference_changes"] if change["time"] <= when]
        preferred = max(choices, key=lambda change: change["time"])["preferred"]
        origins = history["origins"]
        evidence = {"capture": when, "origins": origins, f"preferred_at_{when}": preferred}
        answer = int(next(origin for origin in origins if origin["id"] == preferred)["magnitude"] >= 5.5)
    elif kind == "current_cohort_does_not_identify_withdrawn_membership":
        identifiers = sorted(
            row["id"] for row in history["events"]
            if row["published"] <= when and (row.get("withdrawn") is None or row["withdrawn"] > when)
        )
        evidence = {"capture": when, "returned_event_ids": identifiers, "queried_detail_ids": identifiers}
        answer = len(identifiers)
    else:
        raise ValueError("Unknown synthetic witness kind")
    return evidence, answer


def validate_synthetic_witness(witness: dict) -> dict:
    """Independently replay both toy histories instead of trusting stored answers."""
    kind = witness["id"]
    current_a, _ = _synthetic_replay(kind, witness["history_a"], "T3")
    current_b, _ = _synthetic_replay(kind, witness["history_b"], "T3")
    _, answer_a = _synthetic_replay(kind, witness["history_a"], "T1")
    _, answer_b = _synthetic_replay(kind, witness["history_b"], "T1")
    same = current_a == current_b == witness["evidence_at_capture"]
    return {"same_current_evidence": same, "past_answer_a": answer_a,
            "past_answer_b": answer_b, "different_past_answers": answer_a != answer_b,
            "valid_counterexample": same and answer_a != answer_b}


def synthetic_nonidentifiability_witnesses() -> list[dict]:
    """Return verified toy counterexamples, never observations from an agency."""
    examples = [
        {
            "id": "producer_clock_is_not_public_availability",
            "evidence_at_capture": {"capture": "T3", "retained_versions": [{"id": "A", "update": "T0", "magnitude": 5.6}]},
            "history_a": {"versions": [{"id": "A", "update": "T0", "magnitude": 5.6, "published": "T0"}]},
            "history_b": {"versions": [{"id": "A", "update": "T0", "magnitude": 5.6, "published": "T2"}]},
            "missing_evidence": "No public receipt time constrains publication relative to T1.",
        },
        {
            "id": "past_preference_is_not_current_preference",
            "evidence_at_capture": {"capture": "T3", "origins": [{"id": "A", "magnitude": 5.6}, {"id": "B", "magnitude": 5.2}], "preferred_at_T3": "A"},
            "history_a": {
                "origins": [{"id": "A", "magnitude": 5.6}, {"id": "B", "magnitude": 5.2}],
                "preference_changes": [{"time": "T0", "preferred": "A"}],
            },
            "history_b": {
                "origins": [{"id": "A", "magnitude": 5.6}, {"id": "B", "magnitude": 5.2}],
                "preference_changes": [{"time": "T0", "preferred": "B"}, {"time": "T2", "preferred": "A"}],
            },
            "missing_evidence": "Past preference/management history is absent; both histories converge to A at T3.",
        },
        {
            "id": "current_cohort_does_not_identify_withdrawn_membership",
            "evidence_at_capture": {"capture": "T3", "returned_event_ids": ["A"], "queried_detail_ids": ["A"]},
            "history_a": {"events": [{"id": "A", "published": "T0"}]},
            "history_b": {"events": [{"id": "A", "published": "T0"}, {"id": "B", "published": "T0", "withdrawn": "T2"}]},
            "missing_evidence": "No independent enumeration or past snapshot reveals withdrawn event B.",
        },
    ]
    for example in examples:
        example["synthetic"] = True
        example["time_order"] = "T0 < T1 < T2 < T3; labels are illustrative, not dates."
        encoded = json.dumps(example["evidence_at_capture"], sort_keys=True, separators=(",", ":")).encode()
        digest = hashlib.sha256(encoded).hexdigest()
        example["history_a_evidence_sha256"] = digest
        example["history_b_evidence_sha256"] = digest
        example["claim"] = "The two synthetic histories have identical supplied current evidence and different past answers."
        example["validation"] = validate_synthetic_witness(example)
        if not example["validation"]["valid_counterexample"]:
            raise ValueError("Invalid synthetic counterexample")
    return examples


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path, help="Captured ComCat GeoJSON file; no network access")
    parser.add_argument("--retrieved-at", required=True, help="UTC timestamp from the capture receipt")
    parser.add_argument("--cutoff", action="append", default=[], help="Producer cutoff for an optional retained projection")
    parser.add_argument("--acknowledge-retained-assumptions", action="store_true")
    args = parser.parse_args()
    if args.cutoff and not args.acknowledge_retained_assumptions:
        parser.error("--cutoff requires --acknowledge-retained-assumptions; this is not a public historical replay")
    raw = args.raw.read_bytes()
    result = {"snapshot": snapshot_observed(raw, args.retrieved_at), "projections": [], "historical_claims": []}
    for cutoff in args.cutoff:
        result["projections"].append(retained_projection_conditional(raw, cutoff, list(REQUIRED_ASSUMPTIONS)))
        result["historical_claims"].append(historical_catalog_not_identifiable(raw, cutoff))
    result["synthetic_counterexamples"] = synthetic_nonidentifiability_witnesses()
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
