'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const V = require('../system/dist/view-state.js');
const C = require('../system/dist/catalog-composition.js');
const A = require('../system/dist/analytics.js');
const R = require('../system/dist/research-charts.js');
const registry = JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8'));
const catalogs = registry.catalogs;
const options = {catalogs, defaultCatalog:registry.default_catalog_id};
let checks = 0;
const test = (name, run) => {run();checks++;console.log('PASS '+name);};
test('version parser retains North America fallback while v1 links retain the paper snapshot', () => {
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
  constructor(id='') {this.id=id;this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.open=false;this.children=[];this.listeners={};this.textContent='';this.dataset={};this.classes=new Set();this.classList={toggle:(name,on)=>on ? this.classes.add(name) : this.classes.delete(name)};}
  append(child) {this.children.push(child);if(this.children.length===1 && child.value!==undefined)this.value=child.value;}
  replaceChildren(...children) {this.children=[];this.value='';for(const child of children)this.append(child);}
  querySelector(selector) {const option=selector.match(/^option\[value="([^"]*)"\]$/);return option ? this.children.find(child=>child.value===option[1]) : null;}
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
  const documentListeners={};
  const document={documentElement:new Element(),querySelector:()=>({}),querySelectorAll:()=>[],getElementById:id=>elements.get(id),createElement:()=>new Element(),body:new Element(),
    addEventListener(type,callback){(documentListeners[type]??=[]).push(callback);}};
  for(const element of elements.values())element.focus=()=>{document.activeElement=element;};
  elements.get('mapCard').parentElement=document.body;document.body.children=[elements.get('mapCard'),elements.get('catalogSelect')];
  const location={href:'https://example.org/?v=3&catalog=usgs-na-2020-2025'};
  const map={records:[],view:[50,-120,3],base:'local',setRecords(rows){this.records=rows;},getView(){return this.view;},setView(v){this.view=v;},setRegion(b){this.region=b;},reset(){this.view=[50,-120,3];},setBase(id){this.base=id;},getBase(){return this.base;},languageChanged(){},resize(){},fitRecords(){},highlight(id){this.highlighted=id;},focusRecord(id){this.highlighted=id;this.view=[60,-120,5.5];},themeChanged(){}};
  Object.assign(map,{displayMode:'points',contextCountry:'',
    setDisplayMode(mode){this.displayMode=mode;this.onDisplayChange?.(this.getDisplayEvidence());},getDisplayMode(){return this.displayMode;},
    getDisplayEvidence(){return {mode:this.displayMode,selected_rows:this.records.length,visible_rows:this.records.length,counting_unit:'visible source rows'};},
    setAdmin1Context({countryId}){this.contextCountry=countryId;},clearAdmin1(){this.contextCountry='';},
    setAdmin1({countryId,selectedId}){this.contextCountry='';this.admin1Country=countryId;this.selectedAdmin1=selectedId;}});
  let tamper='', delayed='';const fetchCounts=new Map();
  const fetch=async url=>{
    fetchCounts.set(url,(fetchCounts.get(url)||0)+1);
    if(url===delayed)await new Promise(resolve=>setTimeout(resolve,15));
    const bytes=fs.readFileSync('system/dist/'+url);
    const buffer=url===tamper ? Buffer.from(bytes.toString().replace('3.5','3.6')) : bytes;
    return {ok:true,arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)};
  };
  const context={window:{SeismicViewState:V,SeismicCatalogComposition:C,SeismicAnalytics:A,SeismicResearchCharts:R,SeismicDiagnostics:require('../system/dist/diagnostics.js'),SeismicExportPackage:require('../system/dist/export-package.js'),addEventListener(){}},document,location,history:{replaceState(_,__,url){location.href=url;}},navigator:{},fetch,
    crypto:crypto.webcrypto,TextDecoder,TextEncoder,URL,Intl,Blob,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),createSeismicMap:options=>{map.onDisplayChange=options.onDisplayChange;return map;}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('system/dist/i18n.js','utf8'),context);
  vm.runInContext(fs.readFileSync('system/dist/source-workbench.js','utf8'),context);
  context.window.document=document;context.window.localStorage={getItem:()=>null,setItem(){}};
  vm.runInContext(fs.readFileSync('system/dist/preferences.js','utf8'),context);
  vm.runInContext(fs.readFileSync('system/dist/app.js','utf8'),context);
  for(let n=0;n<100 && !vm.runInContext('state.ready || state.loadError',context);n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(vm.runInContext('state.loadError',context),null);
  assert.equal(vm.runInContext('state.events.length',context),14041);assert.equal(vm.runInContext('state.catalog.id',context),'usgs-na-2020-2025');
  assert.equal(new URL(location.href).searchParams.get('v'),'3');checks++;console.log('PASS real-byte default catalog loader');
  for(const [name,value] of [['yearFrom','2025'],['magMin','4.5']]) {
    const control=elements.get(name);control.value=value;
    for(const callback of control.listeners.input||[])callback();
    assert.equal(elements.get('download').disabled,true,'Exports must be unavailable while numeric input is pending');
    assert.equal((control.listeners.change||[]).length,0,'Numeric controls must not also apply through change');
  }
  await new Promise(resolve=>setTimeout(resolve,160));
  assert.equal(vm.runInContext('state.applied.yearFrom',context),2025);assert.equal(vm.runInContext('state.applied.magMin',context),4.5);
  assert(vm.runInContext('state.filtered.length>0 && state.filtered.length<14041',context));
  for(const key of ['yearFrom','magMin'])assert(elements.get('activeFilters').innerHTML.includes('data-remove-filter="'+key+'"'));
  assert.equal(new URL(location.href).searchParams.get('from'),'2025');assert.equal(new URL(location.href).searchParams.get('min'),'4.5');assert.equal(elements.get('download').disabled,false);
  elements.get('magMin').value='';for(const callback of elements.get('magMin').listeners.input)callback();
  assert.equal(elements.get('download').disabled,true);await new Promise(resolve=>setTimeout(resolve,160));
  assert.equal(elements.get('download').disabled,true);assert(elements.get('filterError').textContent);assert.equal(vm.runInContext('state.applied.magMin',context),4.5);
  vm.runInContext('writeFilters(V.catalogDefaults(state.catalog));applyFilters()',context);
  checks++;console.log('PASS numeric input immediately invalidates exports and updates selection, URL and chips after validation');
  const before=vm.runInContext('JSON.stringify(currentView().filters)',context), beforeRows=vm.runInContext('state.filtered.map(e=>e.id).join()',context), beforeURL=location.href;
  context.window.SeismicPreferences.set({theme:'maroon',mode:'dark'});
  assert.equal(vm.runInContext('JSON.stringify(currentView().filters)',context),before);assert.equal(vm.runInContext('state.filtered.map(e=>e.id).join()',context),beforeRows);assert.equal(location.href,beforeURL);
  checks++;console.log('PASS appearance preferences do not change scientific selection, row order or URL');
  vm.runInContext("writeFilters({...V.catalogDefaults(state.catalog),magType:'mww',originSource:'us'});applyFilters()",context);
  const rawOptions=JSON.stringify(['magType','originSource'].map(name=>elements.get(name).children.map(option=>option.value)));
  const selectedRows=vm.runInContext('state.filtered.map(e=>e.id).join()',context);
  for(const [lang,allTypes,allOrigins,missing] of [['en','All reported types','All origin agencies','Not reported'],['es','Todos los tipos reportados','Todas las agencias de origen','No reportado']]) {
    vm.runInContext('changeLanguage('+JSON.stringify(lang)+')',context);
    assert.equal(elements.get('magType').querySelector('option[value=""]').textContent,allTypes);
    assert.equal(elements.get('originSource').querySelector('option[value=""]').textContent,allOrigins);
    assert.equal(elements.get('magType').querySelector('option[value="__missing__"]').textContent,missing);
    assert.equal(elements.get('magType').value,'mww');assert.equal(elements.get('originSource').value,'us');
    assert.equal(JSON.stringify(['magType','originSource'].map(name=>elements.get(name).children.map(option=>option.value))),rawOptions);
    for(const name of ['magType','originSource'])for(const option of elements.get(name).children)if(option.value && option.value!=='__missing__')assert.equal(option.textContent,option.value);
    assert.equal(vm.runInContext('state.filtered.map(e=>e.id).join()',context),selectedRows);
  }
  vm.runInContext('writeFilters(V.catalogDefaults(state.catalog));applyFilters()',context);
  checks++;console.log('PASS ES/EN filter option labels update while selected values, raw codes and row selection stay unchanged');
  await vm.runInContext("loadCatalog('nrcan-ca-historical')",context);
  assert.equal(vm.runInContext('state.events.length',context),6613);assert.equal(elements.get('depthMax').disabled,true);assert.equal(elements.get('depthLegend').hidden,true);
  const id=vm.runInContext('state.events[0].id',context);vm.runInContext('detail('+JSON.stringify(id)+')',context);
  assert(elements.get('detailContent').innerHTML.includes('Clave local derivada'));
  assert(!elements.get('detailContent').innerHTML.includes('earthquake.usgs.gov'));
  assert(elements.get('records').innerHTML.includes('nrcan-local-'));
  const rawDepth=vm.runInContext('state.filtered[0].raw_depth',context);assert(elements.get('records').innerHTML.includes('<td>'+rawDepth+'</td>'));
  checks++;console.log('PASS NRCan metadata, raw depth, source links and absence semantics');
  const sharedCatalog=catalogs.find(c=>c.id==='usgs-mx-historical');
  vm.runInContext('state.cache.clear()',context);delayed=sharedCatalog.events_url;
  const previousFetches=fetchCounts.get(sharedCatalog.events_url)||0,previousManifests=fetchCounts.get(sharedCatalog.manifest_url)||0;
  const sharedPacks=await Promise.all([vm.runInContext("loadPackage(state.registry.catalogs.find(c=>c.id==='usgs-mx-historical'))",context),vm.runInContext("loadPackage(state.registry.catalogs.find(c=>c.id==='usgs-mx-historical'))",context)]);
  assert.equal(sharedPacks[0],sharedPacks[1],'Concurrent callers share the verified package object');
  assert.equal(fetchCounts.get(sharedCatalog.events_url),previousFetches+1);assert.equal(fetchCounts.get(sharedCatalog.manifest_url),previousManifests+1);
  assert.equal(vm.runInContext('state.packageLoads.size',context),0);
  checks++;console.log('PASS concurrent catalogue loads share one download, validation and cached package');
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
  assert.equal(vm.runInContext('state.packageLoads.size',context),0,'A failed shared load must remain retryable');
  tamper='';await vm.runInContext("loadCatalog('usgs-mx-historical')",context);
  assert.equal(vm.runInContext('state.events.length',context),24994);assert.equal(elements.get('depthMax').disabled,false);checks++;console.log('PASS integrity failure disables exports and another catalog recovers');
  const adminHash=crypto.createHash('sha256').update(fs.readFileSync('system/dist/data/admin1-index.json')).digest('hex');
  // The Mexico-region map now loads subdivision context without applying a
  // country filter. Deep-link restoration must still enrich active packages.
  assert.equal(vm.runInContext('!!state.admin1',context),true);
  vm.runInContext('state.cache.clear()',context); // Keep the active package outside the cache to exercise enrichment.
  location.href=vm.runInContext('V.serialize({...currentView(),filters:{...V.catalogDefaults(state.catalog),country:"MEX",admin1:"MEX-2727"},admin1Geography:'+JSON.stringify(adminHash)+'},"https://example.org/")',context);
  await vm.runInContext('restoreLocation()',context);
  assert.equal(vm.runInContext('state.applied.admin1',context),'MEX-2727');assert.equal(elements.get('admin1').value,'MEX-2727');
  assert(elements.get('admin1').children.some(o=>o.value==='MEX-2727'),'The target country options must exist before restoration');
  assert(vm.runInContext('state.activePacks[0].events.every(e=>typeof e.admin1_id==="string")',context));
  assert(vm.runInContext('state.filtered.length>0 && state.filtered.every(e=>e.country_id==="MEX" && e.admin1_id==="MEX-2727")',context));
  assert.equal(new URL(location.href).searchParams.get('v'),'5');assert.equal(new URL(location.href).searchParams.get('adh'),adminHash);
  assert(elements.get('activeFilters').innerHTML.includes('Ciudad de México'),'Administrative chips expose human-readable labels');
  const expectedScope=vm.runInContext("V.filterEvents(state.events,{...state.applied,country:'',admin1:''},'recent')",context);
  const expectedAccounting=context.window.SeismicI18n.t('countryExcluded',{n:new Intl.NumberFormat('es').format(expectedScope.length-vm.runInContext('state.filtered.length',context)),outside:new Intl.NumberFormat('es').format(expectedScope.filter(e=>e.country_id==='outside').length)});
  assert.equal(elements.get('geographyAccounting').textContent,expectedAccounting);
  vm.runInContext("writeFilters({...state.applied,admin1:''});applyFilters()",context);
  const administrativeSQL=vm.runInContext('getSQLContext()',context);
  assert.equal(administrativeSQL.evidence.schema,'seismic-local-query/4');assert.equal(administrativeSQL.evidence.geography.admin1.index_sha256,adminHash);
  assert.equal(administrativeSQL.evidence.geography.admin1.selected_admin1,null);
  assert(administrativeSQL.records.some(e=>e.admin1_id==='MEX-2727'));
  checks++;console.log('PASS v5 navigation loads subdivisions, restores populated controls and retains SQL derivation hashes without a state filter');
  const savedAdministrativeFilters=vm.runInContext('({...state.applied})',context);
  const independentAdmin=JSON.parse(fs.readFileSync('system/dist/data/admin1-index.json','utf8'));
  const independentCountry=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
  const independentMexico=JSON.parse(fs.readFileSync('system/dist/'+sharedCatalog.events_url,'utf8'));
  const mexicoColumns=Object.fromEntries(independentMexico.fields.map((key,i)=>[key,i]));
  const administrativeCounts=min=>{
    const result=new Map();
    independentMexico.rows.forEach((row,i)=>{
      if(independentCountry.catalogs[sharedCatalog.id].country_ids[i]!=='MEX' || Number(row[mexicoColumns.time].slice(0,4))<2010 || Number(row[mexicoColumns.time].slice(0,4))>2025 || row[mexicoColumns.mag]<min || row[mexicoColumns.magType]!=='mww')return;
      const id=independentAdmin.catalogs[sharedCatalog.id].admin1_ids[i];result.set(id,(result.get(id)||0)+1);
    });
    return result;
  };
  const assertAdministrativeCounts=expected=>{
    for(const option of elements.get('admin1').children){
      if(!option.value)continue;
      const n=expected.get(option.value)||0,formatted=new Intl.NumberFormat(context.window.SeismicI18n.language).format(n);
      assert(option.textContent.endsWith(' · '+formatted),option.value+' must display the currently filtered country count '+formatted);
    }
  };
  const filteredAdministrativeCounts=administrativeCounts(4.5);
  assert([...filteredAdministrativeCounts].filter(([id,n])=>!id.startsWith('admin1-') && n>0).length>1,'The oracle must cover multiple subdivisions');
  vm.runInContext("writeFilters({...V.catalogDefaults(state.catalog),country:'MEX',yearFrom:2010,yearTo:2025,magMin:4.5,magType:'mww'});applyFilters()",context);
  assertAdministrativeCounts(filteredAdministrativeCounts);
  const selectedAdministrativeId=[...filteredAdministrativeCounts].find(([id,n])=>!id.startsWith('admin1-') && n>0)[0];
  vm.runInContext('writeFilters({...state.applied,admin1:'+JSON.stringify(selectedAdministrativeId)+'});applyFilters()',context);
  assertAdministrativeCounts(filteredAdministrativeCounts);
  assert.equal(vm.runInContext('state.filtered.length',context),filteredAdministrativeCounts.get(selectedAdministrativeId));
  vm.runInContext('writeFilters({...state.applied,magMin:6.5});applyFilters()',context);
  assertAdministrativeCounts(administrativeCounts(6.5));
  vm.runInContext('writeFilters('+JSON.stringify(savedAdministrativeFilters)+');applyFilters()',context);
  checks++;console.log('PASS subdivision option counts follow common year magnitude and type filters while ignoring only the selected subdivision');
  vm.runInContext("writeFilters({...V.defaults,search:'Oaxaca',yearFrom:2000,yearTo:2025,magMin:4,magMax:8,magType:'mww',originSource:'us',depthMax:100,missingOnly:true,unmOnly:true,country:'MEX',admin1:'MEX-2727'});applyFilters()",context);
  for(const key of Object.keys(V.defaults))assert(elements.get('activeFilters').innerHTML.includes('data-remove-filter="'+key+'"'),'Missing active filter chip '+key);
  vm.runInContext("removeFilter('search')",context);assert.equal(vm.runInContext('state.applied.search',context),'');
  vm.runInContext("writeFilters(V.catalogDefaults(state.catalog));applyFilters()",context);
  assert.equal(elements.get('activeFilters').hidden,true);checks++;console.log('PASS every active filter control has a removable chip and resets cleanly');
  const count=vm.runInContext('state.filtered.length',context), selected=vm.runInContext('state.filtered[41].id',context);
  vm.runInContext('showOnMap('+JSON.stringify(selected)+')',context);
  assert.equal(map.highlighted,selected);assert.equal(vm.runInContext('state.page',context),1);assert.equal(vm.runInContext('state.filtered.length',context),count);
  assert(elements.get('records').innerHTML.includes('record-selected'));checks++;console.log('PASS locating a record highlights map and table without changing filters or counts');
  elements.get('expandMap').focus();vm.runInContext('setExpanded(true)',context);
  assert.equal(elements.get('mapCard')['aria-modal'],'true');assert.equal(elements.get('catalogSelect').inert,true);
  for(const callback of documentListeners.keydown)callback({key:'Escape',preventDefault(){}});
  assert.equal(vm.runInContext('state.expanded',context),false);assert.equal(elements.get('catalogSelect').inert,undefined);assert.equal(document.activeElement,elements.get('expandMap'));
  checks++;console.log('PASS expanded map closes with Escape and restores outside interaction and focus');
  const chooseSource=async value=>{
    elements.get('providerSelect').value=value;
    await Promise.all((elements.get('providerSelect').listeners.change||[]).map(callback=>callback()));
  };
  await vm.runInContext("loadCatalog('usgs-na-2020-2025')",context);
  assert.equal(elements.get('unmOnly').disabled,true);
  assert.equal(V.filterEvents(vm.runInContext('state.events',context),{...V.catalogDefaults(catalogs[0]),unmOnly:true}).length,0);
  await chooseSource('ssn-unam');
  assert.equal(vm.runInContext('state.catalog.id',context),'usgs-mx-historical');
  assert.equal(vm.runInContext('state.catalog.provider',context),'usgs');
  assert.equal(vm.runInContext('state.filtered.length',context),9858);assert.equal(vm.runInContext('state.applied.unmOnly',context),true);
  assert.equal(elements.get('providerSelect').value,'ssn-unam');assert.equal(elements.get('catalogSelect').children.length,1);
  assert.equal(elements.get('unmNotice').hidden,false);assert.equal(elements.get('unmOnly').disabled,false);
  assert(elements.get('activeFilters').innerHTML.includes('data-remove-filter="unmOnly"'));
  const ssnURL=location.href;
  const query=JSON.parse(vm.runInContext("JSON.stringify(V.queryDocument({view:currentView(),catalog:state.catalog,manifest:state.manifest,assetHashes:state.hashes,rows:state.filtered,pageURL:location.href}))",context));
  assert.equal(query.schema,'seismic-local-query/3');assert.equal(query.catalog.provider,'usgs');assert.equal(query.catalog.id,'usgs-mx-historical');
  const mx=catalogs.find(c=>c.id==='usgs-mx-historical');
  assert.equal(query.input.events_sha256,mx.sha256);assert.equal(query.input.manifest_sha256,mx.manifest_sha256);
  assert.equal(query.input.registry_sha256,crypto.createHash('sha256').update(fs.readFileSync('system/dist/data/catalogs.json')).digest('hex'));
  assert.equal(query.selection.unmOnly,true);assert.equal(query.result.row_count,9858);
  assert.deepEqual(query.predicate_rules.unmOnly.fields,['locationSource','magSource']);
  assert.deepEqual(query.predicate_rules.unmOnly.accepted_literal_codes,['unm','us_unm']);assert.equal(query.predicate_rules.unmOnly.operator,'OR');
  for(const language of ['en','es']) {
    vm.runInContext('changeLanguage('+JSON.stringify(language)+')',context);
    assert.equal(elements.get('providerSelect').value,'ssn-unam');assert.equal(vm.runInContext('state.filtered.length',context),9858);
  }
  checks++;console.log('PASS visible SSN source loads Mexico, exact 9858-row union and USGS query provenance');
  for(const callback of elements.get('activeFilters').listeners.click)callback({target:{closest:()=>({dataset:{removeFilter:'unmOnly'}})}});
  assert.equal(vm.runInContext('state.filtered.length',context),24994);assert.equal(elements.get('providerSelect').value,'usgs');
  assert.equal(vm.runInContext('state.catalog.id',context),mx.id);assert.equal(elements.get('catalogSelect').children.length,2);
  assert.equal(vm.runInContext('state.applied.unmOnly',context),false);assert.equal(elements.get('unmNotice').hidden,true);
  await chooseSource('nrcan');location.href=ssnURL;await vm.runInContext('restoreLocation()',context);
  assert.equal(vm.runInContext('state.filtered.length',context),9858);assert.equal(elements.get('providerSelect').value,'ssn-unam');
  location.href='https://example.org/?v=2&catalog=usgs-mx-historical';await vm.runInContext('restoreLocation()',context);
  assert.equal(vm.runInContext('state.filtered.length',context),24994);assert.equal(vm.runInContext('state.applied.unmOnly',context),false);
  checks++;console.log('PASS removing SSN chip restores USGS Mexico and v3 restores across providers without changing v2');
  delayed=mx.events_url;vm.runInContext('state.cache.clear()',context);
  await Promise.all([chooseSource('ssn-unam'),chooseSource('nrcan')]);
  assert.equal(vm.runInContext('state.catalog.provider',context),'nrcan');assert.equal(vm.runInContext('state.applied.unmOnly',context),false);
  assert.equal(elements.get('providerSelect').value,'nrcan');assert.equal(elements.get('unmOnly').disabled,true);
  assert.equal(vm.runInContext('state.filtered.length',context),6613);
  delayed='';tamper=mx.events_url;vm.runInContext('state.cache.clear()',context);await chooseSource('ssn-unam');
  assert.equal(vm.runInContext('state.ready',context),false);assert.equal(elements.get('download').disabled,true);
  tamper='';await Promise.all(elements.get('retry').listeners.click.map(callback=>callback()));
  assert.equal(vm.runInContext('state.filtered.length',context),9858);assert.equal(elements.get('providerSelect').value,'ssn-unam');
  await chooseSource('usgs');assert.equal(vm.runInContext('state.filtered.length',context),24994);
  await chooseSource('ssn-unam');for(const callback of elements.get('reset').listeners.click)callback();
  assert.equal(vm.runInContext('state.filtered.length',context),24994);assert.equal(elements.get('providerSelect').value,'usgs');
  checks++;console.log('PASS SSN load races, integrity failure, retry, ordinary source selection and reset preserve filter semantics');
  const nativeSsn=catalogs.find(c=>c.id==='ssn-mx-historical');assert(nativeSsn,'The native SSN catalog must be packaged before release');
  vm.runInContext("changeLanguage('es')",context);
  await chooseSource('ssn');
  assert.equal(vm.runInContext('state.catalog.id',context),nativeSsn.id);assert.equal(vm.runInContext('state.catalog.provider',context),'ssn');
  assert.equal(vm.runInContext('state.filtered.length',context),nativeSsn.event_count);assert.equal(vm.runInContext('state.applied.unmOnly',context),false);
  assert.equal(elements.get('providerSelect').value,'ssn');assert.equal(elements.get('ssnNotice').hidden,false);assert.equal(elements.get('unmNotice').hidden,true);
  assert.equal(elements.get('unmOnly').disabled,true);assert.equal(elements.get('depthMax').disabled,false);assert.equal(elements.get('unmCount').textContent,'No reportado');
  assert(elements.get('providerSelect').children.some(option=>option.value==='ssn-unam' && option.textContent.includes('1990–2017')));
  const nativeRow=JSON.parse(vm.runInContext('JSON.stringify(state.events[0])',context));
  for(const key of ['magType','event_type','locationSource','magSource','net','updated'])assert.equal(nativeRow[key],null,key+' must remain unknown');
  assert.equal(nativeRow.status,nativeRow.raw_status);assert(Number.isInteger(nativeRow.source_record));
  checks++;console.log('PASS native SSN is a separate distributor with documented depth and explicit absent authors/types');
  vm.runInContext('detail('+JSON.stringify(nativeRow.id)+')',context);
  const nativeDetails=elements.get('detailContent').innerHTML;
  assert(nativeDetails.includes('Clave local derivada'));assert(nativeDetails.includes('Estatus literal de la fuente'));assert(nativeDetails.includes('Fila original de datos'));
  assert(nativeDetails.includes('Campos crudos conservados'));assert(nativeDetails.includes('Abrir consulta oficial SSN'));
  assert(nativeDetails.includes('https://doi.org/10.21766/SSNMX/EC/MX'));assert(nativeDetails.includes('CSV íntegro conservado'));
  assert(nativeDetails.includes('https://github.com/gabrielhuav/Seismic_Data_Geosciences/blob/main/research-data/catalogs/ssn-mx/ssn_19000101_20261106.csv'));
  assert(nativeDetails.includes(nativeSsn.sha256)===false,'Raw-file hash must not be confused with derived asset hash');
  assert(nativeDetails.includes(vm.runInContext('state.manifest.files[0].sha256',context)));
  assert(!nativeDetails.includes('earthquake.usgs.gov'));assert(!nativeDetails.includes('CSV crudo fijado'));
  for(const key of ['raw_utc_date','raw_utc_time','raw_local_date','raw_local_time','raw_magnitude','raw_depth','raw_status'])assert(nativeDetails.includes('('+key+')'));
  assert(nativeDetails.includes('(tipo desconocido)'));assert(nativeDetails.includes('no equivale al estado reviewed'));
  checks++;console.log('PASS native SSN inspector exposes raw values, original-row hash and official source without fabricated USGS event routes');
  for(const [language,rawLabel,statusLabel] of [['en','Retained raw CSV fields','Literal source status'],['es','Campos crudos conservados del CSV','Estatus literal de la fuente']]) {
    vm.runInContext('changeLanguage('+JSON.stringify(language)+')',context);
    assert.equal(elements.get('providerSelect').value,'ssn');assert.equal(vm.runInContext('state.filtered.length',context),nativeSsn.event_count);
    assert(elements.get('detailContent').innerHTML.includes(rawLabel));assert(elements.get('detailContent').innerHTML.includes(statusLabel));
    assert.equal(vm.runInContext('state.events[0].status',context),nativeRow.raw_status);
    for(const key of ['rawUtcDate','rawUtcTime','rawLocalDate','rawLocalTime','rawMagnitude','rawDepth','rawStatus','sourceRow','ssnStatusNote'])assert(Object.hasOwn(context.window.SeismicI18n.messages[language],key));
  }
  checks++;console.log('PASS native SSN labels switch ES/EN without changing source status, fields or catalog selection');
  const ssnCoverageNote=elements.get('ssnNotice').textContent;assert(ssnCoverageNote.includes('402.082'));assert(ssnCoverageNote.includes('17.649'));assert(ssnCoverageNote.includes('Último origen'));
  vm.runInContext('writeFilters({...V.catalogDefaults(state.catalog),search:'+JSON.stringify(nativeRow.id)+'});applyFilters();download=(blob,name)=>{globalThis.savedDownload={blob,name};};exportCsv()',context);
  assert.equal(elements.get('ssnNotice').textContent,ssnCoverageNote,'Filtering must retain source cutoff and magnitude exclusions');
  assert.equal(vm.runInContext('state.filtered.length',context),1);
  const csvText=await context.savedDownload.blob.text();assert.equal(context.savedDownload.name,nativeSsn.id+'_filtered_snapshot.csv');
  const csvLines=csvText.replace(/^\uFEFF/,'').split('\r\n'),csvKeys=csvLines[0].split(',');
  const csvValues=[...csvLines[1].matchAll(/(?:^|,)"((?:[^"]|"")*)"/g)].map(match=>match[1].replace(/""/g,'"'));
  assert.equal(csvKeys.length,csvValues.length);
  const csvRow=Object.fromEntries(csvKeys.map((key,i)=>[key,csvValues[i]]));
  for(const key of ['source_record','raw_utc_date','raw_utc_time','raw_local_date','raw_local_time','raw_magnitude','raw_depth','raw_status','time','status'])assert.equal(csvRow[key],String(nativeRow[key]));
  for(const key of ['magType','event_type','locationSource','magSource','updated'])assert.equal(csvRow[key],'');
  vm.runInContext('exportQuery()',context);const nativeQuery=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(nativeQuery.catalog.provider,'ssn');assert.equal(nativeQuery.input.identifier_kind,'derived_row_key');assert.equal(nativeQuery.input.depth_unit,'km');assert.equal(nativeQuery.input.packaged_event_type,null);
  assert.equal(nativeQuery.input.events_sha256,nativeSsn.sha256);assert.equal(nativeQuery.input.manifest_sha256,nativeSsn.manifest_sha256);assert.equal(nativeQuery.result.row_count,1);assert.deepEqual(nativeQuery.result.ordered_event_ids,[nativeRow.id]);
  for(const key of ['source_header','query','time_basis','source_timing','selection','transformations'])assert.deepEqual(nativeQuery.input[key],JSON.parse(vm.runInContext('JSON.stringify(state.manifest['+JSON.stringify(key)+'])',context)));
  const nativeUrl=location.href;await chooseSource('ssn-unam');location.href=nativeUrl;await vm.runInContext('restoreLocation()',context);
  assert.equal(vm.runInContext('state.catalog.provider',context),'ssn');assert.equal(vm.runInContext('state.filtered.length',context),1);assert.equal(elements.get('providerSelect').value,'ssn');
  vm.runInContext("writeFilters({...V.catalogDefaults(state.catalog),search:'no-match-native-ssn-fixture'});applyFilters();exportQuery()",context);
  const emptyNativeQuery=JSON.parse(await context.savedDownload.blob.text());assert.equal(emptyNativeQuery.result.row_count,0);assert.deepEqual(emptyNativeQuery.input.raw_fields,nativeQuery.input.raw_fields);
  checks++;console.log('PASS native SSN CSV/JSON preserve raw UTC/local/status fields and hashes, with v3 restoration distinct from UNM via USGS');

  await chooseSource('all');
  assert.equal(vm.runInContext('state.catalog.id',context),'all-catalogs');
  assert.equal(vm.runInContext('state.filtered.length',context),287936);
  assert.equal(vm.runInContext('state.composition.usgs_shared_event_ids',context),2163);
  assert.equal(new URL(location.href).searchParams.get('v'),'4');
  assert.equal(elements.get('combinedNotice').hidden,false);
  assert(!elements.get('datasetDescription').textContent.includes('0 CSV'));
  assert.equal(elements.get('manifestLink').href,'data/catalogs.json');
  assert.equal(elements.get('country').children.length,51);
  checks++;console.log('PASS all sources load 287936 preserved rows with per-source provenance and flagged shared USGS IDs');
  const geography=JSON.parse(fs.readFileSync('system/dist/data/country-index.json','utf8'));
  const countryCount=id=>Object.values(geography.catalogs).reduce((n,c)=>n+(c.counts[id]||0),0);
  for(const country of ['MEX','USA','CAN','outside','boundary']) {
    vm.runInContext('writeFilters({...V.catalogDefaults(state.catalog),country:'+JSON.stringify(country)+'});applyFilters()',context);
    assert.equal(vm.runInContext('state.filtered.length',context),countryCount(country));
    assert.equal(vm.runInContext('state.filtered.every(e=>e.country_id==='+JSON.stringify(country)+')',context),true);
    assert.equal(new URL(location.href).searchParams.get('country'),country);
    assert.equal(elements.get('download').disabled,false);
  }
  checks++;console.log('PASS country and outside/boundary filters match the independent sidecar counts across all four catalogs');
  const expectedGeoHash=crypto.createHash('sha256').update(fs.readFileSync('system/dist/data/country-index.json')).digest('hex');
  vm.runInContext("writeFilters({...V.catalogDefaults(state.catalog),country:'CAN'});applyFilters();exportQuery()",context);
  const combinedQuery=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(combinedQuery.schema,'seismic-local-query/4');assert.equal(combinedQuery.input_catalogs.length,4);
  assert.equal(combinedQuery.inputs.length,4);assert.equal(combinedQuery.geography.index_sha256,expectedGeoHash);
  assert.equal(combinedQuery.geography.geometry_sha256,geography.geometry_sha256);
  assert.equal(combinedQuery.result.row_count,countryCount('CAN'));
  assert.deepEqual(combinedQuery.result.ordered_event_ids,JSON.parse(vm.runInContext('JSON.stringify(state.filtered.map(e=>e.id))',context)));
  for(const input of combinedQuery.input_catalogs){const c=catalogs.find(c=>c.id===input.id);assert.equal(input.events_sha256,c.sha256);assert.equal(input.manifest_sha256,c.manifest_sha256);}
  vm.runInContext('exportCsv()',context);const combinedCsv=await context.savedDownload.blob.text();
  const combinedColumns=combinedCsv.replace(/^\uFEFF/,'').split('\r\n')[0].split(',');
  for(const name of ['id','source_event_id','catalog_id','data_provider','source_identifier_kind','country_id','depth_unit'])assert(combinedColumns.includes(name));
  assert.equal(combinedCsv.split('\r\n').length-1,countryCount('CAN'));
  const savedCombined=location.href;
  checks++;console.log('PASS combined CSV and JSON retain actual ordered composite keys, four source inputs/eight hashes and spatial evidence');
  vm.runInContext('writeFilters(V.catalogDefaults(state.catalog));applyFilters()',context);
  for(const provider of ['ssn','nrcan','usgs']) {
    const e=JSON.parse(vm.runInContext('JSON.stringify(state.events.find(e=>e.data_provider==='+JSON.stringify(provider)+'))',context));
    const c=catalogs.find(c=>c.id===e.catalog_id);
    vm.runInContext('detail('+JSON.stringify(e.id)+')',context);
    const content=elements.get('detailContent').innerHTML;
    assert(content.includes(e.source_event_id));assert(content.includes(c.provider_name));assert(content.includes(c.manifest_url));
    const m=JSON.parse(fs.readFileSync('system/dist/'+c.manifest_url,'utf8')),spec=m.files.find(f=>f.path===e.file);assert(content.includes(spec.sha256));
    if(provider!=='usgs')assert(!content.includes('earthquake.usgs.gov/earthquakes/eventpage/'));
    if(provider==='nrcan')assert(content.includes(context.window.SeismicI18n.t('reportedDepth')));
    if(provider==='ssn')assert(content.includes('raw_utc_date'));
  }
  checks++;console.log('PASS each combined record resolves its own provider, raw-file hash, units and source routes');
  await chooseSource('ssn');location.href=savedCombined;await vm.runInContext('restoreLocation()',context);
  assert.equal(vm.runInContext('state.catalog.id',context),'all-catalogs');assert.equal(vm.runInContext('state.filtered.length',context),countryCount('CAN'));
  assert.equal(elements.get('country').value,'CAN');assert.equal(elements.get('providerSelect').value,'all');
  await chooseSource('usgs');assert.equal(elements.get('country').value,'CAN');
  assert.equal(vm.runInContext('state.filtered.every(e=>e.country_id==="CAN")',context),true);
  vm.runInContext("removeFilter('country')",context);assert.equal(vm.runInContext('state.filtered.length',context),14041);
  delayed=nativeSsn.events_url;vm.runInContext('state.cache.clear()',context);
  await Promise.all([chooseSource('all'),chooseSource('nrcan')]);assert.equal(vm.runInContext('state.catalog.provider',context),'nrcan');
  assert.equal(vm.runInContext('state.ready',context),true);assert.equal(vm.runInContext('state.filtered.length',context),6613);
  delayed='';tamper=nativeSsn.events_url;vm.runInContext('state.cache.clear()',context);await chooseSource('all');
  assert.equal(vm.runInContext('state.ready',context),false);assert.equal(elements.get('download').disabled,true);
  tamper='';await Promise.all(elements.get('retry').listeners.click.map(callback=>callback()));assert.equal(vm.runInContext('state.filtered.length',context),287936);
  checks++;console.log('PASS v4 combined/country restoration, retained country across source switches, last selection wins, failed combined integrity and retry');
  const retainedIDs=vm.runInContext('state.filtered.map(e=>e.id).join()',context);
  for(const tab of ['home','sources','analysis','catalog','revisions','methods']) {
    vm.runInContext('setTab('+JSON.stringify(tab)+')',context);
    assert.equal(elements.get(tab+'Panel').hidden,false);
    for(const other of ['home','sources','analysis','catalog','revisions','methods'].filter(x=>x!==tab))assert.equal(elements.get(other+'Panel').hidden,true);
    assert.equal(V.parseURL(location.href,options).view.tab,tab);
    assert.equal(vm.runInContext('state.filtered.map(e=>e.id).join()',context),retainedIDs);
  }
  assert.equal((elements.get('sourceInventoryRows').innerHTML.match(/data-source-catalog=/g)||[]).length,4);
  assert.equal(elements.get('homeRecordCount').textContent.replace(/[^0-9]/g,''),'287936');
  checks++;console.log('PASS welcome, source inventory and analysis navigation round-trip without changing selected records');
  const beforeMobileToggle=location.href;
  for(const callback of elements.get('toggleFiltersMobile').listeners.click)callback();
  assert.equal(elements.get('toggleFiltersMobile')['aria-expanded'],'true');assert.equal(document.body.classes.has('filters-open'),true);
  for(const callback of elements.get('toggleFiltersMobile').listeners.click)callback();
  assert.equal(elements.get('toggleFiltersMobile')['aria-expanded'],'false');assert.equal(document.body.classes.has('filters-open'),false);assert.equal(location.href,beforeMobileToggle);
  checks++;console.log('PASS mobile filter disclosure preserves scientific query and exposes its expanded state');
  await chooseSource('usgs');
  vm.runInContext("writeFilters({...V.catalogDefaults(state.catalog),yearFrom:2025,yearTo:2025,magMin:4.5,magType:'mww'});applyFilters();setTab('analysis');exportAnalysisJson()",context);
  const analysis=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(analysis.schema,'seismic-analysis-report/1');assert.equal(analysis.summary.record_count,analysis.query.result.row_count);
  assert.deepEqual(analysis.query.result.ordered_event_ids,JSON.parse(vm.runInContext('JSON.stringify(state.filtered.map(e=>e.id))',context)));
  assert.equal(analysis.query.input.events_sha256,catalogs[0].sha256);assert.equal(analysis.query.input.manifest_sha256,catalogs[0].manifest_sha256);
  assert.equal(analysis.summary.groups.length,1);assert.equal(analysis.summary.groups[0].mag_type,'mww');
  assert(Math.abs(analysis.summary.groups[0].magnitude.mean-vm.runInContext('state.filtered.reduce((n,e)=>n+e.mag,0)/state.filtered.length',context))<1e-12);
  vm.runInContext('exportAnalysisCsv()',context);const summaryCsv=await context.savedDownload.blob.text();
  assert(summaryCsv.includes('magnitude_mean'));assert(summaryCsv.includes('magnitude_depth_pearson_r'));assert(summaryCsv.includes('usgs-na-2020-2025'));
  vm.runInContext('exportAnalysisReport()',context);const reportHtml=await context.savedDownload.blob.text();
  assert(reportHtml.includes(catalogs[0].sha256));assert(reportHtml.includes(catalogs[0].manifest_sha256));assert(reportHtml.includes('2025'));assert(reportHtml.includes('seismic-analysis-report/1'));
  assert(context.savedDownload.name.endsWith('_descriptive_report.html'));
  checks++;console.log('PASS on-screen summary, CSV, JSON and printable HTML use the same filtered IDs and input hashes');
  vm.runInContext("writeFilters({...V.catalogDefaults(state.catalog),yearFrom:2020,yearTo:2025,magMin:4.5,magType:'mww'});applyFilters();setTab('analysis');exportAnalysisReport()",context);
  assert.equal(vm.runInContext('state.filtered.length',context),659);
  assert.equal(elements.get('statMeanValue').textContent,(5.311168437025796).toLocaleString(context.window.SeismicI18n.language,{maximumFractionDigits:3}));
  assert.equal(elements.get('statMedianValue').textContent,(5.2).toLocaleString(context.window.SeismicI18n.language,{maximumFractionDigits:3}));
  assert.equal((elements.get('scatterChart').innerHTML.match(/<circle\b/g)||[]).length,659);
  assert(elements.get('magnitudeChart').innerHTML.includes('<rect'));
  assert(!/NaN|Infinity/.test(elements.get('magnitudeChart').innerHTML+elements.get('scatterChart').innerHTML));
  const visualReport=await context.savedDownload.blob.text();assert.equal((visualReport.match(/<svg\b/g)||[]).length,3);
  assert(visualReport.includes('mww'));assert(visualReport.includes(catalogs[0].sha256));
  checks++;console.log('PASS real 659-row oracle matches visible metrics, all scatter points and three report charts');
  for(const id of ['includeCsv','includeJson','includeHtml'])elements.get(id).checked=true;
  await vm.runInContext('exportFullPackage()',context);
  assert(context.savedDownload.name.endsWith('.zip'));
  const zip=Buffer.from(await context.savedDownload.blob.arrayBuffer()),payloads=new Map();let offset=0;
  while(zip.readUInt32LE(offset)===0x04034b50){
    const size=zip.readUInt32LE(offset+18),len=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28),start=offset+30+len+extra;
    const name=zip.subarray(offset+30,offset+30+len).toString('utf8');payloads.set(name,zip.subarray(start,start+size));offset=start+size;
  }
  assert.deepEqual([...payloads.keys()],['records.csv','statistics.csv','query.json','analysis.json','report.html','manifest.json']);
  const packageManifest=JSON.parse(payloads.get('manifest.json'));
  assert.equal(packageManifest.record_count,659);
  for(const item of packageManifest.files){assert.equal(payloads.get(item.name).length,item.bytes);assert.equal(crypto.createHash('sha256').update(payloads.get(item.name)).digest('hex'),item.sha256);}
  assert.equal(payloads.get('records.csv').toString('utf8').split('\r\n').length,660);
  assert.equal(JSON.parse(payloads.get('query.json')).result.row_count,659);
  for(const id of ['includeCsv','includeJson','includeHtml'])elements.get(id).checked=false;
  context.savedDownload=null;await vm.runInContext('exportFullPackage()',context);assert.equal(context.savedDownload,null);
  assert.equal(elements.get('exportPackage').disabled,false);
  elements.get('coverageFrom').value='1900';elements.get('coverageTo').value='2026';vm.runInContext('renderCoverage()',context);
  assert(elements.get('coverageCounts').innerHTML.includes('402082')===false,'No fabricated single-year total marker');
  assert(elements.get('coverageStats').textContent.includes('402'));
  assert(!/NaN|Infinity/.test(elements.get('coverageMaximum').innerHTML));
  assert(elements.get('diagnosticDepth').innerHTML.includes('us2000ahv0'));
  elements.get('coverageFrom').value='2027';vm.runInContext('renderCoverage()',context);assert.equal(elements.get('coverageCounts').innerHTML,'');
  checks++;console.log('PASS analysis ZIP hashes every actual payload, format deselection prevents download, and independent diagnostics reject invalid year windows');
  vm.runInContext('previewAnalysisReport()',context);assert.equal(elements.get('reportPreview').open,true);
  const previewHtml=elements.get('reportPreviewFrame').srcdoc;
  assert.equal((previewHtml.match(/<svg\b/g)||[]).length,3);assert(previewHtml.includes(catalogs[0].sha256));assert(previewHtml.includes('659'));
  for(const callback of elements.get('closeReportPreview').listeners.click)callback();assert.equal(elements.get('reportPreview').open,false);
  assert.equal(vm.runInContext('state.filtered.length',context),659);
  checks++;console.log('PASS in-application report preview uses generated HTML with real charts and preserved selection');
  vm.runInContext('writeFilters(V.catalogDefaults(state.catalog));applyFilters();setTab("analysis")',context);
  const idsBeforeGroup=vm.runInContext('state.filtered.map(e=>e.id).join()',context),urlBeforeGroup=location.href;
  const focus=elements.get('analysisGroupSelect').children.find(option=>JSON.parse(option.value)[1]==='mb');assert(focus);
  elements.get('analysisGroupSelect').value=focus.value;for(const callback of elements.get('analysisGroupSelect').listeners.change)callback();
  assert.equal(vm.runInContext('state.filtered.map(e=>e.id).join()',context),idsBeforeGroup);assert.equal(location.href,urlBeforeGroup);
  assert(elements.get('analysisGroupContext').textContent.includes('mb'));
  assert.equal(vm.runInContext('selectedAnalysisGroup(summaryForSelection()).mag_type',context),'mb');
  vm.runInContext('exportAnalysisJson()',context);const focusReport=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(focusReport.display_group.mag_type,'mb');assert.equal(focusReport.query.result.row_count,14041);assert(focusReport.summary.groups.length>1);
  checks++;console.log('PASS chart group changes presentation only and exports identify it while retaining full selection');
  for(const [caseName,expected] of [['ssn',204],['usa',2335],['canada',1492],['combined',7107]]) {
    const fake={target:{closest:()=>({dataset:{case:caseName}})}};
    await Promise.all(elements.get('homeCases').listeners.click.map(callback=>callback(fake)));
    assert.equal(vm.runInContext('state.filtered.length',context),expected,caseName);
    assert.equal(elements.get('catalogPanel').hidden,false);
    if(caseName==='canada') {assert.equal(elements.get('miniDepth').textContent,'—');vm.runInContext('setTab("analysis")',context);assert(!elements.get('scatterChart').innerHTML.includes('<circle'));}
    if(caseName==='ssn') {vm.runInContext('setTab("analysis")',context);assert.equal(elements.get('statPairsValue').textContent,context.window.SeismicI18n.t('notCalculable'));}
  }
  checks++;console.log('PASS four research cases recalculate SSN204, USA2335, Canada1492 and combined7107 without inventing units or Pearson');
  vm.runInContext("writeFilters({...V.catalogDefaults(state.catalog),search:'no-match-research-ui-fixture'});applyFilters();setTab('analysis')",context);
  assert.equal(elements.get('analysisCount').textContent,'0');assert(elements.get('analysisGroupRows').innerHTML.includes('colspan'));
  vm.runInContext('exportAnalysisJson()',context);const emptyAnalysis=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(emptyAnalysis.summary.record_count,0);assert.deepEqual(emptyAnalysis.query.result.ordered_event_ids,[]);
  assert.equal(elements.get('statMeanValue').textContent,'—');assert.equal(elements.get('analysisGroupSelect').disabled,true);
  assert(!elements.get('scatterChart').innerHTML.includes('<circle'));
  checks++;console.log('PASS empty descriptive queries retain explicit empty results instead of fabricated statistics');

  // Exercise genuine workbench navigation and downloads through their listeners,
  // with source records still loaded/hashed by the real application pipeline.
  vm.runInContext("changeLanguage('en');setTab('home')",context);
  for(const c of catalogs){
    const event={target:{closest:()=>({dataset:{workbenchCatalog:c.id}})}};
    await Promise.all(elements.get('workbenchSources').listeners.click.map(callback=>callback(event)));
    assert.equal(vm.runInContext('state.catalog.id',context),c.id);
    assert.equal(vm.runInContext('state.filtered.length',context),c.event_count);
    assert.equal(vm.runInContext('state.applied.country',context),'');
    assert.equal(vm.runInContext('state.tab',context),'home');assert.equal(elements.get('homePanel').hidden,false);
    assert.equal(map.records.length,c.event_count);assert(elements.get('workbenchSources').innerHTML.includes('is-active" data-workbench-catalog="'+c.id+'"'));
  }
  await Promise.all(elements.get('workbenchAll').listeners.click.map(callback=>callback()));
  assert.equal(vm.runInContext('state.catalog.id',context),'all-catalogs');assert.equal(vm.runInContext('state.activePacks.length',context),4);
  assert.equal(vm.runInContext('state.filtered.length',context),287936);assert.equal(map.records.length,287936);
  assert.equal((elements.get('sourceCards').innerHTML.match(/source-contract/g)||[]).length,4);
  assert.equal(vm.runInContext('new Set(state.activePacks.map(p=>p.catalog.provider)).size',context),3);
  checks++;console.log('PASS Home source/all controls load their real rows, retain four provenance contracts and route the active map');

  await vm.runInContext("loadCatalog('ssn-mx-historical',false,{yearFrom:2026,yearTo:2026,magMin:4.5,country:''})",context);
  await vm.runInContext('ensureAdmin1()',context);vm.runInContext('render()',context);
  const contextRows=JSON.parse(vm.runInContext('JSON.stringify(state.filtered.map(e=>e.id))',context));
  assert.equal(contextRows.length,204);assert.equal(vm.runInContext('state.applied.country',context),'');assert.equal(vm.runInContext('state.applied.admin1',context),'');
  assert.equal(map.contextCountry,'MEX');assert.equal(vm.runInContext('state.filtered.filter(e=>e.country_id==="outside").length',context),157);
  vm.runInContext('exportQuery()',context);const contextQuery=JSON.parse(await context.savedDownload.blob.text());
  assert.deepEqual(contextQuery.result.ordered_event_ids,contextRows);assert.equal(contextQuery.selection.country,'');
  checks++;console.log('PASS Mexico subdivision context preserves all204 SSN rows including157 offshore rows without applying a country/state predicate');

  await vm.runInContext("loadCatalog('usgs-na-2020-2025',false,{yearFrom:2020,yearTo:2025,magMin:4.5,magType:'mww',country:''})",context);
  vm.runInContext("setTab('home')",context);
  const workbenchIds=JSON.parse(vm.runInContext('JSON.stringify(state.filtered.map(e=>e.id))',context)),workbenchFilters=vm.runInContext('JSON.stringify(state.applied)',context);
  assert.equal(workbenchIds.length,659);assert.equal(map.contextCountry,'');
  for(const callback of elements.get('workbenchCsv').listeners.click)callback();
  assert(context.savedDownload.name.endsWith('_filtered_snapshot.csv'));assert.equal((await context.savedDownload.blob.text()).split('\r\n').length,660);
  for(const callback of elements.get('workbenchJson').listeners.click)callback();
  assert.deepEqual(JSON.parse(await context.savedDownload.blob.text()).result.ordered_event_ids,workbenchIds);
  for(const [id,tab] of [['workbenchStats','analysis'],['workbenchSql','sql'],['workbenchCompare','comparison']]){
    for(const callback of elements.get(id).listeners.click)callback();assert.equal(vm.runInContext('state.tab',context),tab);
    assert.equal(vm.runInContext('JSON.stringify(state.applied)',context),workbenchFilters);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.filtered.map(e=>e.id))',context)),workbenchIds);
  }
  for(const callback of elements.get('workbenchReport').listeners.click)callback();
  assert.equal(vm.runInContext('state.tab',context),'analysis');assert(elements.get('inlineReportFrame').srcdoc.includes('659'));assert.equal((elements.get('inlineReportFrame').srcdoc.match(/<svg\b/g)||[]).length,3);assert.equal(elements.get('printInlineReport').disabled,false);
  for(const id of ['includeCsv','includeJson','includeHtml'])elements.get(id).checked=true;
  context.savedDownload=null;for(const callback of elements.get('workbenchZip').listeners.click)callback();
  for(let n=0;n<100&&!context.savedDownload;n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(context.savedDownload?.name.endsWith('.zip'));assert.equal(Buffer.from(await context.savedDownload.blob.arrayBuffer()).readUInt32LE(0),0x04034b50);
  checks++;console.log('PASS Home outputs produce real659-row CSV/query/ZIP and HTML preview while stats/SQL/comparison routes preserve the selected records');

  vm.runInContext("setTab('home')",context);elements.get('mapDisplay').value='heat';
  for(const callback of elements.get('mapDisplay').listeners.change)callback();
  assert.equal(map.displayMode,'heat');assert.equal(new URL(location.href).searchParams.get('display'),'heat');
  assert.equal(elements.get('heatLegend').hidden,false);assert.equal(elements.get('mapPointLegend').hidden,true);
  assert.equal(vm.runInContext('JSON.stringify(state.applied)',context),workbenchFilters);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.filtered.map(e=>e.id))',context)),workbenchIds);
  for(const callback of elements.get('workbenchJson').listeners.click)callback();
  const heatQuery=JSON.parse(await context.savedDownload.blob.text());assert.equal(heatQuery.cartography.mode,'heat');assert.equal(heatQuery.cartography.selected_rows,659);assert.equal(new URL(heatQuery.view_url).searchParams.get('display'),'heat');assert.deepEqual(heatQuery.result.ordered_event_ids,workbenchIds);
  vm.runInContext("setTab('analysis')",context);assert.equal(vm.runInContext('analysisDocument().cartography.mode',context),'heat');
  location.href=vm.runInContext('viewURL({...currentView(),tab:"analysis",filters:{...state.applied,yearFrom:2025}})',context);
  await vm.runInContext('restoreLocation()',context);
  assert.equal(vm.runInContext('state.tab',context),'analysis');assert.equal(map.displayMode,'heat');assert.equal(vm.runInContext('state.filtered.length',context),143);
  vm.runInContext('exportQuery()',context);const hiddenMapQuery=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(hiddenMapQuery.result.row_count,143);assert.equal(hiddenMapQuery.cartography,null,'A hidden map with an earlier selection must not supply current cartography evidence');
  assert.equal(vm.runInContext('analysisDocument().cartography',context),null);
  vm.runInContext("setTab('catalog');exportQuery()",context);const restoredMapQuery=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(restoredMapQuery.cartography.mode,'heat');assert.equal(restoredMapQuery.cartography.selected_rows,143);
  assert.deepEqual(restoredMapQuery.result.ordered_event_ids,hiddenMapQuery.result.ordered_event_ids);
  elements.get('mapDisplay').value='points';for(const callback of elements.get('mapDisplay').listeners.change)callback();
  assert.equal(new URL(location.href).searchParams.has('display'),false);assert.equal(elements.get('heatLegend').hidden,true);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.filtered.map(e=>e.id))',context)),hiddenMapQuery.result.ordered_event_ids);
  checks++;console.log('PASS heat display/permalinks preserve filters and IDs; exports bind visible cartography or explicitly omit stale hidden-map evidence');
  const guerrero=vm.runInContext("state.admin1.regions.find(r=>r.country_id==='MEX'&&r.label.en==='Guerrero').id",context);
  context.quickCriteria={catalog:'ssn-mx-historical',country:'MEX',admin1:guerrero,yearFrom:1900,yearTo:2026,magMin:3.5,magType:'',action:'statistics'};
  const quickAnswer=await vm.runInContext('applyQuickSelection(quickCriteria)',context);
  assert.equal(vm.runInContext('state.applied.admin1',context),guerrero,'Loading a quick preset must populate subdivision options before writing its value');
  assert.equal(quickAnswer.count,21167);assert.equal(quickAnswer.summary.record_count,21167);
  assert(quickAnswer.selectionLabel.includes('Guerrero'));
  assert(vm.runInContext('state.filtered.every(e=>e.country_id===\"MEX\"&&e.admin1_id===quickCriteria.admin1)',context));
  vm.runInContext('exportQuery()',context);
  const quickEvidence=JSON.parse(await context.savedDownload.blob.text());
  assert.equal(quickEvidence.result.row_count,21167);assert.equal(quickEvidence.selection.admin1,guerrero);
  checks++;console.log('PASS quick state presets retain Guerrero, full source years, native statistics and the same exported record selection');
  console.log(JSON.stringify({passed:checks},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
