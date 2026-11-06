'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const V = require('../system/dist/view-state.js');
const registry = JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
const catalogs = registry.catalogs;
const options = {catalogs, defaultCatalog:registry.default_catalog_id};
let checks = 0;
const test = (name, run) => {run();checks++;console.log('PASS '+name);};
test('new URLs default to North America while v1 links retain the paper snapshot', () => {
  assert.equal(V.catalogFromURL('https://example.org/',options),'usgs-na-2020-2025');
  assert.equal(V.parseURL('https://example.org/',options).view.filters.yearFrom,2020);
  assert.equal(V.catalogFromURL('https://example.org/?v=1&catalog=nrcan-ca-historical',options),'usgs-mx-historical');
  assert.equal(V.parseURL('https://example.org/?v=1',options).view.filters.yearFrom,1900);
  assert(V.parseURL('https://example.org/?v=2&catalog=unknown',options).invalid.includes('catalog'));
});
test('all catalog selections round-trip with identifiers, bounds and map base', () => {
  for (const c of catalogs) {
    const view = {catalog:c.id,base:'usgs-topo',filters:V.catalogDefaults(c),lang:'en',tab:'catalog',sort:'recent',map:[60,-175,3]};
    const parsed = V.parseURL(V.serialize(view,'https://example.org/'),options);
    assert.deepEqual(parsed.invalid,[]);assert.equal(parsed.view.catalog,c.id);assert.equal(parsed.view.base,view.base);
    assert.deepEqual(parsed.view.filters,view.filters);assert.deepEqual(parsed.view.map,view.map);
  }
  assert.equal(V.validMap([83,-190,1.5]),true);
});
test('search ignores accents only during comparison and preserves source text', () => {
  const events = [{id:'gsc-row1',place:'Québec, México',year:2000,mag:4,depth:null,horizontalError:null,time:'2000'}];
  assert.equal(V.filterEvents(events,{...V.defaults,search:'Quebec'}).length,1);
  assert.equal(V.filterEvents(events,{...V.defaults,search:'MEXICO'}).length,1);
  assert.equal(events[0].place,'Québec, México');
});
test('query identifies active provider, record-key semantics, original bytes and unknown units', () => {
  for (const c of catalogs) {
    const pack = JSON.parse(fs.readFileSync('system/dist/'+c.events_url,'utf8'));
    const manifest = JSON.parse(fs.readFileSync('system/dist/'+c.manifest_url,'utf8'));
    const rows = pack.rows.map(row => Object.fromEntries(pack.fields.map((key,i) => [key,row[i]])));
    const query = V.queryDocument({catalog:c,view:{catalog:c.id,filters:V.catalogDefaults(c),sort:'recent'},
      manifest,assetHashes:{events:c.sha256,manifest:c.manifest_sha256,registry:'registry-hash'},rows,pageURL:'https://example.org/',createdUTC:'2026-11-06T00:00:00Z'});
    assert.equal(query.catalog.id,c.id);assert.equal(query.catalog.provider,c.provider);
    assert.equal(query.input.events_sha256,c.sha256);assert.equal(query.input.registry_sha256,'registry-hash');
    assert.equal(query.result.row_count,c.event_count);
    if(c.provider==='nrcan') {assert.equal(query.input.identifier_kind,'derived_row_key');assert.equal(query.input.depth_unit,null);assert.equal(query.input.packaged_event_type,null);}
    if(c.id==='usgs-na-2020-2025') assert(rows.some(e=>e.longitude>0),'Aleutian longitudes are retained in raw coordinates');
  }
});
test('antimeridian display keeps each ring continuous and leaves all source coordinates unchanged', () => {
  const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('system/dist/map.js','utf8'),context);
  const G=context.window.SeismicMapGeometry;
  assert.equal(G.displayLongitude(175),-185);assert.equal(G.displayLongitude(-175),-175);
  const base=JSON.parse(fs.readFileSync('system/dist/data/basemap.geojson','utf8')), original=JSON.stringify(base);
  for(const feature of base.features) {
    const polygons=feature.geometry.type==='Polygon' ? [feature.geometry.coordinates] : feature.geometry.type==='MultiPolygon' ? feature.geometry.coordinates : [];
    for(const polygon of polygons) {
      const displayed=G.displayPolygon(polygon);
      for(const ring of displayed) {
        for(let i=1;i<ring.length;i++)assert(Math.abs(ring[i][0]-ring[i-1][0])<=180.000001,feature.properties.ADMIN+' ring tears');
        assert(Math.abs(ring[0][0]-ring[ring.length-1][0])<.000001,feature.properties.ADMIN+' ring fails to close');
      }
    }
  }
  assert.equal(JSON.stringify(base),original);
});

// Exercise the asynchronous loader against real packaged bytes, without a browser,
// map tile requests or network access. DOM controls and map behavior are bounded stubs.
class Element {
  constructor(id='') {this.id=id;this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.open=false;this.children=[];this.listeners={};this.textContent='';this.dataset={};}
  append(child) {this.children.push(child);if(this.children.length===1 && child.value!==undefined)this.value=child.value;}
  replaceChildren(...children) {this.children=[];this.value='';for(const child of children)this.append(child);}
  querySelector(selector) {if(selector.includes('__missing__'))return this.children.find(c=>c.value==='__missing__');return null;}
  setAttribute(name,value) {this[name]=value;}
  removeAttribute(name) {delete this[name];}
  addEventListener(type,callback) {(this.listeners[type]??=[]).push(callback);}
  showModal() {this.open=true;}
  close() {this.open=false;for(const callback of this.listeners.close||[])callback();}
}
async function main() {
  const html=fs.readFileSync('system/dist/index.html','utf8'), elements=new Map();
  for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],new Element(match[1]));
  for(const key of Object.keys(V.defaults)) elements.get(key).value=V.defaults[key];
  elements.get('sort').value='recent';elements.get('mapBase').value='local';
  const document={documentElement:{},querySelector:()=>({}),querySelectorAll:()=>[],getElementById:id=>elements.get(id),createElement:()=>new Element(),body:new Element()};
  const location={href:'https://example.org/'};
  const map={records:[],view:[50,-120,3],base:'local',setRecords(rows){this.records=rows;},getView(){return this.view;},setView(v){this.view=v;},setRegion(b){this.region=b;},reset(){this.view=[50,-120,3];},setBase(id){this.base=id;},getBase(){return this.base;},languageChanged(){},resize(){},fitRecords(){}};
  let tamper='', delayed='';
  const fetch=async url=>{
    if(url===delayed)await new Promise(resolve=>setTimeout(resolve,15));
    const bytes=fs.readFileSync('system/dist/'+url);
    const buffer=url===tamper ? Buffer.from(bytes.toString().replace('3.5','3.6')) : bytes;
    return {ok:true,arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)};
  };
  const context={window:{SeismicViewState:V,addEventListener(){}},document,location,history:{replaceState(_,__,url){location.href=url;}},navigator:{},fetch,
    crypto:crypto.webcrypto,TextDecoder,URL,Intl,Blob,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),createSeismicMap:()=>map};
  vm.createContext(context);vm.runInContext(fs.readFileSync('system/dist/i18n.js','utf8'),context);
  vm.runInContext(fs.readFileSync('system/dist/app.js','utf8'),context);
  for(let n=0;n<100 && !vm.runInContext('state.ready || state.loadError',context);n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(vm.runInContext('state.loadError',context),null);
  assert.equal(vm.runInContext('state.events.length',context),14041);assert.equal(vm.runInContext('state.catalog.id',context),'usgs-na-2020-2025');
  assert.equal(new URL(location.href).searchParams.get('v'),'2');checks++;console.log('PASS real-byte default catalog loader');
  await vm.runInContext("loadCatalog('nrcan-ca-historical')",context);
  assert.equal(vm.runInContext('state.events.length',context),6613);assert.equal(elements.get('depthMax').disabled,true);assert.equal(elements.get('depthLegend').hidden,true);
  const id=vm.runInContext('state.events[0].id',context);vm.runInContext('detail('+JSON.stringify(id)+')',context);
  assert(elements.get('detailContent').innerHTML.includes('Clave local derivada'));
  assert(!elements.get('detailContent').innerHTML.includes('earthquake.usgs.gov'));
  assert(elements.get('records').innerHTML.includes('nrcan-local-'));
  const rawDepth=vm.runInContext('state.filtered[0].raw_depth',context);assert(elements.get('records').innerHTML.includes('<td>'+rawDepth+'</td>'));
  checks++;console.log('PASS NRCan metadata, raw depth, source links and absence semantics');
  vm.runInContext('state.cache.clear()',context);delayed=catalogs.find(c=>c.id==='usgs-mx-historical').events_url;
  const pending=vm.runInContext("loadCatalog('usgs-mx-historical')",context);
  for(const name of [...Object.keys(V.defaults),'searchButton','reset','sort','download'])assert.equal(elements.get(name).disabled,true,name+' must be disabled during load');
  for(const name of ['providerSelect','catalogSelect'])assert.equal(elements.get(name).disabled,false,name+' must remain available');
  const tryTyping=(name,text)=>{const control=elements.get(name);if(control.disabled)return false;control.value=text;for(const callback of control.listeners.input||[])callback();return true;};
  assert.equal(tryTyping('search','Alaska'),false,'User cannot enter a query that loading will discard');
  for(const callback of elements.get('searchForm').listeners.submit||[])callback({preventDefault(){}});
  assert.equal(vm.runInContext('state.ready',context),false);await pending;
  assert.equal(elements.get('search').disabled,false);assert.equal(elements.get('searchButton').disabled,false);assert.equal(elements.get('reset').disabled,false);
  assert.equal(tryTyping('search','Oaxaca'),true);for(const callback of elements.get('searchForm').listeners.submit||[])callback({preventDefault(){}});
  assert.equal(vm.runInContext('state.applied.search',context),'Oaxaca');assert(vm.runInContext('state.filtered.length',context)>0);
  checks++;console.log('PASS input is unavailable during loading and works after the package is ready');
  vm.runInContext('state.cache.clear()',context);
  await Promise.all([vm.runInContext("loadCatalog('usgs-mx-historical')",context),vm.runInContext("loadCatalog('nrcan-ca-historical')",context)]);
  assert.equal(vm.runInContext('state.catalog.id',context),'nrcan-ca-historical');assert.equal(vm.runInContext('state.events.length',context),6613);checks++;console.log('PASS last catalog selection wins during asynchronous loads');
  delayed='';tamper=catalogs[0].events_url;vm.runInContext('state.cache.clear()',context);
  await vm.runInContext("loadCatalog('usgs-na-2020-2025')",context);
  assert.equal(vm.runInContext('state.ready',context),false);assert.equal(elements.get('download').disabled,true);assert.equal(elements.get('retry').hidden,false);
  tamper='';await vm.runInContext("loadCatalog('usgs-mx-historical')",context);
  assert.equal(vm.runInContext('state.events.length',context),24994);assert.equal(elements.get('depthMax').disabled,false);checks++;console.log('PASS integrity failure disables exports and another catalog recovers');
  console.log(JSON.stringify({passed:checks},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
