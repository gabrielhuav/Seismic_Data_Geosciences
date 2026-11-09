"""Subdivision membership is conditional on the unchanged country classification."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest
from scripts import build_admin1_index as admin1

ROOT=Path(__file__).resolve().parents[1]

def ring(w=0,s=0,e=10,n=10):
    return [[w,s],[e,s],[e,n],[w,n],[w,s]]

def feature(identifier,country_id,coordinates,kind='Polygon'):
    return {'type':'Feature','properties':{'admin1_id':identifier,'country_id':country_id,
             'label_en':identifier,'label_es':identifier,'bounds':[[0,0],[10,10]],
             'source_admin1_code':identifier,'source_iso_3166_2':None,'source_type':'State'},
             'geometry':{'type':kind,'coordinates':coordinates}}

class Admin1GeometryTests(unittest.TestCase):
    def test_country_guard_holes_edges_overlap_and_absence_remain_explicit(self):
        geometry={'type':'FeatureCollection','features':[
            feature('AAA-1','AAA',[ring(),ring(3,3,7,7)]),
            feature('BBB-1','BBB',[ring()])]}
        index=admin1.Admin1Index(geometry)
        self.assertEqual(index.classify(2,2,'AAA'),'AAA-1')
        self.assertEqual(index.classify(2,2,'BBB'),'BBB-1')
        self.assertEqual(index.classify(5,5,'AAA'),'admin1-outside')
        self.assertEqual(index.classify(3,5,'AAA'),'admin1-boundary')
        self.assertEqual(index.classify(0,0,'AAA'),'admin1-boundary')
        self.assertEqual(index.classify(2,2,'CCC'),'admin1-unavailable')
        self.assertEqual(index.classify(2,2,'outside'),'admin1-outside')
        self.assertEqual(index.classify(2,2,'boundary'),'admin1-boundary')
        self.assertEqual(index.classify(2,2,'invalid'),'admin1-invalid')
        self.assertEqual(index.classify(None,2,'AAA'),'admin1-invalid')
        geometry['features'].append(feature('AAA-2','AAA',[ring(1,1,2.5,2.5)]))
        self.assertEqual(admin1.Admin1Index(geometry).classify(2,2,'AAA'),'admin1-boundary')

    def test_simplification_preserves_islands_holes_and_antimeridian_bounds(self):
        geometry={'type':'MultiPolygon','coordinates':[[ring(),ring(3,3,7,7)],
                  [ring(20,20,20.000002,20.000002)],
                  [[[179,1],[-179,1],[-179,2],[179,2],[179,1]]]]}
        old=deepcopy(geometry);simple=admin1.simplify_geometry(geometry)
        self.assertEqual(geometry,old)
        self.assertEqual([len(poly) for poly in simple['coordinates']],[2,1,1])
        self.assertEqual(simple['coordinates'][0],geometry['coordinates'][0])
        for poly in simple['coordinates']:
            for r in poly:
                self.assertEqual(r[0],r[-1]);self.assertGreaterEqual(len(set(map(tuple,r[:-1]))),3)
        crossing={'type':'Polygon','coordinates':geometry['coordinates'][2]}
        bounds=admin1.geometry_bounds(crossing)
        self.assertLess(bounds[1][1]-bounds[0][1],3)

    def test_row_alignment_never_guesses_from_names_or_nearest_country(self):
        index=admin1.Admin1Index({'type':'FeatureCollection','features':[feature('AAA-1','AAA',[ring()])]})
        pack={'fields':['id','longitude','latitude','place'],'rows':[['x',2,2,'AAA'],['y',2,2,'BBB'],['z',20,20,'AAA']]}
        original=deepcopy(pack)
        ids,counts,by_country=admin1.classify_package(pack,['AAA','BBB','AAA'],index)
        self.assertEqual(ids,['AAA-1','admin1-unavailable','admin1-outside'])
        self.assertEqual(sum(counts.values()),3);self.assertEqual(by_country['BBB'],{'admin1-unavailable':1})
        self.assertEqual(pack,original)
        with self.assertRaisesRegex(ValueError,'align'):admin1.classify_package(pack,['AAA'],index)

class PackagedAdmin1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geometry=json.loads((ROOT/'system/dist/data/admin1.geojson').read_text(encoding='utf-8'))
        cls.package=json.loads((ROOT/'system/dist/data/admin1-index.json').read_text(encoding='utf-8'))
        cls.manifest=json.loads((ROOT/'system/dist/data/admin1-manifest.json').read_text(encoding='utf-8'))
        cls.index=admin1.Admin1Index(cls.geometry)

    def test_known_subdivision_locations_and_unmodified_country_evidence(self):
        for lon,lat,country_id,expected in [(-99.1332,19.4326,'MEX','MEX-2727'),
                (-118.2437,34.0522,'USA','USA-3521'),(-79.3832,43.6532,'CAN','CAN-682')]:
            with self.subTest(expected=expected):self.assertEqual(self.index.classify(lon,lat,country_id),expected)
        self.assertEqual(self.index.classify(-79.3832,43.6532,'MEX'),'admin1-outside')
        current=(ROOT/'system/dist/data/country-index.json').read_bytes()
        self.assertEqual(hashlib.sha256(current).hexdigest(),admin1.COUNTRY_SHA256)
        self.assertEqual(self.package['country_index_sha256'],admin1.COUNTRY_SHA256)

    def test_all_catalogue_rows_and_counts_are_bound_to_original_hashes_and_countries(self):
        countries=json.loads((ROOT/'system/dist/data/country-index.json').read_text(encoding='utf-8'))
        registry=json.loads((ROOT/'system/dist/data/catalogs.json').read_text(encoding='utf-8'))
        regions={r['id']:r for r in self.package['regions']};specials={r['id'] for r in self.package['special_regions']}
        self.assertEqual(len(regions),743)
        self.assertEqual({r['country_id'] for r in regions.values()}, {r['id'] for r in countries['regions']}-{'outside','boundary','invalid'})
        for catalog in registry['catalogs']:
            raw=(ROOT/'system/dist'/catalog['events_url']).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),catalog['sha256'])
            row=self.package['catalogs'][catalog['id']];old=countries['catalogs'][catalog['id']]
            self.assertEqual(row['events_sha256'],old['events_sha256'])
            self.assertEqual(len(row['admin1_ids']),row['row_count']);self.assertEqual(row['row_count'],old['row_count'])
            self.assertEqual(sum(row['counts'].values()),row['row_count'])
            for country_id,identifier in zip(old['country_ids'],row['admin1_ids']):
                if identifier not in specials:self.assertEqual(regions[identifier]['country_id'],country_id)
                if country_id=='outside':self.assertEqual(identifier,'admin1-outside')
            for country_id,counts in row['country_counts'].items():
                self.assertEqual(sum(counts.values()),old['counts'][country_id])

    def test_manifest_geometry_identity_labels_and_private_source_binding(self):
        for asset in self.manifest['assets']:
            raw=(ROOT/'system/dist'/asset['path']).read_bytes()
            self.assertEqual(len(raw),asset['bytes']);self.assertEqual(hashlib.sha256(raw).hexdigest(),asset['sha256'])
        self.assertEqual(self.manifest['source']['sha256'],admin1.SOURCE_SHA256)
        self.assertEqual(self.manifest['source']['license'],'Public domain')
        self.assertEqual(self.manifest['country_feature_counts']['USA'],51)
        self.assertEqual(self.manifest['country_feature_counts']['CAN'],13)
        self.assertEqual(self.manifest['country_feature_counts']['MEX'],33)
        cdmx=next(f['properties'] for f in self.geometry['features'] if f['properties']['admin1_id']=='MEX-2727')
        self.assertIn('Ciudad de México',cdmx['label_es']);self.assertEqual(cdmx['source_name'],'Distrito Federal')
        self.assertEqual(len({f['properties']['admin1_id'] for f in self.geometry['features']}),743)

if __name__=='__main__':unittest.main()
