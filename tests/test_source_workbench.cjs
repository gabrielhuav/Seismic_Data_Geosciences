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
test('four catalogue identities remain stable across ordering, active selection and interface language without merging the two USGS inputs',()=>{
 const expected={'usgs-na-2020-2025':['01','#2563eb','circle'],'usgs-mx-historical':['02','#7c3aed','square'],'nrcan-ca-historical':['03','#c28112','triangle'],'ssn-mx-historical':['04','#0d9471','diamond']};
 for(const c of [...catalogs].reverse()){
  const s=W.identity(c.id);assert.deepEqual([s.code,s.color,s.shape],expected[c.id]);
  for(const lang of ['en','es'])for(const html of [W.cards([c],{lang,active:c.id}),W.inputs([c],lang,c.id)]){assert(html.includes('--catalogue-color:'+s.color));assert(html.includes('shape-'+s.shape));assert(html.includes(s.code));assert(html.includes('is-active'));}
 }
 assert.notEqual(W.identity(catalogs[0]).color,W.identity(catalogs[1]).color);
 assert.equal(W.identity('unknown').color,'#64748b');
 assert.equal((W.inputs(catalogs,'en','all-catalogs').match(/is-active/g)||[]).length,4);
});
test('aligned coverage tracks expose exact observed bounds and do not invent intervals for unloaded sources',()=>{
 const ranges={'usgs-na-2020-2025':{first:'2020-01-01T01:00:00Z',last:'2025-12-31T23:00:00Z'},'ssn-mx-historical':{first:'1900-01-20T06:33:30Z',last:'2026-11-06T20:31:07Z'}};
 const html=W.timeline(catalogs,{lang:'en',active:'ssn-mx-historical',extent:id=>ranges[id]});
 assert.equal((html.match(/class="source-track(?: is-active)?"/g)||[]).length,4);
 assert.equal((html.match(/<i style="left:/g)||[]).length,2,'Unloaded source windows must not become observed intervals');
 assert(html.includes('2020-01-01 01:00:00 UTC'));assert(html.includes('2026-11-06 20:31:07 UTC'));assert(html.includes('do not imply continuous observations or completeness'));
 assert(html.includes('2026 partial through 6 November'));assert.equal(W.intervalPosition({first:'bad',last:'2026'}),null);
 const position=W.intervalPosition(ranges['ssn-mx-historical']);assert(position.left>0&&position.left<1&&position.width<100);
 assert.equal(W.intervalPosition({first:'2026-01-01',last:'1900-01-01'}),null);
});
test('active source facts retain derived keys, unknown magnitude types and undocumented Canadian depths',()=>{
 const ssn=W.focus(catalogs,{active:'ssn-mx-historical',selectedRows:204,lang:'en'}),canada=W.focus(catalogs,{active:'nrcan-ca-historical',selectedRows:20,lang:'es'});
 assert(ssn.includes('Derived row key; no official event ID supplied'));assert(ssn.includes('Type unreported; not converted to Mw'));assert(ssn.includes('204'));
 assert(canada.includes('Sólo valor crudo; unidad no documentada'));assert(!canada.includes('Kilómetros documentados'));
});
console.log(JSON.stringify({passed:checks}));
