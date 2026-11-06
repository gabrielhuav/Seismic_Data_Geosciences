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
test('native SSN URLs and query metadata retain source clocks, raw fields and status vocabulary', () => {
 const catalog={id:'ssn-mx-historical',provider:'ssn',provider_name:'SSN / UNAM',identifier_kind:'derived_row_key',depth_unit:'km',years:[1900,2026],minimum_magnitude:3.5,snapshot:'sha256:raw-fixture',provider_url:'http://www2.ssn.unam.mx:8080/catalogo/'};
 const row={id:'ssn-row-42',source_record:42,time:'2026-11-06T00:31:00Z',year:2026,place:'Oaxaca',mag:4,magType:null,depth:10,locationSource:null,magSource:null,event_type:null,status:'verified',updated:null,horizontalError:null,
   raw_utc_date:'2026-11-06',raw_utc_time:'00:31:00',raw_local_date:'2026-11-05',raw_local_time:'18:31:00',raw_magnitude:'4.0',raw_depth:'10',raw_status:'verified'};
 const manifest={files:[{path:'ssn.csv',url:catalog.provider_url,url_kind:'catalogue_landing',sha256:'raw-fixture'}],identifier_kind:'derived_row_key',depth_unit:'km',
   official_catalogue:{institution:'SSN / UNAM',url:catalog.provider_url},source_header:['fixture header'],query:{start_utc:'1900-01-01T00:00:00Z',end_exclusive_utc:'2026-11-07T00:00:00Z',time_basis:'UTC'},
   time_basis:{native_utc_columns:['Fecha UTC','Hora UTC'],raw_local_columns:['Fecha local','Hora local'],no_local_offset_imputed:true},source_timing:{observed_download_file_mtime_utc:'2026-11-06T21:03:16Z',evidence_kind:'filesystem_metadata'},selection:{minimum_magnitude:3.5},transformations:['fixture row key'],field_availability:{magType:false,updated:false}};
 const unchanged=JSON.stringify({manifest,row}),view={catalog:catalog.id,filters:V.catalogDefaults(catalog),lang:'en',tab:'catalog',sort:'recent',base:'nasa-blue-marble',event:row.id};
 const opts={catalogs:[catalog],catalog,events:[row.id],defaultCatalog:V.defaultCatalog};
 const url=V.serialize(view,'https://example.org/'),restored=V.parseURL(url,opts);assert.deepEqual(restored.invalid,[]);assert.equal(restored.view.catalog,catalog.id);assert.equal(restored.view.event,row.id);assert.equal(restored.view.base,'nasa-blue-marble');
 assert.equal(V.parseURL('https://example.org/?v=2&catalog='+catalog.id,opts).view.catalog,catalog.id);
 assert.equal(V.parseURL('https://example.org/?v=1&catalog='+catalog.id,opts).view.catalog,V.legacyCatalog);
 assert(V.parseURL('https://example.org/?v=3&catalog='+catalog.id+'&unmOnly=1',opts).invalid.includes('unmOnly'));
 const query=V.queryDocument({view,catalog,manifest,assetHashes:{events:'events-fixture',manifest:'manifest-fixture',registry:'registry-fixture'},rows:[row],pageURL:url});
 assert.equal(query.catalog.provider,'ssn');assert.equal(query.input.identifier_kind,'derived_row_key');assert.equal(query.input.depth_unit,'km');assert.equal(query.input.packaged_event_type,null);
 for(const key of ['official_catalogue','source_header','query','time_basis','source_timing','selection','transformations','field_availability'])assert.deepEqual(query.input[key],manifest[key]);
 assert.equal(query.input.raw_fields.length,7);assert.equal(Object.hasOwn(query.input,'acquired_utc'),false);assert.equal(query.selection.unmOnly,false);
 const empty=V.queryDocument({view,catalog,manifest,fields:Object.keys(row),assetHashes:{},rows:[],pageURL:url});assert.equal(empty.result.row_count,0);assert.deepEqual(empty.input.raw_fields,query.input.raw_fields);
 assert(query.limits.some(limit=>limit.includes('verified is not converted')));assert(query.limits.some(limit=>limit.includes('Coverage does not establish completeness')));
 assert.equal(JSON.stringify({manifest,row}),unchanged);assert.equal(V.filterEvents([row],view.filters).length,1);assert.equal(V.filterEvents([row],{...view.filters,magType:'__missing__'}).length,1);
});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
