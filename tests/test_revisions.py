"""Scientific-semantics tests for retained origin version auditing."""

import copy
import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location("audit_revisions", Path(__file__).resolve().parents[1] / "scripts" / "audit_revisions.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def product(update, magnitude="5.6", magtype="mww", source="us", code="usExample", product_type="origin", status="UPDATE", agency="us"):
    return {"source": source, "type": product_type, "code": code, "updateTime": update, "indexTime": update + 999999,
        "status": status, "properties": {"eventsource": "us", "origin-source": agency, "magnitude-source": agency,
        "eventtime": "2017-01-01T00:00:00Z", "latitude": "20", "longitude": "-100", "depth": "10", "magnitude": magnitude, "magnitude-type": magtype}}


class RevisionSemanticsTests(unittest.TestCase):
    def test_identical_duplicate_is_deduplicated_but_identity_conflict_fails(self):
        first = product(1000)
        self.assertEqual(len(audit.unique_products([first, copy.deepcopy(first)])), 1)
        conflict = copy.deepcopy(first)
        conflict["properties"]["magnitude"] = "6.1"
        with self.assertRaisesRegex(ValueError, "Conflicting product"):
            audit.unique_products([first, conflict])

    def test_tombstone_is_not_a_zero_magnitude_or_active_endpoint(self):
        initial, updated, tombstone = product(1000), product(2000, "5.8"), product(3000, status="DELETE")
        tombstone["properties"] = {}
        metrics = audit.endpoint_metrics([initial, updated, tombstone])
        self.assertEqual(metrics["retained_active_count"], 2)
        self.assertEqual(metrics["retained_delete_count"], 1)
        self.assertTrue(metrics["latest_retained_is_delete"])
        self.assertEqual(metrics["latest_magnitude"], 5.8)
        self.assertEqual(metrics["latest_retained_active_update_ms"], 2000)

    def test_product_types_and_branches_do_not_become_same_solution_revisions(self):
        observations = [product(1000), product(2000, product_type="internal-origin"), product(3000, product_type="phase-data"), product(4000, code="iscgem123", agency="iscgem"), product(5000, source="pt")]
        self.assertEqual(len(audit.primary_series(observations, "usExample")), 1)

    def test_upload_source_is_not_solution_or_magnitude_agency(self):
        item = product(1000, code="iscgem123", agency="iscgem")
        roles = audit.source_roles(item)
        self.assertEqual(roles["uploader"], "us")
        self.assertEqual(roles["origin_source"], "iscgem")
        self.assertEqual(roles["magnitude_source"], "iscgem")

    def test_update_clock_not_index_or_event_clock_orders_versions(self):
        early, late = product(1000), product(2000)
        early["indexTime"], late["indexTime"] = 9000000, 3000
        series = audit.primary_series([late, early], "usExample")
        metrics = audit.endpoint_metrics(series, summary_updated=86402000)
        self.assertEqual(metrics["earliest_retained_active_update_ms"], 1000)
        self.assertEqual(metrics["latest_retained_active_update_ms"], 2000)
        self.assertEqual(metrics["summary_update_minus_latest_origin_days"], 1)

    def test_earliest_retained_is_explicitly_not_claimed_first_issued(self):
        metrics = audit.endpoint_metrics([product(1000)])
        self.assertFalse(metrics["initial_solution_known"])
        self.assertNotIn("first_issued", metrics)

    def test_type_switch_does_not_generate_cross_scale_magnitude_delta(self):
        metrics = audit.endpoint_metrics([product(1000, "5.4", "mb"), product(2000, "5.7", "mww")])
        self.assertFalse(metrics["comparable_endpoint_magnitude"])
        self.assertIsNone(metrics["same_type_magnitude_delta"])
        self.assertEqual(metrics["endpoint_threshold_crossings"], [])

    def test_transient_same_type_threshold_crossing_is_not_lost(self):
        metrics = audit.endpoint_metrics([product(1000, "5.6"), product(2000, "6.0"), product(3000, "5.6")])
        self.assertEqual(metrics["endpoint_threshold_crossings"], [])
        self.assertIn(6.0, metrics["retained_within_type_threshold_variation"]["mww"])

    def test_magnitude_type_case_is_scientifically_significant(self):
        metrics = audit.endpoint_metrics([product(1000, "5.4", "mB"), product(2000, "5.7", "mb")])
        self.assertFalse(metrics["comparable_endpoint_magnitude"])
        self.assertIsNone(metrics["same_type_magnitude_delta"])
        self.assertEqual(metrics["endpoint_threshold_crossings"], [])
        self.assertEqual(set(metrics["retained_within_type_threshold_variation"]), {"mB", "mb"})

    def test_metadata_only_update_is_not_parameter_revision(self):
        first, last = product(1000), product(2000, "5.60")
        last["properties"]["review-status"] = "reviewed"
        metrics = audit.endpoint_metrics([first, last])
        self.assertEqual(metrics["adjacent_metadata_only_updates"], 1)
        self.assertEqual(metrics["adjacent_parameter_changes"], 0)

    def test_uncertainty_only_change_is_a_parameter_change(self):
        first, last = product(1000), product(2000)
        first["properties"]["horizontal-error"] = "1.0"
        last["properties"]["horizontal-error"] = "2.0"
        metrics = audit.endpoint_metrics([first, last])
        self.assertEqual(metrics["adjacent_metadata_only_updates"], 0)
        self.assertEqual(metrics["adjacent_parameter_changes"], 1)


if __name__ == "__main__":
    unittest.main()
