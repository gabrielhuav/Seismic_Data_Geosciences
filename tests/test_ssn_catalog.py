"""Offline SSN parsing invariants using synthetic rows, not private code."""
from collections import Counter
import csv
import io
import unittest
from unittest.mock import patch

from scripts import build_ssn_catalog as ssn


FOOTER = ["Profundidad en kilometros.", "La localizacion es solo una referencia a una localidad.",
          "Estatus verificado.", "Estatus revisado.", "Reproduccion con fuente.", "Aviso legal.", "Contacto."]


def row(**updates):
    cells = ["2000-01-01", "00:00:00", "3.5", "19.0", "-99.0", "0",
             "20 km al sur de Localidad, OAX", "1999-12-31", "18:00:00", "revisado"]
    for field, value in updates.items():
        cells[ssn.SOURCE_FIELDS.index(field)] = value
    return cells


def source(rows, *, declared=None, fields=None, footer=None):
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    for text in ["Catalogo de sismos - SSN | UNAM", "Archivo generado el 2026-11-06 a las 13:57:07 (tiempo del centro de Mexico).",
                 "Sismicidad del 1900-01-01 al 2026-11-06 (UTC), todas las magnitudes, todas las profundidades, en todo el pais.",
                 f"Total: {len(rows) if declared is None else declared} eventos."]:
        writer.writerow([text])
    writer.writerow(ssn.SOURCE_FIELDS if fields is None else fields)
    writer.writerows(rows)
    for text in FOOTER if footer is None else footer:
        writer.writerow([text])
    return buffer.getvalue().encode("utf-8")


class SSNCatalogTests(unittest.TestCase):
    def unpack(self, parsed):
        return [dict(zip(ssn.FIELDS, values)) for values in parsed["rows"]]

    def test_native_utc_and_local_year_boundary_and_observed_zero(self):
        original = row()
        parsed = ssn.parse_snapshot(source([original]))
        record = self.unpack(parsed)[0]
        self.assertEqual(record["time"], "2000-01-01T00:00:00Z")
        self.assertEqual(record["raw_local_date"], "1999-12-31")
        self.assertEqual(record["depth"], 0)
        self.assertEqual(record["raw_depth"], "0")
        self.assertEqual(record["place"], original[6])
        self.assertEqual(record["status"], "revisado")
        self.assertEqual(record["source_record"], 1)
        self.assertEqual(record["event_url"], "")
        for field in ssn.UNKNOWN_FIELDS:
            self.assertIsNone(record[field], field)
        self.assertNotIn("state", record)
        self.assertNotIn("country", record)
        self.assertEqual(parsed["statistics"]["by_origin_year"], {2000: 1})

    def test_utc_does_not_depend_on_local_offset_or_validity(self):
        parsed = ssn.parse_snapshot(source([row(**{"Fecha local": "2000-01-02", "Hora local": "00:00:00"}),
                                           row(**{"Fecha local": "unknown", "Hora local": "unknown"})]))
        self.assertEqual([r["time"] for r in self.unpack(parsed)], ["2000-01-01T00:00:00Z"] * 2)
        self.assertEqual(parsed["statistics"]["raw_local_time_invalid_rows"], 1)
        self.assertEqual(parsed["statistics"]["observed_utc_minus_local_hour_counts"], {"-24.0": 1})

    def test_selection_reconciles_unknown_below_and_invalid_records(self):
        rows = [row(), row(Magnitud="no calculable"), row(Magnitud="3.4"),
                row(Latitud="91"), row(**{"Fecha UTC": "2000-02-30"}),
                row(Magnitud="NaN"), row(Magnitud=""), row(**{"Fecha UTC": "2026-11-07"}),
                row(Longitud="not numeric")]
        stats = ssn.parse_snapshot(source(rows))["statistics"]
        self.assertEqual(stats["raw_rows"], 9)
        self.assertEqual(stats["packaged_records"], 1)
        self.assertEqual(stats["excluded_rows"], {"missing_or_invalid_magnitude": 3, "magnitude_below_3_5": 1,
                                                "invalid_coordinates": 2, "invalid_utc_time": 1,
                                                "outside_declared_query_period": 1})
        self.assertEqual(stats["non_numeric_magnitude_tokens"], {"no calculable": 1, "NaN": 1})
        self.assertEqual(stats["raw_missing_numeric_fields"], {"mag": 1})
        self.assertEqual(stats["raw_invalid_numeric_fields"], {"mag": 2, "longitude": 1})
        self.assertEqual(stats["raw_rows"], stats["packaged_records"] + sum(stats["excluded_rows"].values()))

    def test_derived_keys_keep_repeats_and_do_not_depend_on_selection_position(self):
        original = row()
        parsed = ssn.parse_snapshot(source([row(Magnitud="2.0"), original, original]))
        records = self.unpack(parsed)
        expected_id, _ = ssn.row_key(original, Counter(), {})
        self.assertEqual(records[0]["id"], expected_id)
        self.assertEqual(records[1]["id"], expected_id[:-1] + "2")
        self.assertEqual([r["source_record"] for r in records], [2, 3])
        self.assertEqual(parsed["statistics"]["raw_exact_duplicate_rows_retained"], 1)
        self.assertEqual(parsed["statistics"]["selected_exact_duplicate_rows_retained"], 1)
        self.assertRegex(records[0]["id"], r"^[A-Za-z0-9_-]{1,80}$")
        self.assertEqual(parsed, ssn.parse_snapshot(source([row(Magnitud="2.0"), original, original])))

    def test_short_key_collision_is_rejected(self):
        occurrences, prefixes = Counter(), {}
        with patch.object(ssn, "sha", side_effect=["a" * 24 + "b" * 40, "a" * 24 + "c" * 40]):
            ssn.row_key(row(), occurrences, prefixes)
            with self.assertRaisesRegex(ValueError, "prefix collision"):
                ssn.row_key(row(Magnitud="4"), occurrences, prefixes)

    def test_header_clock_discrepancy_is_flagged_without_deleting_record(self):
        cells = row(**{"Fecha UTC": "2026-11-06", "Hora UTC": "20:31:07", "Fecha local": "2026-11-06", "Hora local": "14:31:07"})
        parsed = ssn.parse_snapshot(source([cells]))
        self.assertEqual(parsed["source_timing"]["source_records_later_than_header_local"], [1])
        self.assertEqual(parsed["source_timing"]["selected_records_later_than_header_local"], 1)
        self.assertEqual(self.unpack(parsed)[0]["time"], "2026-11-06T20:31:07Z")
        self.assertEqual(parsed["source_timing"]["header_generated_local"], "2026-11-06T13:57:07")

    def test_missing_source_years_are_distinct_from_selected_years(self):
        parsed = ssn.parse_snapshot(source([row(**{"Fecha UTC": "1900-01-01", "Magnitud": "2.0"}),
                                           row(**{"Fecha UTC": "1902-01-01"})]))
        stats = parsed["statistics"]
        self.assertIn(1901, stats["years_without_source_records"])
        self.assertNotIn(1900, stats["years_without_source_records"])
        self.assertEqual(stats["years_with_source_records_but_no_selected_records"], [1900])

    def test_schema_width_count_and_footer_are_required(self):
        bad_fields = list(ssn.SOURCE_FIELDS)
        bad_fields[0] = "Fecha local"
        for bad in [source([row()], fields=bad_fields), source([row()[:-1]]), source([row()], declared=2),
                    source([row()], declared=0), source([row()], footer=FOOTER[:-1]),
                    source([row()], footer=["Depth unit unknown"] + FOOTER[1:])]:
            with self.subTest(prefix=bad[:80]), self.assertRaises(ValueError):
                ssn.parse_snapshot(bad)

    def test_pinned_source_rejects_changed_bytes_and_alternative_selection(self):
        raw = source([row()])
        ssn.verify_source(raw, expected_sha=ssn.sha(raw), expected_bytes=len(raw))
        with self.assertRaisesRegex(ValueError, "pinned"):
            ssn.verify_source(raw + b"x", expected_sha=ssn.sha(raw), expected_bytes=len(raw))
        with self.assertRaisesRegex(ValueError, "fixed"):
            ssn.parse_snapshot(raw, minimum_magnitude=5)


if __name__ == "__main__":
    unittest.main()
