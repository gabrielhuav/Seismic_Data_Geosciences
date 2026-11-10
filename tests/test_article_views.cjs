'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const P=require('../system/dist/article-views.js'),V=require('../system/dist/view-state.js');
const read=p=>JSON.parse(fs.readFileSync('system/dist/'+p,'utf8'));
const registry=read('data/catalogs.json'),geo=read('data/country-index.json'),admin=read('data/admin1-index.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync('system/dist/'+p)).digest('hex');
const options={catalogs:registry.catalogs,defaultCatalog:registry.default_catalog_id,geographyHash:hash('data/country-index.json'),admin1Hash:hash('data/admin1-index.json'),countries:geo.regions.map(r=>r.id),admin1Regions:admin.regions};
const combinedSnapshot='sha256:'+crypto.createHash('sha256').update(JSON.stringify(registry.catalogs.map(c=>[c.id,c.sha256,c.manifest_sha256]))).digest('hex');
function parse(profile){const query=new URLSearchParams(profile.query),c=registry.catalogs.find(c=>c.id===query.get('catalog'));return V.parseURL('https://example.org/?'+profile.query,{...options,snapshot:c?c.snapshot:combinedSnapshot});}
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
test('every figure/panel has an English target and safely rejects unknown IDs',()=>{
  assert.equal(P.ids.length,14);for(const id of P.ids){const link=P.link(id,'https://example.org/Seismic_Data_Geosciences/');const resolved=P.resolve(link);assert.equal(resolved.profile.id,id);assert.equal(new URL(resolved.url).searchParams.get('lang'),'en');assert.equal(resolved.profile.theme,'blue');assert.equal(resolved.profile.appearance,'light');}
  for(const id of ['__proto__','constructor','bad','<script>']){assert.equal(P.get(id),null);assert.equal(P.resolve('https://example.org/?figure='+encodeURIComponent(id)),null);}
  const copy=P.get('5');copy.quick.magMin=9;assert.equal(P.get('5').quick.magMin,3.5);
});
const packs=new Map();function rows(c){if(packs.has(c.id))return packs.get(c.id);const raw=read(c.events_url),ci=geo.catalogs[c.id],ai=admin.catalogs[c.id];const events=raw.rows.map((row,i)=>({...Object.fromEntries(raw.fields.map((k,n)=>[k,row[n]])),year:Number(String(row[raw.fields.indexOf('time')]).slice(0,4)),country_id:ci.country_ids[i],admin1_id:ai.admin1_ids[i]}));packs.set(c.id,events);return events;}
test('saved query pins and geographic selectors validate against retained indexes',()=>{
  for(const id of P.ids){const profile=P.get(id),parsed=parse(profile);assert.deepEqual(parsed.invalid,[],id);assert.equal(parsed.view.tab,profile.tab);assert.equal(parsed.view.lang,'en');}
});
test('all screenshot query counts reproduce directly from original rows and geographic indexes',()=>{
  for(const id of P.ids){const p=P.get(id);if(p.expectedRows===undefined)continue;const f=parse(p).view;const cs=f.catalog==='all-catalogs'?registry.catalogs:registry.catalogs.filter(c=>c.id===f.catalog);let count=0;
    for(const c of cs)for(const e of rows(c)){const x=f.filters;if(e.year>=x.yearFrom&&e.year<=x.yearTo&&e.mag>=x.magMin&&e.mag<=x.magMax&&(!x.country||e.country_id===x.country)&&(!x.admin1||e.admin1_id===x.admin1))count++;}
    assert.equal(count,p.expectedRows,id);
  }
});
test('result-specific state and map context are explicit rather than inferred from global filters',()=>{
  assert.equal(P.get('5').quick.action,'statistics');assert.equal(P.get('5').quick.admin1,'MEX-2729');assert.equal(P.get('9b').history.radiusKm,50);assert.equal(P.get('9b').history.includeOffshore,false);assert.equal(P.get('9b').history.yearFrom,1900);assert.equal(P.get('3-time').sourceView,'time');assert.equal(P.get('6').expanded,true);assert.equal(P.get('6').tectonics,true);
  const html=fs.readFileSync('system/dist/article-figures.html','utf8');for(const id of P.ids)assert(html.includes('href="index.html?figure='+id+'&amp;lang=en"'));
  const svg=fs.readFileSync('system/dist/architecture.svg','utf8');assert(svg.includes('href="index.html?figure=4d&amp;lang=en"'));assert(!svg.includes('href="?figure='));
});
console.log(checks+' article-view groups passed');
