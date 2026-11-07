"""Country means pinned land-polygon containment, never agency or place text."""
from copy import deepcopy
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import build_country_index as country


def ring(west=0, south=0, east=10, north=10):
    return [[west, south], [east, south], [east, north], [west, north], [west, south]]


def feature(code, coordinates, *, name=None, kind="Polygon"):
    return {"type": "Feature", "properties": {"ADMIN": name or code, "NAME_EN": name or code, "ISO_A3": code},
            "geometry": {"type": kind, "coordinates": coordinates}}


def index(*features):
    return country.LandIndex({"type": "FeatureCollection", "features": list(features)})


class CountryGeometryTests(unittest.TestCase):
    def test_inside_outside_horizontal_edges_vertices_and_numeric_boundary(self):
        land = index(feature("AAA", [ring()]))
        self.assertEqual(land.classify(5, 5), "AAA")
        self.assertEqual(land.classify(-1, 5), "outside")
        for point in [(0, 0), (10, 10), (5, 0), (5, 10), (0, 5), (10, 5), (5, 10 + country.EPSILON / 2)]:
            with self.subTest(point=point):
                self.assertEqual(land.classify(*point), "boundary")
        self.assertEqual(land.classify(5, 10 + country.EPSILON * 20), "outside")

    def test_holes_remain_unassigned_and_their_edges_are_boundaries(self):
        land = index(feature("AAA", [ring(), ring(3, 3, 7, 7)]))
        self.assertEqual(land.classify(2, 2), "AAA")
        self.assertEqual(land.classify(5, 5), "outside")
        self.assertEqual(land.classify(3, 5), "boundary")
        reversed_rings = [list(reversed(ring())), list(reversed(ring(3, 3, 7, 7)))]
        self.assertEqual(index(feature("AAA", reversed_rings)).classify(5, 5), "outside")

    def test_multipolygon_islands_do_not_make_an_intervening_country(self):
        land = index(feature("AAA", [[ring()], [ring(20, 0, 25, 5)]], kind="MultiPolygon"))
        self.assertEqual(land.classify(2, 2), "AAA")
        self.assertEqual(land.classify(22, 2), "AAA")
        self.assertEqual(land.classify(15, 2), "outside")

    def test_shared_boundary_and_overlapping_regions_have_no_first_winner(self):
        a, b = feature("AAA", [ring()]), feature("BBB", [ring(10, 0, 20, 10)])
        self.assertEqual(index(a, b).classify(10, 5), "boundary")
        overlapping = feature("BBB", [ring(5, 0, 15, 10)])
        for ordered in [(a, overlapping), (overlapping, a)]:
            self.assertEqual(index(*ordered).classify(7, 5), "boundary")
        # Multiple components of one region still identify one region.
        same = feature("AAA", [[ring()], [ring(5, 0, 15, 10)]], kind="MultiPolygon")
        self.assertEqual(index(same).classify(7, 5), "AAA")

    def test_antimeridian_and_holes_use_both_longitudes_without_mutation(self):
        outer = [[179, -2], [-179, -2], [-179, 2], [179, 2], [179, -2]]
        hole = [[179.5, -.5], [-179.5, -.5], [-179.5, .5], [179.5, .5], [179.5, -.5]]
        f = feature("AAA", [outer, hole]);before = deepcopy(f);land = index(f)
        for x in [179.25, -179.25]:
            self.assertEqual(land.classify(x, 0), "AAA")
        for x in [180, -180, 179.75, -179.75]:
            self.assertEqual(land.classify(x, 0), "outside")
        self.assertEqual(land.classify(0, 0), "outside")
        self.assertEqual(land.classify(179, 0), "boundary")
        self.assertEqual(land.classify(-179.5, 0), "boundary")
        self.assertEqual(f, before)

    def test_invalid_coordinates_do_not_become_a_country(self):
        land = index(feature("AAA", [ring()]))
        for point in [(None, 5), (float("nan"), 5), (float("inf"), 5), ("5", 5), (True, 5), (181, 5), (5, 91)]:
            with self.subTest(point=point):
                self.assertEqual(land.classify(*point), "invalid")

    def test_stable_iso_or_admin_ids_labels_and_collision_rejection(self):
        regions = index(feature("MEX", [ring()], name="Mexico"), feature("-99", [ring(20, 0, 25, 5)], name="France")).regions
        self.assertEqual([r["id"] for r in regions], ["MEX", "NE_france"])
        self.assertEqual(regions[0]["label"], {"en": "Mexico", "es": "México"})
        with self.assertRaisesRegex(ValueError, "Repeated"):
            index(feature("AAA", [ring()]), feature("AAA", [ring(20, 0, 25, 5)]))
        with self.assertRaisesRegex(ValueError, "closed"):
            index(feature("AAA", [[[0, 0], [10, 0], [10, 10], [0, 10]]]))

    def test_order_is_one_result_per_row_with_original_data_untouched(self):
        land = index(feature("AAA", [ring()]), feature("BBB", [ring(20, 0, 30, 10)]))
        source = {"fields": ["id", "latitude", "longitude", "place", "net"],
                  "rows": [["same", 5, 25, "Mexico", "unm"], ["same", 5, 5, "Canada", "can"],
                           ["x", 5, 15, "USA", "us"], ["bool", 5, True, "AAA", "AAA"], ["valid", 5, 1, "BBB", "BBB"]]}
        before = deepcopy(source)
        ids, counts = country.classify_package(source, 5, land)
        self.assertEqual(ids, ["BBB", "AAA", "outside", "invalid", "AAA"])
        self.assertEqual(sum(counts.values()), 5)
        self.assertEqual(source, before)
        source["rows"].reverse()
        reversed_ids, _ = country.classify_package(source, 5, land)
        self.assertEqual(reversed_ids, list(reversed(ids)))

    def test_hash_is_checked_before_json_decode_and_malformed_rows_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "input.json";path.write_bytes(b"not-json")
            with patch.object(country.json, "loads", side_effect=AssertionError("Decode must not run")):
                with self.assertRaisesRegex(ValueError, "SHA-256"):
                    country.load_verified_json(path, "0" * 64)
        land = index(feature("AAA", [ring()]))
        for source, n in [({"fields": ["latitude", "longitude"], "rows": [[5, 5]]}, 2),
                          ({"fields": ["latitude", "longitude"], "rows": [[5]]}, 1),
                          ({"fields": ["latitude", "latitude", "longitude"], "rows": [[5, 5, 5]]}, 1)]:
            with self.assertRaises(ValueError):
                country.classify_package(source, n, land)

    def test_verify_only_cli_recomputes_bytes_without_writing_and_rejects_drift(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp);dist = root / "system/dist";(dist / "data").mkdir(parents=True)
            geometry = country.compact({"type": "FeatureCollection", "features": [feature("AAA", [ring()])]})
            package = country.compact({"fields": ["latitude", "longitude"], "rows": [[5, 5], [5, 15]]})
            registry = country.compact({"catalogs": [{"id": "test", "events_url": "data/events.json",
                                                      "event_count": 2, "sha256": country.digest(package)}]})
            (dist / country.GEOMETRY_PATH).write_bytes(geometry)
            (dist / "data/events.json").write_bytes(package)
            (dist / "data/catalogs.json").write_bytes(registry)
            output = dist / "data/country-index.json"
            with patch.multiple(country, ROOT=root, DIST=dist, OUTPUT=output,
                                GEOMETRY_SHA256=country.digest(geometry), REGISTRY_SHA256=country.digest(registry)):
                with redirect_stdout(io.StringIO()):
                    country.main([])
                before, mtime = output.read_bytes(), output.stat().st_mtime_ns
                with redirect_stdout(io.StringIO()), patch.object(Path, "write_bytes", side_effect=AssertionError("verify-only must not write")):
                    country.main(["--verify-only"])
                self.assertEqual(output.read_bytes(), before)
                self.assertEqual(output.stat().st_mtime_ns, mtime)
                output.write_bytes(before + b"\n")
                with self.assertRaisesRegex(ValueError, "Country index bytes"):
                    country.main(["--verify-only"])


class RealCountryIndexTests(unittest.TestCase):
    def test_real_sidecar_hash_alignment_counts_and_source_order(self):
        if not country.OUTPUT.exists():
            self.skipTest("Run scripts/build_country_index.py to emit the real sidecar first")
        registry = country.load_verified_json(country.DIST / "data/catalogs.json", country.REGISTRY_SHA256)
        geometry = country.load_verified_json(country.DIST / country.GEOMETRY_PATH, country.GEOMETRY_SHA256)
        real = json.loads(country.OUTPUT.read_bytes());land = country.LandIndex(geometry)
        self.assertEqual(real["schema"], "seismic-country-index/1")
        self.assertEqual(real["geometry_sha256"], country.GEOMETRY_SHA256)
        self.assertEqual(len(land.regions), 47)
        self.assertEqual({r["id"] for r in real["regions"]}, {r["id"] for r in land.regions + country.SPECIAL_REGIONS})
        self.assertIn("NE_france", {r["id"] for r in real["regions"]})
        total = 0
        for catalog in registry["catalogs"]:
            package = country.load_verified_json(country.DIST / catalog["events_url"], catalog["sha256"])
            field = {key: i for i, key in enumerate(package["fields"])}
            item = real["catalogs"][catalog["id"]]
            self.assertEqual(item["events_sha256"], catalog["sha256"])
            self.assertEqual(item["row_count"], catalog["event_count"])
            self.assertEqual(len(item["country_ids"]), len(package["rows"]))
            self.assertEqual(sum(item["counts"].values()), len(package["rows"]))
            self.assertEqual({key: item["country_ids"].count(key) for key in item["counts"]}, item["counts"])
            for ordinal in [0, 1, len(package["rows"]) // 2, len(package["rows"]) - 1]:
                row = package["rows"][ordinal]
                self.assertEqual(item["country_ids"][ordinal], land.classify(row[field["longitude"]], row[field["latitude"]]))
            total += item["row_count"]
        self.assertEqual(total, 287936)


if __name__ == "__main__":
    unittest.main()
