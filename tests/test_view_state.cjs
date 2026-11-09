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
 assert(parsed.invalid.length>=10);assert.deepEqual(parsed.view.filters,V.defaults);assert.equal(parsed.view.lang,'en');assert.equal(parsed.view.tab,'catalog');assert.equal(parsed.view.map,null);assert.equal(parsed.view.event,'');assert.equal(parsed.view.revision,'');
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
test('v4 country views restore exact land/special labels while preserving legacy selections', () => {
 const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
 const index=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
 const c=registry.catalogs.find(c=>c.id==='ssn-mx-historical');
 const geographyHash='a'.repeat(64);
 const opts={catalogs:registry.catalogs,defaultCatalog:registry.default_catalog_id,catalog:c,countries:index.regions.map(r=>r.id),snapshot:c.snapshot,geographyHash};
 for(const country of ['MEX','USA','CAN','outside','boundary','invalid']) {
  const view={catalog:c.id,filters:{...V.catalogDefaults(c),country},sort:'oldest',lang:'es',tab:'catalog',snapshot:c.snapshot,base:'nasa-blue-marble',geography:geographyHash};
  const url=V.serialize(view,'https://example.org/');assert.equal(new URL(url).searchParams.get('v'),'4');
  assert.equal(new URL(url).searchParams.get('geo'),geographyHash);
  const parsed=V.parseURL(url,opts);assert.deepEqual(parsed.invalid,[]);assert.deepEqual(parsed.view.filters,view.filters);
  assert.equal(parsed.view.base,'nasa-blue-marble');assert.equal(parsed.view.catalog,c.id);
  const stale=new URL(url);stale.searchParams.set('geo','b'.repeat(64));
  const mismatch=V.parseURL(stale.href,opts);assert(mismatch.invalid.includes('geo'));assert.equal(mismatch.view.filters.country,country);
 }
 for(const version of ['1','2','3']) {
  const params=`?v=${version}&catalog=usgs-mx-historical&from=2017&to=2017&country=MEX`;
  const parsed=V.parseURL('https://example.org/'+params,{...opts,catalog:registry.catalogs.find(c=>c.id===V.legacyCatalog),snapshot:manifest.snapshot_commit});
  assert(parsed.invalid.includes('country'));assert.equal(parsed.view.catalog,V.legacyCatalog);
  assert.equal(parsed.view.filters.country,'');assert.equal(parsed.view.filters.yearFrom,2017);
  assert.deepEqual(V.filterEvents(events,parsed.view.filters).map(e=>e.id),V.filterEvents(events,{...V.defaults,yearFrom:2017,yearTo:2017}).map(e=>e.id));
 }
 const noCountry=V.serialize({catalog:c.id,filters:V.catalogDefaults(c),sort:'recent',lang:'en',tab:'catalog'},'https://example.org/');
 assert.equal(new URL(noCountry).searchParams.get('v'),'3');
});
test('country filters use only explicit index labels, including outside/boundary, never place or provider', () => {
 const fixture=[
  {id:'usgs-mexico',country_id:'MEX',data_provider:'usgs',place:'USA'},
  {id:'ssn-outside',country_id:'outside',data_provider:'ssn',place:'México'},
  {id:'nrcan-usa',country_id:'USA',data_provider:'nrcan',place:'Canada'},
  {id:'border',country_id:'boundary',data_provider:'ssn',place:'Mexico'},
  {id:'unclassified',country_id:'invalid',data_provider:'usgs',place:'Canada'}
 ].map(e=>({year:2020,mag:4,depth:null,horizontalError:null,time:'2020-01-01T00:00:00Z',...e}));
 const unchanged=JSON.stringify(fixture);
 for(const [country,id] of [['MEX','usgs-mexico'],['USA','nrcan-usa'],['outside','ssn-outside'],['boundary','border'],['invalid','unclassified']]) {
  assert.deepEqual(V.filterEvents(fixture,{...V.defaults,country}).map(e=>e.id),[id]);
 }
 assert.equal(V.filterEvents(fixture,V.defaults).length,5);assert.equal(V.filterEvents(fixture,{...V.defaults,country:'CAN'}).length,0);
 assert.equal(JSON.stringify(fixture),unchanged);
});
test('v4 combined keys and country predicates round-trip; malformed labels and unsupported combined URLs fail safely', () => {
 const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
 const opts={catalogs:registry.catalogs,defaultCatalog:registry.default_catalog_id,countries:['MEX','USA','CAN','outside','boundary','invalid'],events:['usgs-a~same-id','ssn-a~same-id'],snapshot:'compound-fixture',geographyHash:'c'.repeat(64)};
 const view={catalog:'all-catalogs',filters:{...V.defaults,country:'CAN',yearFrom:2000,yearTo:2025,magMin:4,depthMax:70},sort:'mag',lang:'en',tab:'catalog',event:'ssn-a~same-id',snapshot:'compound-fixture',map:[60,-120,3],geography:opts.geographyHash};
 const url=V.serialize(view,'https://example.org/'),parsed=V.parseURL(url,opts);
 assert.equal(new URL(url).searchParams.get('v'),'4');assert.equal(new URL(url).searchParams.get('geo'),opts.geographyHash);assert.deepEqual(parsed.invalid,[]);
 assert.deepEqual(parsed.view.filters,view.filters);assert.equal(parsed.view.catalog,'all-catalogs');assert.equal(parsed.view.event,view.event);
 const all=V.serialize({...view,filters:V.defaults},'https://example.org/');assert.equal(new URL(all).searchParams.get('v'),'4');
 for(const country of ['MEx','unknown','<svg>','MEX/USA','USA~CAN','x'.repeat(81)]) {
  const bad=V.parseURL('https://example.org/?v=4&catalog=all-catalogs&country='+encodeURIComponent(country),opts);
  assert(bad.invalid.includes('country'));assert.equal(bad.view.filters.country,'');
 }
 for(const version of ['2','3']) {
  const bad=V.parseURL(`https://example.org/?v=${version}&catalog=all-catalogs`,opts);
  assert(bad.invalid.includes('catalog'));assert.equal(bad.view.catalog,registry.default_catalog_id);
 }
 assert(V.parseURL('https://example.org/?v=4&catalog=all-catalogs&event=unregistered~same-id',opts).invalid.includes('event'));
 assert(V.parseURL('https://example.org/?v=4&catalog=all-catalogs&event=%3Cscript%3E',opts).invalid.includes('event'));
 const unm=V.parseURL('https://example.org/?v=4&catalog=all-catalogs&unmOnly=1',opts);
 assert(unm.invalid.includes('unmOnly'));assert.equal(unm.view.filters.unmOnly,false);
 assert.throws(()=>V.serialize({...view,filters:{...view.filters,unmOnly:true}},'https://example.org/'));
});
test('v4 combined query preserves each source evidence and selected composite order without deduplication', () => {
 const C=require('../system/dist/catalog-composition.js');
 const make=(id,provider,row,extra={})=>{
  const event={id:'shared-id',year:2020,time:'2020-01-01T00:00:00Z',latitude:20,longitude:-100,depth:null,mag:4,magType:null,horizontalError:null,country_id:'MEX',...row};
  return {catalog:{id,provider,provider_name:provider,years:[2000,2025],bounds:[[10,-190],[84,-40]],minimum_magnitude:3.5,snapshot:'snapshot-'+id,...extra},
   fields:Object.keys(event),events:[event],hashes:{events:'events-'+id,manifest:'manifest-'+id},
   manifest:{files:[{path:'same.csv',sha256:'raw-'+id}],field_semantics:{status:'literal-'+provider},rights:{notice:'source-specific-'+provider},
    time_basis:{rule:'source-clock-'+id},selection:{minimum_magnitude:3.5},identifier_kind:extra.identifier_kind}};
 };
 const packs=[make('usgs-a','usgs',{depth:10}),make('usgs-b','usgs',{depth:11}),
  make('ssn-a','ssn',{raw_local_time:'18:00:00',status:'verificado'},{identifier_kind:'derived_row_key',depth_unit:'km'}),
  make('nrcan-a','nrcan',{raw_depth:'6.0',country_id:'CAN'},{identifier_kind:'derived_row_key',depth_unit_status:'not_documented_in_source'})];
 const combined=C.combine(packs),view={catalog:'all-catalogs',filters:{...V.defaults,country:'MEX'},sort:'recent',lang:'en',tab:'catalog'};
 const rows=V.filterEvents(combined.events,view.filters,view.sort),geography={index_sha256:'index-fixture',geometry_sha256:'geometry-fixture',selected_country:'MEX'};
 const query=V.queryDocument({view,catalog:combined.catalog,manifest:combined.manifest,assetHashes:{...combined.hashes,registry:'registry-fixture'},fields:combined.fields,inputs:packs,geography,rows,pageURL:'https://example.org/?v=4',createdUTC:'2026-11-06T00:00:00Z'});
 assert.equal(query.schema,'seismic-local-query/4');assert.equal(query.catalog.provider,'all');assert.equal(query.registry_sha256,'registry-fixture');
 assert.deepEqual(query.geography,geography);assert.equal(query.inputs.length,4);assert.equal(query.input_catalogs.length,4);
 assert.equal(query.result.row_count,3);assert.deepEqual(query.result.ordered_event_ids,['usgs-a~shared-id','usgs-b~shared-id','ssn-a~shared-id']);
 assert.deepEqual(query.result.ordered_source_keys,[{catalog:'usgs-a',id:'shared-id'},{catalog:'usgs-b',id:'shared-id'},{catalog:'ssn-a',id:'shared-id'}]);
 for(let i=0;i<packs.length;i++) {
  assert.equal(query.inputs[i].events_sha256,packs[i].hashes.events);assert.equal(query.inputs[i].manifest_sha256,packs[i].hashes.manifest);
  assert.equal(query.inputs[i].registry_sha256,'registry-fixture');assert.deepEqual(query.inputs[i].source_files,packs[i].manifest.files);
  assert.deepEqual(query.inputs[i].field_semantics,packs[i].manifest.field_semantics);assert.deepEqual(query.inputs[i].time_basis,packs[i].manifest.time_basis);
  assert.deepEqual(query.inputs[i].rights,packs[i].manifest.rights);
  assert.equal(query.input_catalogs[i].id,packs[i].catalog.id);assert.equal(query.input_catalogs[i].snapshot,packs[i].catalog.snapshot);
 }
 assert.equal(query.inputs[2].identifier_kind,'derived_row_key');assert.equal(query.inputs[2].depth_unit,'km');assert.deepEqual(query.inputs[2].raw_fields,['raw_local_time']);
 assert.equal(query.inputs[3].depth_unit,null);assert.equal(query.inputs[3].packaged_event_type,null);
 assert(query.predicate_rules.composition.includes('no cross-provider'));assert(query.limits.some(s=>s.includes('not unique or independent')));
 assert.throws(()=>V.queryDocument({view,catalog:combined.catalog,manifest:combined.manifest,assetHashes:{},rows:[],pageURL:'https://example.org/'}),/require all source/);
 const single=V.queryDocument({view:{...view,catalog:packs[2].catalog.id},...packs[2],assetHashes:packs[2].hashes,rows:packs[2].events,geography,pageURL:'https://example.org/?v=4'});
 assert.equal(single.schema,'seismic-local-query/4');assert.deepEqual(single.geography,geography);
 assert.equal(single.input.events_sha256,'events-ssn-a');assert.equal(single.result.row_count,1);
});
test('research workflow tabs restore through existing URL protocols without changing queries',()=>{
 assert.equal(V.parseURL('https://example.org/').view.tab,'home');
 for(const version of ['1','2','3','4'])assert.equal(V.parseURL('https://example.org/?v='+version).view.tab,'catalog');
 for(const tab of ['home','sources','analysis']){
  const view={catalog:'usgs-na-2020-2025',filters:{...V.defaults,yearFrom:2020,yearTo:2025,magMin:4.5},lang:'en',sort:'recent',tab};
  const parsed=V.parseURL(V.serialize(view,'https://example.org/'));
  assert.equal(parsed.view.tab,tab);assert.deepEqual(parsed.view.filters,view.filters);
 }
});
test('v5 subdivision views bind country, admin-1 and hashes while v1-v4 remain intact',()=>{
 const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
 const geography=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
 const admin=JSON.parse(fs.readFileSync('system/dist/data/admin1-index.json','utf8'));
 const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
 const geoHash=hash('system/dist/data/country-index.json'),admHash=hash('system/dist/data/admin1-index.json');
 const c=registry.catalogs.find(c=>c.id==='ssn-mx-historical');
 const opts={catalogs:registry.catalogs,defaultCatalog:registry.default_catalog_id,catalog:c,countries:geography.regions.map(r=>r.id),admin1Regions:admin.regions,admin1Hash:admHash,geographyHash:geoHash,snapshot:c.snapshot};
 const view={catalog:c.id,filters:{...V.catalogDefaults(c),country:'MEX',admin1:'MEX-2727',yearFrom:2000,magMin:4},sort:'mag',lang:'en',tab:'comparison',geography:geoHash,admin1Geography:admHash,snapshot:c.snapshot};
 const url=V.serialize(view,'https://example.org/'),params=new URL(url).searchParams;
 assert.equal(params.get('v'),'5');assert.equal(params.get('adm'),'MEX-2727');assert.equal(params.get('adh'),admHash);assert.equal(params.get('geo'),geoHash);
 const parsed=V.parseURL(url,opts);assert.deepEqual(parsed.invalid,[]);assert.deepEqual(parsed.view.filters,view.filters);assert.equal(parsed.view.tab,'comparison');
 for(const catalog of ['all-catalogs',V.legacyCatalog]){
  const altered={...view,catalog,snapshot:undefined,filters:{...view.filters,unmOnly:catalog===V.legacyCatalog}};
  const restored=V.parseURL(V.serialize(altered,'https://example.org/'),{...opts,snapshot:undefined});
  assert.deepEqual(restored.invalid,[]);assert.equal(restored.view.catalog,catalog);assert.deepEqual(restored.view.filters,altered.filters);
 }
 for(const tab of ['sql','comparison']){
  const v={...view,tab,filters:{...view.filters,admin1:''}};const shared=V.serialize(v,'https://example.org/');
  assert.equal(new URL(shared).searchParams.get('v'),'4');assert.equal(new URL(shared).searchParams.has('adh'),false);assert.equal(V.parseURL(shared,opts).view.tab,tab);
 }
 assert.throws(()=>V.serialize({...view,admin1Geography:undefined},'https://example.org/'),/index hashes/);
 assert.throws(()=>V.serialize({...view,geography:undefined},'https://example.org/'),/index hashes/);
});

test('v5 rejects tampered subdivision IDs, mismatched countries and missing or stale hash evidence',()=>{
 const admin1Hash='a'.repeat(64),geographyHash='b'.repeat(64);
 const opts={catalogs:[{id:'ssn-mx-historical',years:[1900,2026]}],countries:['MEX','USA','CAN','outside','boundary','invalid'],admin1Regions:[{id:'MEX-2727',country_id:'MEX'},{id:'USA-3521',country_id:'USA'}],admin1Hash,geographyHash};
 const base=new URL(`https://example.org/?v=5&catalog=ssn-mx-historical&country=MEX&adm=MEX-2727&adh=${admin1Hash}&geo=${geographyHash}&from=2020&to=2025&min=4.5`);
 for(const [key,value,error] of [['adh',undefined,'adh'],['adh','c'.repeat(64),'adh'],['adh','bad','adh'],['geo',undefined,'geo'],['geo','c'.repeat(64),'geo'],['adm','unknown','admin1'],['adm','<svg>','admin1'],['adm','MEX/USA','admin1'],['adm','USA-3521','admin1']]){
  const url=new URL(base);if(value===undefined)url.searchParams.delete(key);else url.searchParams.set(key,value);
  const parsed=V.parseURL(url.href,opts);assert(parsed.invalid.includes(error),key+':'+value);assert.equal(parsed.view.filters.admin1,'');assert.equal(parsed.view.filters.country,'MEX');assert.equal(parsed.view.filters.yearFrom,2020);
 }
 for(const country of ['','USA','outside','boundary','invalid']){
  const url=new URL(base);url.searchParams.set('country',country);const parsed=V.parseURL(url.href,opts);
  assert(parsed.invalid.includes('admin1'));assert.equal(parsed.view.filters.admin1,'');
 }
 for(const special of ['admin1-outside','admin1-boundary','admin1-invalid','admin1-unavailable']){
  const url=new URL(base);url.searchParams.set('adm',special);const parsed=V.parseURL(url.href,opts);
  assert.deepEqual(parsed.invalid,[]);assert.equal(parsed.view.filters.admin1,special);
 }
 for(const version of ['1','2','3','4']){
  const url=new URL(base);url.searchParams.set('v',version);const parsed=V.parseURL(url.href,opts);
  assert(parsed.invalid.includes('adm'));assert(parsed.invalid.includes('adh'));assert.equal(parsed.view.filters.admin1,'');
 }
 const missing=new URL(base);missing.searchParams.delete('adm');assert(V.parseURL(missing.href,opts).invalid.includes('adm'));
});

test('subdivision filtering matches the packaged row index without changing catalogue values or country classes',()=>{
 const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
 const countries=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
 const admin=JSON.parse(fs.readFileSync('system/dist/data/admin1-index.json','utf8'));
 const c=registry.catalogs.find(c=>c.id==='ssn-mx-historical');
 const pack=JSON.parse(fs.readFileSync('system/dist/'+c.events_url,'utf8'));
 const rows=pack.rows.map((row,i)=>({...Object.fromEntries(pack.fields.map((k,n)=>[k,row[n]])),country_id:countries.catalogs[c.id].country_ids[i],admin1_id:admin.catalogs[c.id].admin1_ids[i],year:Number(row[pack.fields.indexOf('time')].slice(0,4))}));
 const original=JSON.stringify(rows.slice(0,3));
 for(const id of ['MEX-2727','MEX-2723','admin1-outside','admin1-boundary']){
  const filters={...V.catalogDefaults(c),country:'MEX',admin1:id};const selected=V.filterEvents(rows,filters);
  assert.equal(selected.length,admin.catalogs[c.id].country_counts.MEX[id]||0);
  assert(selected.every(e=>e.country_id==='MEX'&&e.admin1_id===id));
 }
 assert.equal(JSON.stringify(rows.slice(0,3)),original);
 assert.equal(V.filterEvents(rows,{...V.catalogDefaults(c),country:'CAN',admin1:'MEX-2727'}).length,0);
});

test('v5 query documents require matching subdivision evidence and preserve v4 metadata when inactive',()=>{
 const c={id:'ssn-mx-historical',provider:'ssn',years:[1900,2026],identifier_kind:'derived_row_key',depth_unit:'km'};
 const hashes={events:'event-hash',manifest:'manifest-hash',registry:'registry-hash'};
 const row={id:'source-row',year:2026,time:'2026-01-01T00:00:00Z',mag:4,depth:10,magType:null,country_id:'MEX',admin1_id:'MEX-2727'};
 const manifest={files:[],field_semantics:{type:'unknown'}};
 const geo={index_path:'data/country-index.json',index_sha256:'a'.repeat(64),geometry_path:'data/basemap.geojson',geometry_sha256:'b'.repeat(64),selected_country:'MEX',admin1:{index_path:'data/admin1-index.json',index_sha256:'c'.repeat(64),geometry_path:'data/admin1.geojson',geometry_sha256:'d'.repeat(64),selected_admin1:'MEX-2727'}};
 const view={catalog:c.id,filters:{...V.defaults,country:'MEX',admin1:'MEX-2727'},lang:'en',tab:'catalog',sort:'recent',admin1Geography:geo.admin1.index_sha256};
 const args={view,catalog:c,manifest,assetHashes:hashes,fields:Object.keys(row),rows:[row],geography:geo,pageURL:'https://example.org/?v=5'};
 const query=V.queryDocument(args);assert.equal(query.schema,'seismic-local-query/5');assert.deepEqual(query.geography,geo);assert.equal(query.input.depth_unit,'km');assert.equal(query.selection.admin1,'MEX-2727');assert.equal(query.result.row_count,1);assert(query.predicate_rules.admin1.includes('No nearest'));
 assert.throws(()=>V.queryDocument({...args,geography:{...geo,admin1:undefined}}),/matching country/);
 assert.throws(()=>V.queryDocument({...args,geography:{...geo,selected_country:'USA'}}),/matching country/);
 assert.throws(()=>V.queryDocument({...args,geography:{...geo,admin1:{...geo.admin1,selected_admin1:'USA-3521'}}}),/matching country/);
 const inactive=V.queryDocument({...args,view:{...view,filters:{...view.filters,admin1:''}}});
 assert.equal(inactive.schema,'seismic-local-query/4');assert.equal(Object.hasOwn(inactive.geography,'admin1'),false);assert.equal(Object.hasOwn(inactive.predicate_rules,'admin1'),false);
 const input={catalog:c,manifest,fields:Object.keys(row),hashes};
 const combined=V.queryDocument({...args,view:{...view,catalog:'all-catalogs'},catalog:{id:'all-catalogs',years:[1900,2026]},inputs:[input],rows:[{...row,id:'ssn-mx-historical~source-row',_catalog_id:c.id,source_event_id:row.id}]});
 assert.equal(combined.schema,'seismic-local-query/5');assert.deepEqual(combined.geography,geo);assert.equal(combined.inputs.length,1);assert.equal(combined.inputs[0].events_sha256,hashes.events);assert(combined.predicate_rules.admin1.includes('conditional'));
});

console.log(JSON.stringify({passed:checks.length,checks},null,2));
