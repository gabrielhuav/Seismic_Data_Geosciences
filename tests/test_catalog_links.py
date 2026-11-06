"""Catalogue link policies tested with temporary synthetic data and no HTTP."""

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import check_links


class CatalogueLinkTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="seismic-link-policy-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dist = self.root / "system/dist"
        self.dist.mkdir(parents=True)
        self.catalogs = []
        self.usgs = self.catalog("usgs-fixture", "usgs", ["us-fixture-1"])
        self.canada = self.catalog("nrcan-fixture", "nrcan", ["nrcan-local-0123456789abcdef01234567-1", "nrcan-local-0123456789abcdef01234567-2"], derived=True)
        self.registry()
        self.app = self.dist / "app.js"
        self.app.write_text("", encoding="utf-8")
        for name, value in [("ROOT", self.root), ("DIST", self.dist)]:
            replacement = patch.object(check_links, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)
        source_paths = patch.object(check_links, "source_paths", return_value=[self.app])
        source_paths.start()
        self.addCleanup(source_paths.stop)
        self.http = patch.object(check_links, "urlopen", side_effect=AssertionError("No real HTTP is allowed in these tests"))
        self.urlopen = self.http.start()
        self.addCleanup(self.http.stop)

    @staticmethod
    def write_json(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
        path.write_bytes(raw)
        return check_links.digest(raw)

    def catalog(self, name, provider, identifiers, derived=False):
        directory = self.dist / "data/catalogs" / name
        data = {"fields": ["id", "file", "net", "time"],
                "rows": [[identifier, "input.csv", "", "2000-01-01T00:00:00Z"] for identifier in identifiers]}
        events_hash = self.write_json(directory / "events.json", data)
        manifest = {"files": [{"path": "input.csv", "url": "https://example.test/original.csv"}],
                    "derived_asset_sha256": events_hash}
        catalog = {"id": name, "provider": provider,
                   "events_url": f"data/catalogs/{name}/events.json",
                   "manifest_url": f"data/catalogs/{name}/manifest.json", "sha256": events_hash}
        if derived:
            catalog["identifier_kind"] = manifest["identifier_kind"] = "derived_row_key"
        catalog["manifest_sha256"] = self.write_json(directory / "manifest.json", manifest)
        self.catalogs.append(catalog)
        return catalog

    def registry(self):
        self.write_json(self.dist / "data/catalogs.json", {"catalogs": self.catalogs, "default_catalog_id": self.usgs["id"]})

    def test_canadian_derived_keys_never_generate_usgs_routes_in_any_mode(self):
        for mode in ["none", "sample", "all"]:
            with self.subTest(mode=mode):
                inventory, routes = check_links.event_routes(mode)
                self.assertEqual(inventory["malformed_event_ids"], [])
                canadian = next(c for c in inventory["catalogues"] if c["provider"] == "nrcan")
                self.assertEqual(canadian["records"], 2)
                self.assertEqual(canadian["sampled_or_selected_event_routes"], 0)
                self.assertFalse(any("nrcan-local" in route for route in routes))
                self.assertEqual(routes, [] if mode == "none" else ["https://earthquake.usgs.gov/earthquakes/eventpage/us-fixture-1"])
        self.urlopen.assert_not_called()

    def test_derived_identity_blocks_routes_even_if_provider_is_mislabelled(self):
        # A provider-label mistake cannot turn a local record key into an agency ID.
        self.canada["provider"] = "usgs"
        self.registry()
        _, routes = check_links.event_routes("all")
        self.assertEqual(routes, ["https://earthquake.usgs.gov/earthquakes/eventpage/us-fixture-1"])

    def test_manifest_derived_identity_also_blocks_routes_without_registry_flag(self):
        self.canada["provider"] = "usgs"
        del self.canada["identifier_kind"]
        self.registry()
        _, routes = check_links.event_routes("all")
        self.assertEqual(routes, ["https://earthquake.usgs.gov/earthquakes/eventpage/us-fixture-1"])

    def test_registry_integrity_detects_changed_event_and_manifest_bytes(self):
        before = check_links.privacy_and_integrity()
        self.assertEqual(before["privacy_failures"], [])
        self.assertTrue(all(c["ok"] for c in before["integrity_checks"]))
        for path_key in ["events_url", "manifest_url"]:
            with self.subTest(asset=path_key):
                target = self.dist / self.canada[path_key]
                original = target.read_bytes()
                target.write_bytes(original + b"\n")
                checked = check_links.privacy_and_integrity()
                failed = [c["check"] for c in checked["integrity_checks"] if not c["ok"]]
                self.assertIn(self.canada["id"] + ": " + path_key, failed)
                target.write_bytes(original)
        self.urlopen.assert_not_called()

    def test_tile_and_event_templates_are_inventoried_without_bulk_http(self):
        self.app.write_text("\n".join([
            "const osm='https://tile.openstreetmap.org/{z}/{x}/{y}.png';",
            "const tiles=`https://example.test/tiles/${z}/${x}/${y}.png`;",
            "const event=`https://earthquake.usgs.gov/earthquakes/eventpage/${event_id}`;",
            "const current='https://earthquake.usgs.gov/earthquakes/eventpage/' + encodeURIComponent(e.id);",
            "const policy='https://example.test/policy';",
        ]), encoding="utf-8")
        checked = []

        def check(url):
            checked.append(url)
            return {"url": url, "ok": True, "status": 200}

        with patch.object(check_links, "check_url", side_effect=check), patch("sys.argv", ["check_links.py", "--network", "--scope", "artifact", "--dynamic-events", "none"]), redirect_stdout(io.StringIO()):
            self.assertEqual(check_links.main(), 0)
        report = json.loads((self.root / "outputs/links/report_network.json").read_text(encoding="utf-8"))
        self.assertEqual(checked, ["https://example.test/policy"])
        self.assertEqual(len(report["url_templates"]), 4)
        self.assertEqual(report["dynamic_events"]["route_count"], 0)
        self.assertFalse(report["generated_event_links_exhaustively_checked"])
        self.urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
