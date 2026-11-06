const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const V = require('../system/dist/view-state.js');
const pack = JSON.parse(fs.readFileSync('system/dist/data/events.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('system/dist/data/manifest.json', 'utf8'));
const revisions = JSON.parse(fs.readFileSync('system/dist/data/revisions.json', 'utf8'));
const events = pack.rows.map(row => Object.assign(Object.fromEntries(pack.fields.map((k,i) => [k,row[i]])), {year:Number(row[pack.fields.indexOf('time')].slice(0,4))}));
const options = {magTypes:[...new Set(events.map(e=>e.magType).filter(Boolean)), '__missing__'], originSources:[...new Set(events.map(e=>e.locationSource).filter(Boolean))], events:events.map(e=>e.id), revisions:revisions.events.map(e=>e.id), snapshot:manifest.snapshot_commit};
const checks = [];
function test(name, run) {run();checks.push(name);}
test('audited default count and missing uncertainty count unchanged', () => {
 assert.equal(V.filterEvents(events,V.defaults).length,24994);
 assert.equal(V.filterEvents(events,{...V.defaults,missingOnly:true}).length,17971);
});
test('share URL restores every filter, tab, source, event, revision, map and language', () => {
 const view={filters:{...V.defaults,search:'Oaxaca / México & 2017',yearFrom:2017,yearTo:2022,magMin:5.5,magMax:8.5,magType:'mww',originSource:'us',depthMax:100,missingOnly:true},sort:'mag',lang:'en',tab:'revisions',revision:revisions.events[0].id,event:events[0].id,map:[23.91999,-102.28945,5.25],snapshot:manifest.snapshot_commit};
 const url=V.serialize(view,'https://example.org/project/?ignored=private#fragment');
 const restored=V.parseURL(url,options);assert.deepEqual(restored.invalid,[]);
 assert.deepEqual(restored.view.filters,view.filters);for(const k of ['sort','lang','tab','revision','event','map'])assert.deepEqual(restored.view[k],view[k]);
 assert(!url.includes('ignored'));assert(!url.includes('#fragment'));
});
test('round trip leaves actual selected IDs and order unchanged', () => {
 for(const filters of [V.defaults,{...V.defaults,yearFrom:2017,yearTo:2022,magMin:5.5,magType:'mww'}, {...V.defaults,search:'us2000ahv0'}, {...V.defaults,missingOnly:true,depthMax:70}]) {
  for(const sort of ['recent','oldest','mag']) {
   const url=V.serialize({filters,sort,lang:'es',tab:'catalog',map:null,snapshot:manifest.snapshot_commit},'https://example.org/');
   const parsed=V.parseURL(url,options);assert.deepEqual(parsed.invalid,[]);
   assert.deepEqual(V.filterEvents(events,parsed.view.filters,parsed.view.sort).map(e=>e.id),V.filterEvents(events,filters,sort).map(e=>e.id));
  }
 }
});
test('malformed numeric/filter/map/selection inputs are rejected safely', () => {
 const parsed=V.parseURL('https://example.org/?from=NaN&to=1800&min=Infinity&depth=-101&missing=yes&mt=unknown&src=unknown&c=,0,99&tab=admin&lang=xx&event=%3Cscript%3E&rev=missing&v=9&snapshot=wrong',options);
 assert(parsed.invalid.length>=10);assert.deepEqual(parsed.view.filters,V.defaults);assert.equal(parsed.view.lang,'es');assert.equal(parsed.view.tab,'catalog');assert.equal(parsed.view.map,null);assert.equal(parsed.view.event,'');assert.equal(parsed.view.revision,'');
 for(const c of ['NaN,-100,5','23,-100,Infinity','86,-100,5','23,-211,5','23,-100,1','23,-100,13','23,-100','23,-100,5,0'])assert(V.parseURL('https://example.org/?c='+encodeURIComponent(c),options).invalid.includes('c'));
});
test('blank and inverted bounds are invalid; magnitude type comparison is exact', () => {
 assert.equal(V.validateFilters({...V.defaults,magMin:''}).valid,false);
 assert.equal(V.validateFilters({...V.defaults,yearFrom:2020,yearTo:2017}).valid,false);
 assert.equal(V.validateFilters({...V.defaults,magMin:8,magMax:5}).valid,false);
 const example=[{id:'a',place:'x',year:2017,mag:5,time:'2017',depth:null,magType:'mB',horizontalError:null},{id:'b',place:'x',year:2017,mag:5,time:'2017',depth:70,magType:'mb',horizontalError:0}];
 assert.deepEqual(V.filterEvents(example,{...V.defaults,magType:'mB'}).map(e=>e.id),['a']);
 assert.deepEqual(V.filterEvents(example,{...V.defaults,missingOnly:true}).map(e=>e.id),['a']);
 assert.deepEqual(V.filterEvents(example,{...V.defaults,depthMax:70}).map(e=>e.id),['b']);
});
test('query JSON identifies exact bytes, actual local selection and limits', () => {
 const view={filters:{...V.defaults,search:'us2000ahv0'},sort:'recent',lang:'es',tab:'catalog',map:null,snapshot:manifest.snapshot_commit};
 const rows=V.filterEvents(events,view.filters,view.sort);
 const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
 const hashes={events:hash('system/dist/data/events.json'),manifest:hash('system/dist/data/manifest.json')};
 assert.equal(hashes.events,manifest.derived_asset_sha256);
 const query=V.queryDocument({view,manifest,assetHashes:hashes,rows,pageURL:V.serialize(view,'https://example.org/'),createdUTC:'2026-11-05T00:00:00Z'});
 assert.equal(query.schema,'seismic-local-query/3');assert.equal(query.input.events_sha256,manifest.derived_asset_sha256);assert.equal(query.input.source_files.length,46);
 assert.equal(query.result.row_count,1);assert.deepEqual(query.result.ordered_event_ids,['us2000ahv0']);assert.equal(query.selection.search,'us2000ahv0');
 assert(query.limits.some(x=>x.includes('not an equivalent live ComCat request')));assert(query.predicate_rules.map.includes('do not alter'));

});
test('UNM attribution is a literal two-field OR, with immutable source values', () => {
 const sample=[
  {id:'origin',locationSource:'unm',magSource:'us'},
  {id:'magnitude',locationSource:'us',magSource:'us_unm'},
  {id:'both',locationSource:'us_unm',magSource:'unm'},
  {id:'uppercase',locationSource:'UNM'}, {id:'substring',locationSource:'foo_unm'},
  {id:'space',magSource:'unm '}, {id:'network',net:'unm',place:'UNM'}
 ].map(e=>({year:2010,mag:4,depth:null,horizontalError:null,time:'2010',...e}));
 const unchanged=JSON.stringify(sample);
 assert.deepEqual(V.filterEvents(sample,{...V.defaults,unmOnly:true}).map(e=>e.id),['origin','magnitude','both']);
 assert.equal(JSON.stringify(sample),unchanged);
 assert.equal(V.filterEvents(events,{...V.defaults,unmOnly:true}).length,9858);
 assert.equal(V.validateFilters({...V.defaults,unmOnly:'true'}).valid,false);
});
test('v3 attribution URLs round-trip and v1/v2 cannot activate the new predicate', () => {
 const mx='usgs-mx-historical', na='usgs-na-2020-2025';
 const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
 const opts={...options,catalogs:registry.catalogs,defaultCatalog:na};
 for(const sort of ['recent','oldest','mag']) {
  const filters={...V.defaults,unmOnly:true,yearFrom:1995,yearTo:2015,magMin:4};
  const url=V.serialize({catalog:mx,filters,sort,lang:'es',tab:'catalog'},'https://example.org/');
  assert.equal(new URL(url).searchParams.get('v'),'3');assert.equal(new URL(url).searchParams.get('unmOnly'),'1');
  const restored=V.parseURL(url,opts);assert.deepEqual(restored.invalid,[]);assert.deepEqual(restored.view.filters,filters);
  assert.deepEqual(V.filterEvents(events,restored.view.filters,sort).map(e=>e.id),V.filterEvents(events,filters,sort).map(e=>e.id));
 }
 for(const v of ['1','2']) {
  const restored=V.parseURL(`https://example.org/?v=${v}&catalog=${mx}&unmOnly=1`,opts);
  assert.equal(restored.view.filters.unmOnly,false);assert(restored.invalid.includes('unmOnly'));
 }
 for(const invalid of ['true','yes','2',''])assert(V.parseURL(`https://example.org/?v=3&catalog=${mx}&unmOnly=${invalid}`,opts).invalid.includes('unmOnly'));
 const wrong=V.parseURL(`https://example.org/?v=3&catalog=${na}&unmOnly=1`,opts);
 assert.equal(wrong.view.filters.unmOnly,false);assert(wrong.invalid.includes('unmOnly'));
 assert.throws(()=>V.serialize({catalog:na,filters:{...V.defaults,unmOnly:true},sort:'recent',lang:'es',tab:'catalog'},'https://example.org/'));
});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
