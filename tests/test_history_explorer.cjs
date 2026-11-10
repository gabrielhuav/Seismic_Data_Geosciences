'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),H=require('../system/dist/history-explorer.js');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
const countries=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
const admin=JSON.parse(fs.readFileSync('system/dist/data/admin1-index.json','utf8'));
function input(id){const catalog=registry.catalogs.find(c=>c.id===id),raw=JSON.parse(fs.readFileSync('system/dist/'+catalog.events_url,'utf8'));return {catalog,events:raw.rows.map((row,i)=>({...Object.fromEntries(raw.fields.map((f,j)=>[f,row[j]])),country_id:countries.catalogs[id].country_ids[i],admin1_id:admin.catalogs[id].admin1_ids[i]})),admin1:admin,hashes:{events:catalog.sha256,manifest:catalog.manifest_sha256},geographyEvidence:{index_sha256:'synthetic-geography-evidence',admin1:{index_sha256:'synthetic-admin-evidence'}}};}
const basic={catalog:{id:'fixture',provider:'usgs',years:[1900,2026]},admin1:{regions:[{id:'MEX-X',country_id:'MEX',label:{en:'Fixture state'}}]},events:[]};
function event(id,mag,longitude=0,extra={}){return {id,time:'2020-01-01T00:00:00Z',year:2020,latitude:0,longitude,mag,magType:'mww',country_id:'MEX',admin1_id:'MEX-X',...extra};}
test('Top 10 uses one exact literal type, deterministic ties and an explicit maximum of ten',()=>{
 const data={...basic,events:Array.from({length:14},(_,i)=>event('key-'+String(i).padStart(2,'0'),7+(i%3)/10,0,{time:'2020-01-'+String(1+i).padStart(2,'0')+'T00:00:00Z'}))};
 data.events.push(event('different-type',9,0,{magType:'mb'}),event('null-mag',null),event('other-year',9,0,{year:1899}),event('foreign',9,0,{country_id:'GTM'}));
 const before=JSON.stringify(data),result=H.computeTop(data,{magType:'mww'});
 const expected=data.events.filter(e=>e.mag!==null&&e.magType==='mww'&&e.year>=1900&&e.year<=2026&&['MEX','CAN','USA'].includes(e.country_id)).sort((a,b)=>b.mag-a.mag||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
 assert.deepEqual(result.ranked_records.map(e=>e.record_key),expected.slice(0,10).map(e=>e.id));assert.equal(result.eligible_records,14);assert.equal(result.ranked_records.length,10);assert.equal(JSON.stringify(data),before);assert(result.rule.ties.includes('not all ties'));
});
test('countries and only their own known subdivisions are accepted, with footprint distinct from North America',()=>{
 const data={...basic,events:[event('mex',7),event('ca',8,0,{country_id:'CAN',admin1_id:'CAN-X'}),event('offshore',9,0,{country_id:'outside',admin1_id:'admin1-outside'}),event('guatemala',8.5,0,{country_id:'GTM'})]};
 assert.equal(H.computeTop(data,{scope:'NA',magType:'mww'}).eligible_records,2);assert.equal(H.computeTop(data,{scope:'footprint',magType:'mww'}).eligible_records,4);
 assert.deepEqual(H.computeTop(data,{scope:'MEX',admin1:'MEX-X',magType:'mww'}).ranked_records.map(e=>e.record_key),['mex']);
 assert.throws(()=>H.computeTop(data,{scope:'CAN',admin1:'MEX-X',magType:'mww'}),/HISTORY_ADMIN1/);assert.throws(()=>H.computeTop(data,{scope:'NA',admin1:'MEX-X',magType:'mww'}),/HISTORY_ADMIN1/);
 assert.throws(()=>H.computeTop(data,{yearFrom:1899}),/HISTORY_YEARS/);assert.throws(()=>H.computeTop(data,{yearFrom:2025,yearTo:2020}),/HISTORY_YEARS/);assert.throws(()=>H.computeTop(data,{magType:'Mw'}),/HISTORY_TYPE/);
});
test('unknown type remains a distinct group, and undocumented Canadian depth is never treated as km',()=>{
 const data={...basic,catalog:{...basic.catalog,provider:'nrcan',identifier_kind:'derived_row_key'},events:[event('unknown',7,0,{magType:null,depth:40}),event('typed',8,0,{magType:'mww',depth:50})]};
 const result=H.computeTop(data,{magType:H.MISSING});assert.equal(result.ranked_records.length,1);assert.equal(result.ranked_records[0].magnitude_type,null);assert.equal(result.ranked_records[0].depth_km,null);assert.equal(result.ranked_records[0].identifier_kind,'derived_row_key');assert.equal(result.eligible_records,1);
});
test('haversine is spherical, antimeridian-safe, stable at antipodes, and rejects missing points',()=>{
 const a={latitude:0,longitude:0},b={latitude:0,longitude:1};assert(Math.abs(H.haversine(a,b)-111.1950802335329)<1e-9);assert(Math.abs(H.haversine({latitude:0,longitude:179},{latitude:0,longitude:-179})-222.3901604670658)<1e-9);assert.equal(H.haversine(a,a),0);assert(Math.abs(H.haversine(a,{latitude:0,longitude:180})-Math.PI*H.EARTH_RADIUS_KM)<1e-7);assert.equal(H.haversine({latitude:null,longitude:0},b),null);assert.equal(H.haversine({latitude:91,longitude:0},b),null);
});
test('map display copies reuse continuous main-map antimeridian polygons without changing source or computation coordinates',()=>{
 const vm=require('node:vm'),context={window:{}};vm.runInNewContext(fs.readFileSync('system/dist/map.js','utf8'),context);const transform=context.window.SeismicMapGeometry;
 const raw={type:'FeatureCollection',features:[{type:'Feature',properties:{ISO_A3:'USA'},geometry:{type:'MultiPolygon',coordinates:[[[[179,51],[-179,51],[-179,52],[179,52],[179,51]]],[[[-165,54],[-164,54],[-164,55],[-165,54]]]]}},{type:'Feature',properties:{admin1_id:'USA-AK'},geometry:{type:'Polygon',coordinates:[[[179,51],[-179,51],[-179,52],[179,52],[179,51]]]}}]};
 const before=JSON.stringify(raw),display=H.displayGeometry(raw,transform);assert.equal(JSON.stringify(raw),before);assert.notEqual(display,raw);assert.notEqual(display.features[0],raw.features[0]);assert.notEqual(display.features[0].geometry,raw.features[0].geometry);
 const firstRing=display.features[0].geometry.coordinates[0][0];assert(firstRing.every(point=>point[0]<0));for(let i=1;i<firstRing.length;i++)assert(Math.abs(firstRing[i][0]-firstRing[i-1][0])<=180);assert.equal(transform.displayLongitude(179),-181);assert.equal(firstRing[0][0],-181);assert.equal(display.features[1].geometry.coordinates[0][0][0],-181);
 const point={latitude:51,longitude:179},other={latitude:51,longitude:-179};const distance=H.haversine(point,other);assert(distance>139&&distance<141);assert.equal(point.longitude,179);assert.equal(raw.features[0].geometry.coordinates[0][0][0][0],179);
});
test('recurrence contains direct pairs only: a chain never becomes a mutually near three-event group',()=>{
 const data={...basic,events:[event('a',7,0),event('b',7,.6),event('c',7,1.2),event('too-small',6.99,.4),event('other-type',9,.4,{magType:'mb'})]};
 const result=H.computeRecurrence(data,{magType:'mww',radiusKm:100});assert.equal(result.located_records,3);assert.equal(result.pair_count,2);assert.equal(result.paired_records,3);assert.deepEqual(result.pairs.map(p=>[p.record_a,p.record_b]),[['a','b'],['b','c']]);assert(result.pairs.every(p=>p.distance_km<=100));assert(result.rule.pair_rule.includes('no transitive'));assert(!('recurrence_interval' in result));assert(!('probability' in result));
 const smaller=H.computeRecurrence(data,{magType:'mww',radiusKm:50});assert.equal(smaller.pair_count,0);assert.equal(smaller.paired_records,0);assert.equal(smaller.records.length,3);assert(result.limits.some(s=>s.includes('independent')));
});
test('declared one-micrometre tolerance makes inclusive pair and coast boundaries stable before rounding',()=>{
 const epsilon=1e-9,longitudeFor=km=>km/H.EARTH_RADIUS_KM*180/Math.PI;
 assert.equal(H.DISTANCE_TOLERANCE_KM,epsilon);
 for(const [distance,included] of [[50,true],[50+epsilon/2,true],[50+10*epsilon,false]]){
  const data={...basic,events:[event('a',7),event('b',7,longitudeFor(distance))]},result=H.computeRecurrence(data,{magType:'mww',radiusKm:50});
  assert.equal(result.pair_count,included?1:0,'pair '+distance);assert.equal(result.rule.numeric_tolerance_km,epsilon);assert(result.rule.distance_comparison.includes('before display rounding'));assert(result.rule.distance_comparison.includes('not geographic'));
 }
 const polygon={type:'Feature',properties:{ISO_A3:'MEX'},geometry:{type:'Polygon',coordinates:[[[0,-1],[1,-1],[1,1],[0,1],[0,-1]]]}};
 for(const [distance,included] of [[100,true],[100+epsilon/2,true],[100+10*epsilon,false]]){
  const data={...basic,geometry:{type:'FeatureCollection',features:[polygon]},events:[event('land',7,.9),event('offshore',7,1+longitudeFor(distance),{country_id:'outside',admin1_id:'admin1-outside'})]};
  const result=H.computeRecurrence(data,{scope:'MEX',magType:'mww',includeOffshore:true});assert.equal(result.nearby_unassigned_records,included?1:0,'coast '+distance);
 }
});
test('M threshold is inclusive; invalid points are counted but not paired, and repeated source keys cannot inflate pairs',()=>{
 const data={...basic,events:[event('a',7),event('b',7,.1),event('invalid',8,.2,{latitude:null}),event('below',6.999,.15)]};
 const result=H.computeRecurrence(data,{magType:'mww'});assert.equal(result.eligible_records,3);assert.equal(result.located_records,2);assert.equal(result.selection.invalid_or_missing_coordinates,1);assert.equal(result.pair_count,1);
 assert.throws(()=>H.computeRecurrence({...data,events:[event('same',7),event('same',7.5,.1)]},{magType:'mww'}),/HISTORY_DUPLICATE_KEY/);
 assert.throws(()=>H.computeRecurrence(data,{magType:'mww',minimumMagnitude:6.9}),/HISTORY_RECURRENCE/);assert.throws(()=>H.computeRecurrence(data,{magType:'mww',radiusKm:75}),/HISTORY_RECURRENCE/);
});
test('optional offshore context uses distance to finite boundary arcs, preserves classes and does not annex foreign land',()=>{
 const polygon={type:'Feature',properties:{ISO_A3:'MEX'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}};
 const data={...basic,geometry:{type:'FeatureCollection',features:[polygon]},events:[event('land',7,.9,{latitude:.5}),event('near-offshore',7,1.5,{latitude:.5,country_id:'outside',admin1_id:'admin1-outside'}),event('far-offshore',8,3,{latitude:.5,country_id:'outside'}),event('foreign-land',8,1.3,{latitude:.5,country_id:'GTM'})]};
 assert(Math.abs(H.boundaryDistance({latitude:.5,longitude:1.5},[polygon])-55.595)<.02);
 const plain=H.computeRecurrence(data,{scope:'MEX',magType:'mww'}),near=H.computeRecurrence(data,{scope:'MEX',magType:'mww',includeOffshore:true});assert.equal(plain.located_records,1);assert.equal(near.located_records,2);assert.equal(near.nearby_unassigned_records,1);assert.equal(near.pair_count,1);assert.equal(near.records.find(e=>e.record_key==='near-offshore').country_id,'outside');assert(near.records.every(e=>e.record_key!=='foreign-land'));assert(near.rule.nearby_context.method.includes('not a reassignment'));
 const endpoint=H.boundaryDistance({latitude:2,longitude:1.5},[polygon]);assert(endpoint>120&&endpoint<125);
 assert.throws(()=>H.computeRecurrence({...data,geometry:null},{scope:'MEX',magType:'mww',includeOffshore:true}),/HISTORY_GEOMETRY/);
});
function parseCSV(text){const rows=[],row=[];let value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if(c==='\n'&&!quoted){row.push(value.replace(/\r$/,''));rows.push([...row]);row.length=0;value='';}else value+=c;}return rows;}
test('exports contain all displayed records, every pair and reproducibility evidence with explicit NULL',()=>{
 const data={...basic,hashes:{events:'sha-event',manifest:'sha-manifest'},geographyEvidence:{index_sha256:'sha-geo'},events:[event('a,quoted',7,0,{depth:null,place:'A "quoted" place'}),event('b',7,.2,{depth:0})]};
 const result=H.computeRecurrence(data,{magType:'mww'}),roundtrip=JSON.parse(JSON.stringify(result));assert.equal(roundtrip.records[0].depth_km,null);assert.equal(roundtrip.records[1].depth_km,0);const rows=parseCSV(H.csv(result));assert(rows.every(r=>r.length===rows[0].length));assert.equal(rows.filter(r=>r[0]==='record').length,2);assert.equal(rows.filter(r=>r[0]==='pair').length,1);const evidence=JSON.parse(rows.find(r=>r[0]==='evidence').at(-1));assert.equal(evidence.input.hashes.events,'sha-event');assert.equal(evidence.input.geography.index_sha256,'sha-geo');assert.equal(evidence.rule.earth_radius_km,6371.0088);assert.deepEqual(evidence.filters,result.filters);
});
const actual=[];
for(const id of ['usgs-na-2020-2025','usgs-mx-historical','nrcan-ca-historical','ssn-mx-historical'])test('real '+id+' Top10 and proximity agree with independent row and pair selection',()=>{
 const data=input(id),filters=H.defaults(data,'top');filters.scope='footprint';const result=H.computeTop(data,filters);
 const expected=data.events.filter(e=>typeof e.mag==='number'&&Number.isFinite(e.mag)&&(e.magType||H.MISSING)===filters.magType&&Number(String(e.time).slice(0,4))>=filters.yearFrom&&Number(String(e.time).slice(0,4))<=filters.yearTo).sort((a,b)=>b.mag-a.mag||String(a.time).localeCompare(String(b.time))||String(a.id).localeCompare(String(b.id))).slice(0,10);
 assert.deepEqual(result.ranked_records.map(e=>e.record_key),expected.map(e=>e.id));assert.equal(result.input.hashes.events,data.catalog.sha256);
 const recurrence=H.computeRecurrence(data,{...H.defaults(data,'recurrence'),scope:'footprint'}),matching=data.events.filter(e=>e.mag>=7&&(e.magType||H.MISSING)===recurrence.filters.magType);
 let pairs=0;for(let i=0;i<matching.length;i++)for(let j=i+1;j<matching.length;j++){const a=matching[i],b=matching[j],phi1=a.latitude*Math.PI/180,phi2=b.latitude*Math.PI/180,dlambda=(b.longitude-a.longitude)*Math.PI/180;const angle=Math.acos(Math.min(1,Math.max(-1,Math.sin(phi1)*Math.sin(phi2)+Math.cos(phi1)*Math.cos(phi2)*Math.cos(dlambda))));if(angle*6371.0088<=100)pairs++;}
 assert.equal(recurrence.pair_count,pairs);assert.equal(recurrence.records.length,matching.length);assert(recurrence.pairs.every(p=>p.record_a!==p.record_b));actual.push({catalogue:id,top_type:filters.magType,largest:result.ranked_records[0]?.reported_magnitude,recurrence_type:recurrence.filters.magType,large_records:recurrence.records.length,pairs:recurrence.pair_count});
});
console.log(JSON.stringify({passed,actual}));
