"""Compare browser SQLite results to independent Python queries and statistics."""
from pathlib import Path
import hashlib,json,shutil,sqlite3,statistics,subprocess,sys,unittest

ROOT=Path(__file__).resolve().parents[1]

class BrowserSQLTests(unittest.TestCase):
    def test_vendor_bytes_match_preserved_official_package_receipt(self):
        target=ROOT/'system/dist/vendor/sqljs'
        receipt=json.loads((target/'provenance.json').read_text(encoding='utf-8'))
        self.assertEqual(receipt['version'],'1.13.0')
        for path,entry in receipt['files'].items():
            data=(target/path).read_bytes();self.assertEqual(len(data),entry['bytes']);self.assertEqual(hashlib.sha256(data).hexdigest(),entry['sha256'])

    def test_sql_rows_summaries_and_catalogue_joins_match_independent_oracle(self):
        registry=json.loads((ROOT/'system/dist/data/catalogs.json').read_text(encoding='utf-8'))
        countries=json.loads((ROOT/'system/dist/data/country-index.json').read_text(encoding='utf-8'))
        rows=[];conn=sqlite3.connect(':memory:');conn.execute('CREATE TABLE records(catalogue_id,year,mag,mag_type,depth_km,country_id)')
        for c in registry['catalogs']:
            raw=(ROOT/'system/dist'/c['events_url']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),c['sha256'])
            package=json.loads(raw);fields=package['fields'];col={name:i for i,name in enumerate(fields)}
            for i,row in enumerate(package['rows']):
                year=int(row[col['time']][:4]);mag=row[col['mag']];kind=row[col['magType']] if 'magType' in col else None
                country=countries['catalogs'][c['id']]['country_ids'][i]
                depth=None if c['provider']=='nrcan' else row[col['depth']]
                conn.execute('INSERT INTO records VALUES(?,?,?,?,?,?)',(c['id'],year,mag,kind,depth,country))
                if c['id']=='usgs-na-2020-2025' and 2020<=year<=2025 and mag>=4.5 and kind=='mww':rows.append((mag,depth))
        self.assertEqual(len(rows),659)
        expected=[list(r) for r in conn.execute('SELECT catalogue_id,COUNT(*) FROM records GROUP BY catalogue_id ORDER BY catalogue_id')]
        mean=statistics.mean(m for m,d in rows);sd=statistics.stdev(m for m,d in rows)
        # JavaScript imports verified packaged rows independently, including their order.
        script=r"""
const fs=require('node:fs'),Q=require('./system/dist/sql-explorer.js');
const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
const geo=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
const records=[];for(const c of registry.catalogs){const p=JSON.parse(fs.readFileSync('system/dist/'+c.events_url,'utf8'));for(let i=0;i<p.rows.length;i++){const r=Object.fromEntries(p.fields.map((k,j)=>[k,p.rows[i][j]]));records.push({record_key:c.id+'~'+r.id,event_id:r.id,catalogue_id:c.id,year:Number(r.time.slice(0,4)),time:r.time,mag:r.mag,mag_type:r.magType??null,depth_km:c.provider==='nrcan'?null:r.depth,country_id:geo.catalogs[c.id].country_ids[i]});}}
require('./system/dist/vendor/sqljs/sql-wasm.js')({wasmBinary:fs.readFileSync('system/dist/vendor/sqljs/sql-wasm.wasm')}).then(async SQL=>{const h=await Q.createDatabase(SQL,{records,catalogs:registry.catalogs,key:'oracle'});const sql=s=>Q.execute(h.db,s).rows;
const scope="catalogue_id='usgs-na-2020-2025' AND year BETWEEN 2020 AND 2025 AND mag>=4.5 AND mag_type='mww'";
const output={counts:sql('SELECT catalogue_id,COUNT(*) FROM records GROUP BY catalogue_id ORDER BY catalogue_id'),summary:sql('SELECT COUNT(*),AVG(mag),SQRT((SUM(mag*mag)-SUM(mag)*SUM(mag)/COUNT(*))/(COUNT(*)-1)),AVG(depth_km) FROM records WHERE '+scope),countries:sql("SELECT catalogue_id,country_id,COUNT(*) FROM records WHERE (catalogue_id='usgs-na-2020-2025' AND country_id='USA') OR (catalogue_id='nrcan-ca-historical' AND country_id='CAN') GROUP BY catalogue_id,country_id ORDER BY catalogue_id"),ssn:sql("SELECT COUNT(*) FROM records WHERE catalogue_id='ssn-mx-historical' AND year=2026 AND mag>=4.5"),combined:sql('SELECT COUNT(*) FROM records WHERE year BETWEEN 2010 AND 2025 AND mag>=4.5'),join:sql('SELECT COUNT(*) FROM records r JOIN catalogs c USING(catalogue_id)'),first:sql('SELECT row_no,record_key FROM records ORDER BY row_no LIMIT 2')};h.db.close();console.log(JSON.stringify(output));});
"""
        bundled=Path(sys.executable).parent.parent/'node/bin/node.exe';node=str(bundled) if bundled.exists() else shutil.which('node')
        run=subprocess.run([node,'-e',script],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
        actual=json.loads(run.stdout);self.assertEqual(actual['counts'],expected)
        self.assertEqual(actual['summary'][0][0],659);self.assertAlmostEqual(actual['summary'][0][1],mean,places=12);self.assertAlmostEqual(actual['summary'][0][2],sd,places=11)
        self.assertAlmostEqual(actual['summary'][0][3],statistics.mean(d for m,d in rows),places=11)
        self.assertEqual(actual['countries'],[['nrcan-ca-historical','CAN',1492],['usgs-na-2020-2025','USA',2335]])
        self.assertEqual(actual['ssn'],[[204]]);self.assertEqual(actual['combined'],[[7107]]);self.assertEqual(actual['join'],[[287936]])
        self.assertEqual(actual['first'][0][0],1);self.assertEqual(actual['first'][1][0],2)
        conn.close()
