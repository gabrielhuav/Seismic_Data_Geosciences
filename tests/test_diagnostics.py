"""Check browser diagnostics against independently parsed retained GeoJSON."""
import importlib.util
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
import math
import xml.etree.ElementTree as ET

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

    def test_coverage_svg_uses_one_shared_larger_geometry_without_changing_bins(self):
        node=Path(sys.executable).parent.parent/'node/bin/node.exe'
        if not node.exists():node=shutil.which('node')
        script=r"""
const fs=require('node:fs'),D=require('./system/dist/diagnostics.js'),data=JSON.parse(fs.readFileSync('system/dist/data/ssn-coverage.json','utf8')),before=JSON.stringify(data);
const labels={year:'UTC year',coverageTitle:'Observed rows',maximumTitle:'Annual maximum',logRows:'log10(n)',maximum:'Maximum M',gap:'No source rows'};
console.log(JSON.stringify({plots:D.coveragePlots(data,labels),partial:D.coveragePlots({...data,annual_bins:data.annual_bins.filter(b=>b.year===2026)},labels),gap:D.coveragePlots({...data,annual_bins:data.annual_bins.filter(b=>b.year===1904)},labels),unchanged:JSON.stringify(data)===before}));
"""
        out=json.loads(subprocess.check_output([str(node),'-e',script],cwd=ROOT))
        data=json.loads((ROOT/'system/dist/data/ssn-coverage.json').read_text(encoding='utf-8'))
        self.assertTrue(out['unchanged'])
        layout=out['plots']['layout'];self.assertEqual(layout['height'],360)
        self.assertEqual(layout['fontSize'],30);self.assertEqual(layout['labelFontSize'],32)
        self.assertGreater(layout['bottom']-layout['top'],134)
        by_year={r['year']:r for r in data['annual_bins']};gap_years={r['year'] for r in data['annual_bins'] if not r['all']}
        self.assertEqual(len(gap_years),16)
        def parse(fragment):
            self.assertNotIn('NaN',fragment);self.assertNotIn('Infinity',fragment)
            return ET.fromstring('<svg>'+fragment+'</svg>')
        for key in ['counts','maximum']:
            svg=parse(out['plots'][key]);bands=[e for e in svg.iter('rect') if e.get('class')=='coverage-gap']
            self.assertEqual({int(e.get('data-year')) for e in bands},gap_years)
            for e in bands:
                self.assertEqual(float(e.get('y')),layout['top']);self.assertEqual(float(e.get('height')),layout['bottom']-layout['top'])
                self.assertGreaterEqual(float(e.get('x')),layout['left']);self.assertLessEqual(float(e.get('x'))+float(e.get('width')),layout['right'])
            self.assertTrue(any(e.get('font-size')=='32' and e.text=='UTC year' for e in svg.iter('text')))
        counts=parse(out['plots']['counts'])
        for line in counts.iter('line'):
            if not line.get('data-series'):continue
            a,b=int(line.get('data-from-year')),int(line.get('data-to-year'));key=line.get('data-series')
            self.assertEqual(b-a,1);self.assertNotIn(a,gap_years);self.assertNotIn(b,gap_years)
            expected=layout['bottom']-math.log10(by_year[b][key])/5*(layout['bottom']-layout['top'])
            self.assertAlmostEqual(float(line.get('y2')),expected)
        partial=[e for e in counts.iter('circle') if e.get('data-partial')=='true']
        self.assertEqual(len(partial),4);self.assertEqual({e.get('data-year') for e in partial},{'2026'})
        self.assertTrue(all(e.get('fill')=='#ffffff' for e in partial))
        maximum=parse(out['plots']['maximum']);points=list(maximum.iter('circle'))
        self.assertEqual(len(points),111)
        hollow=[e for e in points if e.get('fill')=='#ffffff'];self.assertEqual(len(hollow),1)
        self.assertIn('2026',hollow[0].find('title').text)
        for kind in ['partial','gap']:
            for key in ['counts','maximum']:parse(out[kind][key])
        self.assertEqual(len([e for e in parse(out['partial']['counts']).iter('circle') if e.get('data-partial')=='true']),4)
        self.assertEqual(len(list(parse(out['gap']['maximum']).iter('circle'))),0)
