'use strict';
const assert = require('node:assert/strict');
const C = require('../system/dist/research-charts.js');
const A = require('../system/dist/analytics.js');
let checks = 0;
function test(name, fn) {fn();checks++;console.log('PASS ' + name);}
const catalogs = [{id:'usgs',provider:'usgs'}, {id:'ssn',provider:'ssn',depth_unit:'km'}, {id:'canada',provider:'nrcan',depth_unit_status:'not_documented_in_source'}];
const row = (mag,depth,more={}) => ({mag,depth,magType:'mww',catalog_id:'usgs',...more});
const options = {catalogId:'usgs',magType:'mww',catalogs};
const total = bins => bins.reduce((sum, bin) => sum + bin.count,0);

test('exact catalogue and reported case-sensitive magnitude type determine every plotted value', () => {
  const rows = [row(4,10),row(5,20,{magType:'Mww'}),row(6,30,{catalog_id:'ssn'}),row(7,40,{magType:null}),row(8,50)];
  const model = C.distribution(rows,options);
  assert.equal(model.record_count,2);assert.equal(model.magnitude_count,2);assert.equal(total(model.bins),2);
  assert.deepEqual(model.points,[{magnitude:4,depth:10,count:1},{magnitude:8,depth:50,count:1}]);
});
test('unknown types remain numerical groups and blank type joins null, without inventing a scale', () => {
  const model = C.distribution([row(4,1,{magType:null}),row(5,2,{magType:''}),row(6,3,{magType:'mww'})],{...options,magType:null});
  assert.equal(model.mag_type,null);assert.equal(model.record_count,2);assert.equal(model.depth_pair_count,2);
});
test('missing, string and non-finite values never become zero; reported negative and zero depths remain', () => {
  const rows = [row(4,-5),row(5,0),row(null,1),row('',2),row(NaN,3),row(Infinity,4),row(6,null),row(7,''),row(8,NaN),row(9,Infinity)];
  const model = C.distribution(rows,options);
  assert.equal(model.record_count,10);assert.equal(model.magnitude_count,6);assert.equal(model.depth_pair_count,2);
  assert.equal(model.missing_magnitude_count,4);assert.equal(model.missing_depth_pair_count,8);
  assert.deepEqual(model.depth_extent,[-5,0]);
});
test('only documented kilometre pairs enter scatter, including explicit unit overrides', () => {
  const canada = C.distribution([row(4,15,{catalog_id:'canada',depth_unit:'km'})],{...options,catalogId:'canada'});
  assert.equal(canada.magnitude_count,1);assert.equal(canada.depth_pair_count,0);
  const usgs = C.distribution([row(4,1,{depth_unit:null}),row(5,2,{depth_unit:'m'}),row(6,3,{depth_unit:'km'})],options);
  assert.equal(usgs.depth_pair_count,1);assert.equal(usgs.points[0].depth,3);
});
test('histogram respects half-open decimal boundaries without rounding the reported magnitudes', () => {
  const values = [-.2,-.00001,0,.199999999999,.2,4.599999999999,4.6,4.799999999999,4.8];
  const model = C.distribution(values.map(mag=>row(mag,1)),options);
  assert.equal(total(model.bins),values.length);
  assert.equal(model.bins.find(b=>b.lower===-.2).count,2);
  assert.equal(model.bins.find(b=>b.lower===0).count,2);
  assert.equal(model.bins.find(b=>b.lower===.2).count,1);
  assert.equal(model.bins.find(b=>b.lower===4.4).count,1);
  assert.equal(model.bins.find(b=>b.lower===4.6).count,2);
  assert.equal(model.bins.find(b=>b.lower===4.8).count,1);
});
test('large scatter uses exact cell counts, retains every pair and never samples silently', () => {
  const rows = Array.from({length:12000},(_,i)=>row(4 + i % 30 / 10, i % 145));
  const model = C.distribution(rows,options);
  assert.equal(model.scatter_mode,'density');assert.equal(model.depth_pair_count,rows.length);
  assert(model.points.length<=48*28);assert.equal(total(model.points),rows.length);
  assert.equal(total(model.bins),rows.length);
  assert.deepEqual(model.scatter_grid.magnitude_extent,[4,6.9]);
  assert(C.svgScatter(model).includes('no sampling'));
  assert.equal(C.distribution(rows.slice(0,3000),options).points.length,3000);
});
test('constant-value density is finite, bounded and conserves counts', () => {
  const model = C.distribution(Array.from({length:3001},()=>row(5,0)),options);
  assert.equal(model.points.length,1);assert.equal(model.points[0].count,3001);
  assert.equal(model.scatter_grid.columns,1);assert.equal(model.scatter_grid.rows,1);
  assert(!/NaN|Infinity/.test(C.svgScatter(model)));
});
test('density cells have exclusive internal upper bounds and retain exact outer extrema', () => {
  const values = [[-1.7,-.1],[6.9,599.99],[2.6,299.945],[2.599999999999,299.944999999999]];
  const rows = Array.from({length:3004},(_,i)=>row(...values[i%values.length]));
  const model = C.distribution(rows,options);
  assert.equal(model.scatter_grid.magnitude_extent[1],6.9);
  assert.equal(model.scatter_grid.depth_extent[1],599.99);
  for(const [magnitude,depth] of values) {
    const matches = model.points.filter(p=>magnitude>=p.x0&&(magnitude<p.x1||(p.x_upper_inclusive&&magnitude===p.x1))
      &&depth>=p.y0&&(depth<p.y1||(p.y_upper_inclusive&&depth===p.y1)));
    assert.equal(matches.length,1,JSON.stringify({magnitude,depth}));
  }
  assert.equal(total(model.points),rows.length);
  const svg = C.svgScatter(model);
  assert(svg.includes('6.9]'));assert(svg.includes('599.99]'));
  assert(svg.includes('); km ['));
});
test('plot sample sizes agree independently with the maintained descriptive summary', () => {
  const rows = [row(4,-1),row(5,0),row(6,20),row(null,30),row(7,null),row(8,2,{magType:'mb'}),row(9,3,{catalog_id:'ssn'})];
  const model = C.distribution(rows,options), group = A.summarize(rows,{catalogs}).groups.find(g=>g.catalog_id==='usgs'&&g.mag_type==='mww');
  assert.equal(model.record_count,group.n);assert.equal(model.magnitude_count,group.magnitude.n);assert.equal(model.depth_pair_count,group.magnitude_depth.n);
  assert.equal(total(model.bins),group.magnitude.n);
});
test('renderers provide accessible text, escape labels and handle empty data honestly', () => {
  const model = C.distribution([],options);
  for(const svg of [C.svgHistogram(model),C.svgScatter(model),C.svgAnnual([])]) {
    assert(svg.startsWith('<title>'));assert(svg.includes('<desc>'));assert(svg.includes('No valid values'));
    assert(!/NaN|Infinity/.test(svg));
  }
  const svg = C.svgHistogram(C.distribution([row(5,1)],options),{labels:{title:'<script>alert(1)</script>',x:'<x>',records:'<rows>'}});
  assert(!svg.includes('<script>'));assert(svg.includes('&lt;script&gt;'));assert(svg.includes('&lt;rows&gt;'));
});
test('annual chart retains zero bins, exact UTC years and source-row counts', () => {
  const svg = C.svgAnnual([{year:2020,record_count:3},{year:2021,record_count:0},{year:2022,record_count:5}],{labels:{x:'UTC year'}});
  assert(svg.includes('2021: 0'));assert(svg.includes('2020: 3'));assert(svg.includes('2022: 5'));
  assert(svg.includes('UTC year'));assert(!svg.includes('2020.1'));assert(!/NaN|Infinity/.test(svg));
  assert.throws(()=>C.svgAnnual([{year:2020,record_count:-1}]),/integer UTC/);
});
test('one SVG retains its exact series and reserves axis margins for enlarged mobile text', () => {
  const model = C.distribution(Array.from({length:3100},(_,i)=>row(4 + i%49 / 10,i%601)),options);
  const histogram = C.svgHistogram(model),scatter = C.svgScatter(model),annual = C.svgAnnual([{year:2020,record_count:242288},{year:2021,record_count:0}]);
  assert(scatter.includes('class="chart-density-note"'));
  for(const svg of [histogram,scatter,annual]) {
    assert(svg.includes('x="100" y="24"')); // y-axis title has room above the plot.
    assert(svg.includes('x="395" y="295"')); // x-axis title remains inside 300.
    assert(svg.includes('x1="100" x2="690" y1="240" y2="240"'));
    for(const element of svg.matchAll(/<(?:rect|circle)\b[^>]*>/g)) {
      const attributes = Object.fromEntries([...element[0].matchAll(/([a-z]+)="([\d.-]+)"/g)].map(m=>[m[1],Number(m[2])]));
      if('x' in attributes) {assert(attributes.x>=100);assert(attributes.x+(attributes.width||0)<=690.001);}
      if('y' in attributes) {assert(attributes.y>=44.999);assert(attributes.y+(attributes.height||0)<=240.001);}
      if('cx' in attributes)assert(attributes.cx>=100 && attributes.cx<=690);
      if('cy' in attributes)assert(attributes.cy>=45 && attributes.cy<=240);
    }
  }
  assert.equal(total(model.bins),3100);assert.equal(total(model.points),3100);
});
test('chart computations do not mutate rows or catalogue metadata and reject ambiguous identity', () => {
  const rows = [row(4,0),row(5,10)];const before = JSON.stringify([rows,options]);
  C.distribution(rows,options);assert.equal(JSON.stringify([rows,options]),before);
  assert.throws(()=>C.distribution([{mag:4,depth:1,magType:'mww'}],options),/Catalogue identity/);
  assert.throws(()=>C.distribution(null,options),/array/);
  assert.throws(()=>C.distribution(rows,{}),/selected catalogue/);
});
console.log(JSON.stringify({passed:checks}));
