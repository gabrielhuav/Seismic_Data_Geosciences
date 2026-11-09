'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../system/dist/country-comparison.js');
const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8')),catalog=registry.catalogs.find(c=>c.id==='usgs-na-2020-2025');
const pack=JSON.parse(fs.readFileSync('system/dist/'+catalog.events_url,'utf8')),geo=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
const events=pack.rows.map((r,i)=>Object.assign(Object.fromEntries(pack.fields.map((k,j)=>[k,r[j]])),{country_id:geo.catalogs[catalog.id].country_ids[i]}));
const input={catalog,events,hashes:{events:catalog.sha256},geographyEvidence:{sha256:'fixture-country-sha'}};
const before=JSON.stringify(input);let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('same-source comparison preserves row identifiers, exact types and common time criteria',()=>{
 const result=C.compute(input);assert.equal(JSON.stringify(input),before);
 for(const c of result.countries){const rows=events.filter(e=>e.country_id===c.country_id&&Number(e.time.slice(0,4))>=2020&&Number(e.time.slice(0,4))<=2025&&e.mag>=4.5&&e.magType==='mww');assert.equal(c.record_count,rows.length);assert.deepEqual(c.ordered_record_ids,rows.map(e=>e.id));assert.equal(c.annual_counts.reduce((n,y)=>n+y.record_count,0),rows.length);}
 assert.equal(result.input.hashes.events,catalog.sha256);assert(result.limits.some(s=>s.includes('Completeness')));
});
test('changing countries uses the same single USGS catalogue and never imports SSN or NRCan as comparable populations',()=>{
 const r=C.compute(input,{countryA:'CAN',countryB:'USA'});assert.equal(r.input.catalogue_id,catalog.id);assert.deepEqual(r.countries.map(c=>c.country_id),['CAN','USA']);
 assert.throws(()=>C.compute({...input,catalog:{id:'ssn-mx-historical',provider:'ssn'}}));assert.throws(()=>C.compute(input,{countryA:'CAN',countryB:'CAN'}));assert.throws(()=>C.compute(input,{yearFrom:1900}));assert.throws(()=>C.compute(input,{magType:''}));
});
test('empty bins and unknown measurements stay explicit without fabricated means',()=>{
 const empty=C.compute(input,{minMag:10});assert(empty.countries.every(c=>c.record_count===0&&c.magnitude.mean===null&&c.depth_km.mean===null&&c.annual_counts.every(y=>y.record_count===0)));
 assert(C.chart(empty,'en').includes('zero means zero selected rows'));assert(C.chart(empty,'es').includes('<title>Conteos anuales'));
});
test('CSV and JSON preserve filters, source hashes and every selected record without silently truncating',()=>{
 const result=C.compute(input),csv=C.csv(result);assert(csv.includes(catalog.sha256));assert(csv.includes('fixture-country-sha'));assert(csv.includes('summary,'));assert(csv.includes('annual,'));
 const records=csv.split('\r\n').filter(s=>s.startsWith('record,'));assert.equal(records.length,result.countries.reduce((n,c)=>n+c.record_count,0));
 for(const c of result.countries)for(const id of c.ordered_record_ids)assert(csv.includes(id));assert.equal(JSON.parse(JSON.stringify(result)).filters.magType,'mww');
});
test('shared magnitude bins use exact quarter-unit edges and retain boundary rows once',()=>{
 const rows=[
  ['ca-a','CAN',4.5,null],['ca-b','CAN',4.75,null],['ca-c','CAN',5,null],['ca-d','CAN',5.25,null],
  ['mx-a','MEX',4.74,0],['mx-b','MEX',4.99,12],['mx-c','MEX',5.49,null],['mx-d','MEX',7.8,30],
 ].map(([id,country_id,mag,depth])=>({id,country_id,mag,depth,magType:'mww',time:'2022-05-01T00:00:00Z'}));
 rows.push({id:'outside','country_id':'outside',mag:9,depth:5,magType:'mww',time:'2022-05-01T00:00:00Z'});
 rows.push({id:'different-type','country_id':'CAN',mag:6,depth:5,magType:'mb',time:'2022-05-01T00:00:00Z'});
 rows.push({id:'unknown','country_id':'CAN',mag:null,depth:5,magType:'mww',time:'2022-05-01T00:00:00Z'});
 const fixture={catalog:{id:'usgs-na-2020-2025',provider:'usgs',years:[2020,2025]},events:rows},original=structuredClone(fixture),result=C.compute(fixture);
 assert.deepEqual(fixture,original);
 assert.deepEqual(result.distribution.edges,[4.5,4.75,5,5.25,5.5,5.75,6,6.25,6.5,6.75,7,7.25,7.5,7.75,8]);
 assert.equal(result.distribution.bin_width,.25);assert.equal(result.distribution.normalization,'none');
 assert.deepEqual(result.countries[0].magnitude_bins.map(x=>x.record_count),[1,1,1,1,0,0,0,0,0,0,0,0,0,0]);
 assert.deepEqual(result.countries[1].magnitude_bins.map(x=>x.record_count),[1,1,0,1,0,0,0,0,0,0,0,0,0,1]);
 for(const country of result.countries)assert.equal(country.magnitude_bins.reduce((n,b)=>n+b.record_count,0),country.record_count);
 assert.equal(result.countries[0].depth_km.mean,null);assert.equal(result.countries[0].depth_km.n,0);
 assert.equal(result.countries[1].depth_km.mean,14);assert.equal(result.countries[1].depth_km.n,3);
 const restricted=C.compute(fixture,{minMag:4.6});assert.equal(restricted.countries[0].record_count,3);assert.equal(restricted.countries[1].record_count,4);assert.equal(restricted.distribution.edges[0],4.5);
});
test('empty distributions and singleton uncertainty do not turn missing summaries into zero',()=>{
 const empty=C.compute(input,{minMag:10});assert.deepEqual(empty.distribution.edges,[10,10.25]);
 for(const country of empty.countries){assert.equal(country.magnitude.minimum,null);assert.equal(country.magnitude.maximum,null);assert.equal(country.magnitude.sample_sd,null);assert.deepEqual(country.magnitude_bins,[{lower:10,upper:10.25,record_count:0}]);}
 assert(C.distributionChart(empty,'en').includes('not no physical earthquakes'));
 const one={catalog:{id:'usgs-na-2020-2025',provider:'usgs',years:[2020,2025]},events:[{id:'one','country_id':'CAN',time:'2022-01-01T00:00:00Z',mag:5,magType:'mww',depth:null}]};
 const result=C.compute(one);assert.equal(result.countries[0].magnitude.mean,5);assert.equal(result.countries[0].magnitude.sample_sd,null);assert.equal(result.countries[0].depth_km.mean,null);assert.equal(result.countries[1].magnitude.mean,null);
 assert(result.countries.every(country=>country.magnitude_bins.length===result.distribution.edges.length-1));
});
test('real regional magnitude-bin counts independently match each retained row and both chart models',()=>{
 const result=C.compute(input);assert.deepEqual(result.countries.map(c=>c.record_count),[15,53]);
 for(const country of result.countries){
  const selected=events.filter(e=>e.country_id===country.country_id&&Number(e.time.slice(0,4))>=2020&&Number(e.time.slice(0,4))<=2025&&e.mag>=4.5&&e.magType==='mww');
  for(const bin of country.magnitude_bins)assert.equal(bin.record_count,selected.filter(e=>e.mag>=bin.lower&&e.mag<bin.upper).length);
  assert.equal(country.magnitude.minimum,Math.min(...selected.map(e=>e.mag)));assert.equal(country.magnitude.maximum,Math.max(...selected.map(e=>e.mag)));
 }
 for(const lang of ['en','es']){assert(C.chart(result,lang).includes('role="img"'));assert(C.distributionChart(result,lang).includes('role="img"'));}
});
console.log(JSON.stringify({passed:checks,default_counts:C.compute(input).countries.map(c=>({country:c.country_id,n:c.record_count,mean:c.magnitude.mean,sd:c.magnitude.sample_sd}))}));
