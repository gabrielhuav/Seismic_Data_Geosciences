"""Independent-oracle checks use explicitly synthetic inputs only."""
import json
import unittest
from scripts.validate_evidence import (
    SqlOracle, contract_signature, exported_evidence, fixture_product, instant,
    public_count, sql_signature, synthetic_histories, synthetic_validation,
)
from scripts.evidence_contract import retained_projection_conditional, REQUIRED_ASSUMPTIONS


class IndependentOracleTests(unittest.TestCase):
    def test_sql_ranks_before_filter_and_does_not_resurrect_deletion(self):
        payload = {"type": "Feature", "id": "A", "properties": {"products": {"origin": [
            fixture_product("A", 1000, 6), fixture_product("A", 2000, 5), fixture_product("A", 4000, status="DELETE")
        ]}}}
        oracle = SqlOracle(payload)
        rows, tombstones, active = oracle.select(3000, {"min_magnitude": 5.5})
        self.assertEqual((len(rows), len(tombstones), active), (0, 0, 1))
        rows, tombstones, active = oracle.select(4000, {})
        self.assertEqual((len(rows), len(tombstones), active), (0, 1, 0))
        actual = retained_projection_conditional(json.dumps(payload).encode(), instant(4000), list(REQUIRED_ASSUMPTIONS))
        self.assertEqual(contract_signature(actual["records"]), sql_signature(rows))
        self.assertEqual(contract_signature(actual["retained_deletions"]), sql_signature(tombstones))
        oracle.close()

    def test_public_replay_uses_receipt_time_instead_of_producer_clock(self):
        case = next(c for c in synthetic_histories() if c["family"] == "public_availability_clock_absent")
        self.assertEqual(public_count(case["history"], 3000, 5.5), 0)
        self.assertEqual(public_count(case["history"], 5000, 5.5), 1)
        payload = exported_evidence(case)
        result = retained_projection_conditional(json.dumps(payload).encode(), instant(3000), list(REQUIRED_ASSUMPTIONS))
        self.assertEqual(result["selected_lineage_count"], 1)
        self.assertFalse(result["historical_publication_reconstructed"])

    def test_evidence_loss_changes_data_not_conditional_label(self):
        case = next(c for c in synthetic_histories() if c["family"] == "omitted_magnitude_revision")
        payload = exported_evidence(case)
        self.assertEqual(len(payload["features"][0]["properties"]["products"]["origin"]), 2)
        oracle = SqlOracle(payload)
        expected, _, _ = oracle.select(3000, {"min_magnitude": 5.5})
        self.assertEqual(len(expected), 1)
        self.assertEqual(public_count(case["history"], 3000, 5.5), 0)
        oracle.close()

    def test_synthetic_assessment_preserves_units_and_scope(self):
        summary, rows, fixtures = synthetic_validation()
        self.assertEqual(len(fixtures), 8)
        self.assertEqual(len(rows), 24)
        self.assertEqual(summary["projection_disagreements"], 0)
        self.assertEqual(summary["historical_claims_declined"], 24)
        self.assertTrue(all("conditional_retained_lineage_count" in row and "synthetic_public_event_count" in row for row in rows))


if __name__ == "__main__": unittest.main()
