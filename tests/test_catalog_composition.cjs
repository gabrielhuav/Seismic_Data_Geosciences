'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const C = require('../system/dist/catalog-composition.js');
let checks = 0;
function test(name, run) {run();checks++;console.log('PASS ' + name);}
function fixture(id, provider, rows, extra={}) {
  const events = rows.map(row => ({time:'2020-01-01T00:00:00Z',year:2020,latitude:20,longitude:-100,mag:4,depth:null,place:'same place',...row}));
  return {catalog:{id, provider, provider_name:provider, years:[2000,2026], bounds:[[14,-190],[84,-39]],minimum_magnitude:3.5,snapshot:'fixed-'+id,...extra},
    fields:[...new Set(events.flatMap(Object.keys))], events, manifest:{files:[{path:'same.csv',sha256:'raw-'+id}],field_semantics:{status:'literal-'+id}}, hashes:{events:'events-'+id,manifest:'manifest-'+id}};
}
const a = fixture('usgs-a','usgs',[{id:'shared',locationSource:'unm',country_id:'MEX'}, {id:'a-only'}]);
const b = fixture('usgs-b','usgs',[{id:'shared'}, {id:'b-only',longitude:179.5}]);
const s = fixture('ssn-c','ssn',[{id:'shared',raw_status:'verified',status:'verified',raw_depth:'10',depth:10,raw_local_time:'18:00:00'}],{identifier_kind:'derived_row_key',depth_unit:'km'});
const n = fixture('nrcan-d','nrcan',[{id:'shared',raw_depth:'6.0'}],{identifier_kind:'derived_row_key',depth_unit_status:'not_documented_in_source'});
test('qualification resolves cross-catalogue collisions without losing any row', () => {
  const original=JSON.stringify([a,b,s,n]),out=C.combine([a,b,s,n]);
  assert.equal(out.events.length,6);assert.equal(new Set(out.events.map(e=>e.id)).size,6);
  assert.deepEqual(out.events.map(e=>e.id),['usgs-a~shared','usgs-a~a-only','usgs-b~shared','usgs-b~b-only','ssn-c~shared','nrcan-d~shared']);
  for(const event of out.events){assert.equal(event.catalog_id,event._catalog_id);assert.equal(event.source_event_id,event.id.split('~')[1]);}
  assert.equal(JSON.stringify([a,b,s,n]),original);
});
test('only identical USGS IDs across catalogues are flagged; proximity is never a join', () => {
  const out=C.combine([a,b,s,n]);
  assert.deepEqual(out.events.filter(e=>e.shared_event_id).map(e=>e.id),['usgs-a~shared','usgs-b~shared']);
  assert.equal(out.events[0].duplicate_group,'usgs:shared');
  for(const e of out.events.slice(4)){assert.equal(e.shared_event_id,false);assert.equal(e.duplicate_group,null);}
  assert.deepEqual(out.stats,{total_rows:6,usgs_rows:4,usgs_unique_event_ids:3,usgs_shared_event_ids:1,usgs_extra_rows:1});
});
test('heterogeneous fields and per-record units remain explicit and unchanged', () => {
  const out=C.combine([a,s,n]),native=out.events[2],canadian=out.events[3];
  for(const key of C.provenanceFields)assert(out.fields.includes(key));
  assert(out.fields.includes('raw_local_time'));assert.equal(out.events[0].raw_local_time,null);
  assert.equal(native.raw_status,'verified');assert.equal(native.status,'verified');assert.equal(native.depth_unit,'km');
  assert.equal(native.source_identifier_kind,'derived_row_key');assert.equal(native.locationSource,null);
  assert.equal(canadian.depth_unit,null);assert.equal(canadian.raw_depth,'6.0');
  assert.equal(out.events[0].country_id,'MEX');assert.equal(native.country_id,null);
  assert.equal(out.events[0].locationSource,'unm');assert.equal(out.events[0].source_identifier_kind,'source_event_id');
  assert(!JSON.stringify(out).includes('earthquakes/eventpage/'));
});
test('source manifests, hashes, snapshots and ambiguous filenames remain separated', () => {
  const out=C.combine([a,s,n]);assert.deepEqual(out.manifest.files,[]);
  assert.deepEqual(out.inputs.map(p=>p.catalog.id),['usgs-a','ssn-c','nrcan-d']);
  assert.equal(out.inputs[0].manifest.files[0].sha256,'raw-usgs-a');assert.equal(out.inputs[1].manifest.files[0].sha256,'raw-ssn-c');
  assert.equal(out.inputs[1].manifest.field_semantics.status,'literal-ssn-c');
  assert.deepEqual(out.hashes.inputs['ssn-c'],s.hashes);assert.equal(out.events[2].source_snapshot,'fixed-ssn-c');
  out.inputs[0].manifest.files[0].sha256='changed';assert.equal(a.manifest.files[0].sha256,'raw-usgs-a');
});
test('all-catalogue metadata covers constituent ranges without changing coordinates', () => {
  const x=fixture('x','usgs',[{id:'x',longitude:179}],{years:[2020,2025],bounds:[[14,-190],[84,-50]]});
  const y=fixture('y','ssn',[{id:'y'}],{years:[1900,2026],bounds:[[10,-120],[38,-85]],minimum_magnitude:4});
  const out=C.combine([x,y]);assert.equal(out.catalog.id,'all-catalogs');assert.equal(out.catalog.provider,'all');
  assert.deepEqual(out.catalog.years,[1900,2026]);assert.deepEqual(out.catalog.bounds,[[10,-190],[84,-50]]);
  assert.equal(out.catalog.minimum_magnitude,3.5);assert.equal(out.events[0].longitude,179);assert.equal(out.catalog.count_unit,'records');
});
test('empty source rows are valid while malformed compositions fail closed', () => {
  const empty=fixture('empty','ssn',[]);empty.fields=['id','time'];
  assert.equal(C.combine([empty]).events.length,0);assert.equal(C.combine([empty]).stats.usgs_unique_event_ids,0);
  for(const packs of [[],null,[null],[a,a],[fixture('bad~id','usgs',[{id:'ok'}])],[fixture('ok','usgs',[{id:'bad~id'}])],[fixture('dup','usgs',[{id:'x'},{id:'x'}])]])assert.throws(()=>C.combine(packs),/Invalid catalogue composition/);
  const reserved=fixture('reserved','ssn',[{id:'ok',catalog_id:'forged'}]);assert.throws(()=>C.combine([reserved]),/reserved provenance/);
});
test('real fixed packages retain order and all identifiers, hashes and source fields', () => {
  const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
  const packs=registry.catalogs.map(catalog=>{
    const bytes=fs.readFileSync('system/dist/'+catalog.events_url),pack=JSON.parse(bytes);
    const manifestBytes=fs.readFileSync('system/dist/'+catalog.manifest_url),manifest=JSON.parse(manifestBytes);
    const hashes={events:crypto.createHash('sha256').update(bytes).digest('hex'),manifest:crypto.createHash('sha256').update(manifestBytes).digest('hex')};
    assert.equal(hashes.events,catalog.sha256);assert.equal(hashes.manifest,catalog.manifest_sha256);
    return {catalog,fields:pack.fields,manifest,hashes,events:pack.rows.map(row=>Object.fromEntries(pack.fields.map((f,i)=>[f,row[i]])))};
  });
  const out=C.combine(packs),sum=packs.reduce((n,p)=>n+p.events.length,0);assert.equal(out.events.length,sum);assert.equal(sum,287936);
  assert.equal(new Set(out.events.map(e=>e.id)).size,sum);
  let offset=0;
  for(const pack of packs){
    for(let i=0;i<pack.events.length;i++){
      const source=pack.events[i],event=out.events[offset+i];assert.equal(event.source_event_id,source.id);
      for(const f of pack.fields)if(f!=='id')assert.deepEqual(event[f],source[f]);
      assert.equal(event.data_provider,pack.catalog.provider);assert.equal(event._catalog_id,pack.catalog.id);
    }
    assert.deepEqual(out.hashes.inputs[pack.catalog.id],pack.hashes);offset+=pack.events.length;
  }
  const allUsgs=new Set(packs.filter(p=>p.catalog.provider==='usgs').flatMap(p=>p.events.map(e=>e.id)));
  assert.equal(out.stats.usgs_unique_event_ids,allUsgs.size);assert.equal(out.stats.usgs_rows,39035);
  assert.equal(out.stats.usgs_shared_event_ids,39035-allUsgs.size);
  console.log(JSON.stringify({real_stats:out.stats}));
});
console.log(JSON.stringify({passed:checks},null,2));
