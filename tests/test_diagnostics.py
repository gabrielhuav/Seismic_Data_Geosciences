"""Check browser diagnostics against independently parsed retained GeoJSON."""
import importlib.util
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT/'scripts/audit_revisions.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class DiagnosticsTests(unittest.TestCase):
    def test_browser_endpoints_match_raw_product_audit(self):
        node = Path(sys.executable).parent.parent/'node/bin/node.exe'
        if not node.exists(): node = shutil.which('node')
        script = "const fs=require('node:fs'),D=require('./system/dist/diagnostics.js');console.log(JSON.stringify(D.endpoints(JSON.parse(fs.readFileSync('system/dist/data/revisions.json','utf8')))))"
        actual = json.loads(subprocess.check_output([str(node),'-e',script],cwd=ROOT))
        package = json.loads((ROOT/'system/dist/data/revisions.json').read_text())
        self.assertEqual(len(actual),36)
        self.assertEqual(sum(e['n'] for e in actual),205)
        for event, result in zip(package['events'],actual):
            source=ROOT/'research-data/comcat/events'/Path(event['raw_file']).name
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),event['raw_sha256'])
            raw=json.loads(source.read_text(encoding='utf-8'))
            expected=audit.endpoint_metrics(audit.primary_series(raw['properties']['products']['origin'],event['id']))
            for key in ['earliest_depth_km','latest_depth_km','earliest_magnitude','latest_magnitude','earliest_magnitude_type','latest_magnitude_type','comparable_endpoint_magnitude']:
                self.assertEqual(result[key],expected[key],(event['id'],key))
            self.assertAlmostEqual(result['epicentre_displacement_km'],expected['epicentre_displacement_km'],places=9)
        self.assertEqual(sum(e['comparable_endpoint_magnitude'] and e['earliest_magnitude_type']=='mww' for e in actual),30)
        self.assertEqual(sum(e['comparable_endpoint_magnitude'] and e['earliest_magnitude_type']=='mb' for e in actual),1)
        self.assertEqual(sum(e['comparable_endpoint_magnitude'] and (e['earliest_magnitude']>=5.5)!=(e['latest_magnitude']>=5.5) for e in actual),4)

    def test_full_ssn_summary_rebuilds_from_verified_source(self):
        spec=importlib.util.spec_from_file_location('coverage',ROOT/'scripts/build_diagnostic_coverage.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        data=module.build()
        self.assertEqual(data,json.loads(module.TARGET.read_text()))
        self.assertEqual(sum(not b['all'] for b in data['annual_bins']),16)
        closed=[b for b in data['annual_bins'] if b['year']<2026 and b['all']]
        self.assertEqual(len(closed),110)
        self.assertEqual(sum(b['maximum_rows'] for b in closed),118)
