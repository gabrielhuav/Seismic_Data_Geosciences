"""The static PB2002 layer retains source semantics and its separate licence."""
import importlib.util,json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('tectonic',ROOT/'scripts/build_tectonic_assets.py');T=importlib.util.module_from_spec(spec);spec.loader.exec_module(T)

class TectonicAssetTests(unittest.TestCase):
    def test_pinned_overlay_and_licence_are_verified_offline(self):
        report=T.verify();self.assertEqual(report['counts']['total_features'],295);self.assertEqual(report['counts']['unique_plate_codes'],52)
        self.assertEqual(report['license'],'ODC-BY-1.0')

    def test_required_regional_plates_and_unknown_boundary_types_remain_explicit(self):
        data=json.loads(T.TARGET.read_text(encoding='utf-8'))
        plates=[f for f in data['features'] if f['properties']['kind']=='plate'];boundaries=[f for f in data['features'] if f['properties']['kind']=='boundary']
        self.assertEqual(len(plates),54);self.assertEqual(len(boundaries),241)
        codes={f['properties']['plate_code']:f['properties']['plate_name'] for f in plates}
        for code,name in {'PA':'Pacific','NA':'North America','CO':'Cocos','RI':'Rivera','CA':'Caribbean','JF':'Juan de Fuca','NZ':'Nazca'}.items():self.assertEqual(codes[code],name)
        self.assertEqual(sum(f['properties']['boundary_type'] is None for f in boundaries),176)
        self.assertEqual(sum(f['properties']['boundary_type']=='subduction' for f in boundaries),65)
        for f in boundaries:self.assertEqual(f['properties']['boundary_type'],f['properties']['Type'] or None)
        self.assertEqual(len({f['id'] for f in data['features']}),295)
        for f in plates:self.assertEqual(f['properties']['Code'],f['properties']['plate_code'])
