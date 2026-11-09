"""Independent arithmetic and row predicates for the country comparison workspace."""
from pathlib import Path
import hashlib,json,shutil,statistics,subprocess,sys,unittest
ROOT=Path(__file__).resolve().parents[1]

class CountryComparisonOracleTests(unittest.TestCase):
    def test_country_counts_statistics_and_zero_bins_match_preserved_rows(self):
        registry=json.loads((ROOT/'system/dist/data/catalogs.json').read_text(encoding='utf-8'));c=next(x for x in registry['catalogs'] if x['id']=='usgs-na-2020-2025')
        raw=(ROOT/'system/dist'/c['events_url']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),c['sha256'])
        package=json.loads(raw);index=json.loads((ROOT/'system/dist/data/country-index.json').read_text(encoding='utf-8'))
        events=[dict(zip(package['fields'],row)) for row in package['rows']]
        for i,event in enumerate(events):event['country_id']=index['catalogs'][c['id']]['country_ids'][i]
        filters=[dict(countryA='CAN',countryB='MEX',yearFrom=2020,yearTo=2025,minMag=4.5,magType='mww'),dict(countryA='USA',countryB='CAN',yearFrom=2022,yearTo=2025,minMag=5.0,magType='mb'),dict(countryA='MEX',countryB='USA',yearFrom=2024,yearTo=2025,minMag=9.0,magType='mww')]
        script="""
const fs=require('node:fs'),C=require('./system/dist/country-comparison.js'),r=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8')),c=r.catalogs.find(x=>x.id==='usgs-na-2020-2025'),p=JSON.parse(fs.readFileSync('system/dist/'+c.events_url,'utf8')),g=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
const events=p.rows.map((v,i)=>({...Object.fromEntries(p.fields.map((k,j)=>[k,v[j]])),country_id:g.catalogs[c.id].country_ids[i]}));const filters=JSON.parse(process.argv[1]);console.log(JSON.stringify(filters.map(f=>C.compute({catalog:c,events,hashes:{events:c.sha256},geographyEvidence:{fixture:true}},f))));
"""
        bundled=Path(sys.executable).parent.parent/'node/bin/node.exe';node=str(bundled) if bundled.exists() else shutil.which('node')
        actual=json.loads(subprocess.check_output([node,'-e',script,json.dumps(filters)],cwd=ROOT,encoding='utf-8'))
        for f,result in zip(filters,actual):
            for country in result['countries']:
                selected=[e for e in events if e['country_id']==country['country_id'] and f['yearFrom']<=int(e['time'][:4])<=f['yearTo'] and e['mag']>=f['minMag'] and e['magType']==f['magType']]
                self.assertEqual(country['ordered_record_ids'],[e['id'] for e in selected]);self.assertEqual(country['record_count'],len(selected))
                mags=[e['mag'] for e in selected];depths=[e['depth'] for e in selected if isinstance(e['depth'],(float,int))]
                for name,expected in [('mean',statistics.mean(mags) if mags else None),('median',statistics.median(mags) if mags else None),('sample_sd',statistics.stdev(mags) if len(mags)>1 else None)]:
                    if expected is None:self.assertIsNone(country['magnitude'][name])
                    else:self.assertAlmostEqual(country['magnitude'][name],expected,places=12)
                self.assertEqual(country['depth_km']['n'],len(depths))
                if depths:self.assertAlmostEqual(country['depth_km']['mean'],statistics.mean(depths),places=12)
                for annual in country['annual_counts']:self.assertEqual(annual['record_count'],sum(int(e['time'][:4])==annual['year'] for e in selected))
