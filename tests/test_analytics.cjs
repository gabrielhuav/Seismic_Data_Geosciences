'use strict';
const assert = require('node:assert/strict');
const A = require('../system/dist/analytics.js');
let checks = 0;
function test(name, fn) {fn();checks++;console.log('PASS ' + name);}
const catalog = {id:'usgs-one',provider:'usgs'};
const options = {catalogs:[catalog], filters:{yearFrom:2020,yearTo:2022},createdUTC:'2026-11-07T00:00:00Z'};
const row = (mag, depth, more={}) => ({mag,depth,magType:'mww',time:'2020-01-01T00:00:00Z',...more});
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('empty selections retain an explicit selected year range and unknown statistics', () => {
  const s=A.summarize([],options);
  assert.equal(s.record_count,0);assert.equal(s.count_unit,'source_records');assert.deepEqual(s.groups,[]);
  assert.deepEqual(s.annual_counts,[{year:2020,record_count:0},{year:2021,record_count:0},{year:2022,record_count:0}]);
  assert.deepEqual(s.per_catalog,[{catalog_id:'usgs-one',data_provider:'usgs',record_count:0}]);
  assert(s.limits.some(x=>x.includes('do not establish')));assert.equal(s.created_utc,options.createdUTC);
});
test('reported zero and negative documented depths remain real values', () => {
  const s=A.summarize([row(4,-10),row(5,0),row(6,10)],options),g=s.groups[0];
  assert.deepEqual(g.magnitude,{n:3,mean:5,median:5,min:4,max:6,sample_sd:1});
  assert.deepEqual(g.depth_km,{n:3,mean:0,median:0,min:-10,max:10,sample_sd:10});
  near(g.magnitude_depth.pearson_r,1);assert.equal(g.magnitude_depth.n,3);assert.equal(g.magnitude_depth.reason,null);
});
test('missing values are excluded, never coerced to zero or invented', () => {
  const rows=[row(0,null),row(null,0),row('',null),row(NaN,undefined),row(Infinity,3)];
  const s=A.summarize(rows,options),g=s.groups[0];
  assert.equal(g.n,5);assert.equal(g.magnitude.n,1);assert.equal(g.magnitude.mean,0);assert.equal(g.magnitude.sample_sd,null);
  assert.equal(g.depth_km.n,2);assert.equal(g.depth_km.mean,1.5);assert.equal(g.magnitude_depth.n,0);
  assert.equal(g.magnitude_depth.pearson_r,null);assert.equal(g.magnitude_depth.reason,'fewer_than_three_pairs');
});
test('catalogues and exact case-sensitive magnitude types remain separate', () => {
  const catalogs=[catalog,{id:'ssn',provider:'ssn',depth_unit:'km'}];
  const rows=[row(4,1,{catalog_id:'usgs-one',magType:'mb'}),row(8,2,{catalog_id:'usgs-one',magType:'mB'}),
    row(5,3,{catalog_id:'ssn',magType:'mb'}),row(6,4,{catalog_id:'ssn',magType:null}),row(7,5,{catalog_id:'ssn',magType:''})];
  const s=A.summarize(rows,{catalogs});
  assert.equal(s.groups.length,4);assert.equal(s.groups[0].magnitude.mean,4);assert.equal(s.groups[1].magnitude.mean,8);
  assert.equal(s.groups[2].magnitude.mean,5);assert.equal(s.groups[3].magnitude.mean,6.5);
  assert.equal(s.groups[3].magnitude_depth.reason,'unknown_magnitude_type');
  assert.deepEqual(s.per_catalog.map(x=>x.record_count),[2,3]);
  assert.throws(()=>A.summarize([row(4,1)],{catalogs}),/Catalogue identity/);
});
test('unknown depth units and explicit null units cannot become kilometres', () => {
  const nrcan={id:'nrcan',provider:'nrcan',depth_unit_status:'not_documented_in_source'};
  const rows=[row(4,23.2),row(5,24),row(6,25)];
  const g=A.summarize(rows,{catalogs:[nrcan]}).groups[0];
  assert.equal(g.depth_km.n,0);assert.equal(g.depth_km.mean,null);assert.equal(g.magnitude_depth.pearson_r,null);
  const g2=A.summarize(rows.map(x=>({...x,depth_unit:null})),{catalogs:[catalog]}).groups[0];
  assert.equal(g2.depth_km.n,0);
});
test('Pearson requires three pairs and nonconstant variables; negative association is retained', () => {
  for (const rows of [[row(4,0),row(5,2)],[row(4,1),row(4,2),row(4,3)],[row(4,1),row(5,1),row(6,1)]]) {
    assert.equal(A.summarize(rows,options).groups[0].magnitude_depth.pearson_r,null);
  }
  const g=A.summarize([row(4,30),row(5,20),row(6,10)],options).groups[0];near(g.magnitude_depth.pearson_r,-1);
});
test('UTC years, gap bins, missing years and record multiplicity remain explicit', () => {
  const rows=[row(4,2,{time:'2020-12-31T23:30:00-02:00'}),row(4,2,{time:'2022-01-01T00:00:00Z'}),
    row(4,2,{time:'invalid',year:undefined}),row(4,2,{time:'2022-01-01T00:00:00Z'})];
  const s=A.summarize(rows,options);
  assert.deepEqual(s.annual_counts,[{year:2020,record_count:0},{year:2021,record_count:1},{year:2022,record_count:2}]);
  assert.equal(s.missing_year_count,1);assert.equal(s.record_count,4);
});
test('CSV exposes typed metrics with their sample sizes and missing values intact', () => {
  const s=A.summarize([row(4,null)],options),csv=A.csvRows(s);
  assert(csv.every(x=>Object.keys(x).join(',')===A.csvFields.join(',')));
  const depth=csv.find(x=>x.metric==='depth_km_mean');assert.equal(depth.value,null);assert.equal(depth.n,0);assert.equal(depth.unit,'km');
  const mag=csv.find(x=>x.metric==='magnitude_mean');assert.equal(mag.value,4);assert.equal(mag.n,1);assert.equal(mag.mag_type,'mww');
  assert.throws(()=>A.csvRows({}),/Unsupported/);
});
test('summary is deterministic and does not mutate records, catalogues or filters', () => {
  const rows=[row(4,0),row(6,10),row(5,5)],before=JSON.stringify([rows,options]);
  const s=A.summarize(rows,options);assert.deepEqual(A.summarize(rows,options),s);assert.equal(JSON.stringify([rows,options]),before);
  s.filters.yearFrom=1900;assert.equal(options.filters.yearFrom,2020);
  assert.throws(()=>A.summarize(null),/array/);assert.throws(()=>A.summarize([null]),/object/);
  assert.throws(()=>A.summarize([],{filters:{yearFrom:2022,yearTo:2020}}),/year range/);
});
console.log(JSON.stringify({passed:checks}));
