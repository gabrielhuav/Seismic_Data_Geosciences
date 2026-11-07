'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const V = require('../system/dist/view-state.js');
const C = require('../system/dist/catalog-composition.js');
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
  const location={href:'https://example.org/'};
  const map={records:[],view:[50,-120,3],base:'local',setRecords(rows){this.records=rows;},getView(){return this.view;},setView(v){this.view=v;},setRegion(b){this.region=b;},reset(){this.view=[50,-120,3];},setBase(id){this.base=id;},getBase(){return this.base;},languageChanged(){},resize(){},fitRecords(){},highlight(id){this.highlighted=id;},focusRecord(id){this.highlighted=id;this.view=[60,-120,5.5];},themeChanged(){}};
  let tamper='', delayed='';
  const fetch=async url=>{
    if(url===delayed)await new Promise(resolve=>setTimeout(resolve,15));
    const bytes=fs.readFileSync('system/dist/'+url);
    const buffer=url===tamper ? Buffer.from(bytes.toString().replace('3.5','3.6')) : bytes;
    return {ok:true,arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)};
  };
  const context={window:{SeismicViewState:V,SeismicCatalogComposition:C,addEventListener(){}},document,location,history:{replaceState(_,__,url){location.href=url;}},navigator:{},fetch,
    crypto:crypto.webcrypto,TextDecoder,TextEncoder,URL,Intl,Blob,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),createSeismicMap:()=>map};
  vm.createContext(context);vm.runInContext(fs.readFileSync('system/dist/i18n.js','utf8'),context);
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
  vm.runInContext("writeFilters({...V.defaults,search:'Oaxaca',yearFrom:2000,yearTo:2025,magMin:4,magMax:8,magType:'mww',originSource:'us',depthMax:100,missingOnly:true,unmOnly:true,country:'MEX'});applyFilters()",context);
  for(const key of Object.keys(V.defaults))assert(elements.get('activeFilters').innerHTML.includes('data-remove-filter="'+key+'"'),'Missing active filter chip '+key);
  vm.runInContext("removeFilter('search')",context);assert.equal(vm.runInContext('state.applied.search',context),'');
  vm.runInContext("writeFilters(V.catalogDefaults(state.catalog));applyFilters()",context);
  assert.equal(elements.get('activeFilters').hidden,true);checks++;console.log('PASS all eleven active filter controls have removable chips and reset cleanly');
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
  console.log(JSON.stringify({passed:checks},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
