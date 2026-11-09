'use strict';
// The source presentation must follow the packaged source contracts, not imply
// four independent agencies, invent magnitude types, or assign Canadian km.
const assert=require('node:assert/strict'),fs=require('node:fs');
const W=require('../system/dist/source-workbench.js');
const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
const catalogs=registry.catalogs;let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}

test('the workbench exposes all four retained catalogues from three distributors',()=>{
 assert.equal(catalogs.length,4);assert.equal(new Set(catalogs.map(c=>c.provider)).size,3);
 const before=JSON.stringify(catalogs),html=W.inputs(catalogs,'en','ssn-mx-historical');
 assert.equal((html.match(/data-workbench-catalog=/g)||[]).length,4);
 assert.equal((html.match(/is-active/g)||[]).length,1);
 for(const c of catalogs){assert(html.includes('data-workbench-catalog="'+c.id+'"'));assert(html.includes(new Intl.NumberFormat('en').format(c.event_count)));}
 assert(html.includes('is-active" data-workbench-catalog="ssn-mx-historical"'));
 assert.equal(JSON.stringify(catalogs),before);
});

test('each source card links its own real package and manifest with its own source hash',()=>{
 const html=W.cards(catalogs,{lang:'en',verified:id=>id==='usgs-na-2020-2025'});
 assert.equal((html.match(/<article\b/g)||[]).length,4);
 assert.equal((html.match(/SHA-256 verified in this session/g)||[]).length,1);
 for(const c of catalogs){
  assert(html.includes('data-source-catalog="'+c.id+'"'));
  for(const key of ['events_url','manifest_url']){assert(fs.existsSync('system/dist/'+c[key]));assert(html.includes('href="'+c[key]+'" download'));}
  assert(html.includes(c.sha256));
 }
 assert.equal((html.match(/source-timeline/g)||[]).length,4);
 for(const match of html.matchAll(/style="left:([\d.]+)%;width:([\d.]+)%"/g))assert(Number(match[1])>=0&&Number(match[1])+Number(match[2])<=100.000001);
});

test('source-specific profiles preserve the SSN and NRCan measurement limits',()=>{
 const ssn=catalogs.find(c=>c.provider==='ssn'),ca=catalogs.find(c=>c.provider==='nrcan');
 const ssnManifest=JSON.parse(fs.readFileSync('system/dist/'+ssn.manifest_url,'utf8'));
 const caManifest=JSON.parse(fs.readFileSync('system/dist/'+ca.manifest_url,'utf8'));
 assert.equal(ssn.identifier_kind,'derived_row_key');assert.equal(ssn.depth_unit,'km');
 assert.equal(caManifest.depth_unit_status,'not_documented_in_source');
 assert(W.profile(ssn,'en').limit.includes('Magnitude type is unreported'));
 assert(W.profile(ssn,'en').limit.includes('2026 is partial'));
 assert(W.profile(ssn,'en').purpose.includes('offshore'));
 assert(W.profile(ssn,'en').adapter.includes('derived row key'));
 assert(W.profile(ca,'en').limit.includes('excluded from km summaries and depth filters'));
 assert(W.profile(ca,'en').adapter.includes('raw depth preserved'));
 assert.equal(ssnManifest.packaged_records,ssn.event_count);
});

test('USGS profiles distinguish a common regional window from a separate revision pilot',()=>{
 const na=W.profile(catalogs.find(c=>c.id==='usgs-na-2020-2025'),'en');
 const mx=W.profile(catalogs.find(c=>c.id==='usgs-mx-historical'),'en');
 assert(na.purpose.includes('same 2020–2025 window'));assert(na.limit.includes('does not establish completeness'));
 assert(mx.purpose.includes('revisions separately'));assert(mx.limit.includes('retain both source rows'));
});

test('both interface languages retain scientific identifiers, source counts and explicit contracts',()=>{
 for(const lang of ['en','es']){
  const html=W.cards(catalogs,{lang});
  assert(html.includes(lang==='es'?'Contrato computacional':'Computational contract'));
  assert(html.includes(lang==='es'?'filas de origen':'source rows'));
  for(const c of catalogs){assert(html.includes(c.id));assert(html.includes(new Intl.NumberFormat(lang).format(c.event_count)));assert(W.profile(c,lang).limit);}
 }
});

test('catalogue labels and identifiers are encoded in generated HTML without changing the source value',()=>{
 const c={...catalogs[0],id:'test-"<id>',label:{en:'<img src=x onerror=alert(1)>'}},before=JSON.stringify(c);
 const html=W.cards([c],{lang:'en'}),inputs=W.inputs([c],'en',c.id);
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));
 assert(inputs.includes('test-&quot;&lt;id&gt;'));assert.equal(JSON.stringify(c),before);
});
console.log(JSON.stringify({passed:checks}));
