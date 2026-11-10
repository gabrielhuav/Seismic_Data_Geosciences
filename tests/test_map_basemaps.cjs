'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const V=require('../system/dist/view-state.js');
class Element {
  constructor(tag='div'){this.tagName=tag;this.style={};this.children=[];this.listeners={};this.attributes={};this.value='';this.textContent='';}
  append(...children){this.children.push(...children);for(const child of children)child.parentElement=this;}
  appendChild(child){this.append(child);return child;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(key,callback){(this.listeners[key]??=[]).push(callback);}
  querySelector(){return null;}
  get options(){return this.children;}
  getContext(){if(!this.context){const canvas=this;canvas.painted=[];this.context={setTransform(){},beginPath(){this.path=[];},arc(...args){this.path.push(['arc',...args]);},rect(...args){this.path.push(['rect',...args]);},moveTo(...args){this.path.push(['moveTo',...args]);},lineTo(...args){this.path.push(['lineTo',...args]);},closePath(){this.path.push(['closePath']);},fill(){canvas.painted.push({color:this.fillStyle,path:this.path.map(p=>[...p])});},stroke(){},drawImage(){},putImageData(){},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};}};}return this.context;}
  remove(){}
  fire(type,event={}){for(const callback of this.listeners[type]||[])callback(event);}
}
const nodeById={mapStatus:new Element()},controls=[],tileLayers=[],geoLayers=[],panes={},layers=new Set(),attributions=new Set();
const map={options:{},controls,layers,
  attributionControl:{setPrefix(){},addAttribution(value){attributions.add(value);},removeAttribution(value){attributions.delete(value);}},
  on(){},off(){},createPane(name){return panes[name]=new Element();},getPanes(){return {overlayPane:new Element()};},getSize(){return {x:800,y:500};},containerPointToLayerPoint(){return {x:0,y:0};},
  latLngToContainerPoint(){return {x:400,y:250};},getZoom(){return 3;},getCenter(){return {lat:50,lng:-120};},
  hasLayer(layer){return layers.has(layer);},removeLayer(layer){if(layers.delete(layer)){layer.onRemove?.(this);layer.fire?.('remove');}return this;},closePopup(){},fitBounds(bounds,options){this.lastFit={bounds,options};},setView(){},invalidateSize(){}};
class Layer {
  addTo(m){
    layers.add(this);this.onAdd?.(m);
    // Leaflet's attribution control registers a layer remove observer when a
    // layer with attribution is added. Blanket off() must not delete it.
    if(this.options?.attribution){m.attributionControl.addAttribution(this.options.attribution);this.on('remove',()=>m.attributionControl.removeAttribution(this.options.attribution));}
    return this;
  }
  on(name,callback){((this.handlers??={})[name]??=[]).push(callback);return this;}
  off(name){if(name)delete(this.handlers??={})[name];else this.handlers={};return this;}
  fire(name,event={}){for(const callback of [...(this.handlers?.[name]||[])])callback(event);return this;}
  clearLayers(){}
  addLayer(){}
  setStyle(style){this.lastStyle=typeof style==='function'&&this.feature?style(this.feature):style;for(const layer of this.features||[])layer.setStyle(style);return this;}
  setIcon(){}
}
const L={map:(_,options)=>{map.options=options;return map;},latLngBounds:values=>values,
  canvas:options=>({options}),geoJSON(data,options={}){const group=new Layer();group.data=data;group.options=options;group.features=(data.features||[]).map(feature=>{const layer=new Layer();layer.feature=feature;options.onEachFeature?.(feature,layer);return layer;});group.setStyle(options.style);geoLayers.push(group);return group;},layerGroup:()=>new Layer(),marker:()=>new Layer(),divIcon:()=>({}),
  control:options=>({options,addTo(m){this.element=this.onAdd?.(m);controls.push(this);return this;}}),
  DomUtil:{create:(tag,cls)=>{const element=new Element(tag);element.className=cls;return element;},setPosition(){}},
  DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}},
  Layer:{extend(proto){class Custom extends Layer{}Object.assign(Custom.prototype,proto);return Custom;}},
  tileLayer(url,options){const tile=new Layer();tile.url=url;tile.options=options;tileLayers.push(tile);return tile;}};
L.control.scale=()=>({addTo(){}});
const document={documentElement:{},createElement:tag=>new Element(tag),getElementById:id=>nodeById[id]};
const context={window:{devicePixelRatio:1,matchMedia:()=>({matches:true,addEventListener(){}})},document,L};
vm.createContext(context);vm.runInContext(fs.readFileSync('system/dist/source-workbench.js','utf8'),context);vm.runInContext(fs.readFileSync('system/dist/map.js','utf8'),context);
const specs=context.window.SeismicBasemaps,ids=['local','osm','osm-hot','usgs-topo','nasa-blue-marble'];
let count=0;
function test(name,run){run();count++;console.log('PASS '+name);}
test('all map choices have matching UI translations and round-trip independently of catalogue filters',()=>{
  assert.deepEqual(Object.keys(specs),ids);
  const html=fs.readFileSync('system/dist/index.html','utf8');
  const doc={documentElement:{},querySelector:()=>({}),querySelectorAll:()=>[],getElementById:()=>null},i18n={window:{},document:doc};vm.createContext(i18n);vm.runInContext(fs.readFileSync('system/dist/i18n.js','utf8'),i18n);
  for(const id of ids) {
    assert(html.includes('value="'+id+'"'));
    for(const lang of ['es','en'])for(const key of [specs[id].labelKey,specs[id].statusKey])assert(Object.hasOwn(i18n.window.SeismicI18n.messages[lang],key));
    const view={catalog:V.legacyCatalog,base:id,filters:{...V.defaults},lang:'en',sort:'recent',tab:'catalog',map:[50,-120,3]};
    const restored=V.parseURL(V.serialize(view,'https://example.org/')).view;
    assert.equal(restored.base,id);assert.deepEqual(restored.filters,view.filters);assert.equal(restored.catalog,view.catalog);
  }
});
let language='es',changes=[],statuses=[],countryRequests=[],admin1Requests=[],displayChanges=[];
const polygon=(properties,ring)=>({type:'Feature',properties,geometry:{type:'Polygon',coordinates:[ring]}});
const basemap={type:'FeatureCollection',features:[polygon({ADMIN:'Mexico',ISO_A3:'MEX'},[[-105,20],[-102,20],[-102,23],[-105,20]]),polygon({ADMIN:'France',ISO_A3:'-99'},[[-54,3],[-52,3],[-52,5],[-54,3]])]},original=JSON.stringify(basemap);
const mapElement=new Element();
const api=context.window.createSeismicMap({element:mapElement,basemap,onSelect(){},
  sourceStyle:record=>context.window.SeismicSourceWorkbench.identity(record._catalog_id||'usgs-na-2020-2025'),
  translate:key=>language+':'+key,onBaseChange:id=>changes.push(id),onBaseStatus:key=>statuses.push(key),onCountrySelect:id=>countryRequests.push(id),onAdmin1Select:id=>admin1Requests.push(id),onDisplayChange:e=>displayChanges.push(e)});
const picker=controls.find(control=>control.element?.className==='map-base-control').element.children[0].children[1];
test('default local base creates no remote tile layer and respects reduced motion',()=>{
  assert.equal(api.getBase(),'local');assert.equal(tileLayers.length,0);assert.equal(map.options.zoomAnimation,false);assert.equal(map.options.fadeAnimation,false);
  assert.equal(picker.value,'local');assert.equal(picker.options.length,ids.length);assert.equal(JSON.stringify(basemap),original);
});
const records=[{id:'case-1',latitude:60,longitude:175,mag:4.5,depth:null,time:'2025',place:'Test'}],raw=JSON.stringify(records),beforeView=JSON.stringify(api.getView());
api.setRecords(records);
test('remote bases are explicit on-demand choices with attribution and no prefetch buffer',()=>{
  for(const id of ids.filter(id=>id!=='local')) {
    const before=tileLayers.length;api.setBase(id);const tile=tileLayers.at(-1);
    assert.equal(tileLayers.length,before+1);assert.equal(api.getBase(),id);assert.equal(picker.value,id);assert.equal(tile.url,specs[id].url);
    assert(tile.options.attribution);assert.equal(tile.options.keepBuffer,0);assert.equal(tile.options.updateWhenIdle,true);
    assert(!/api[_-]?key|access[_-]?token|[?&]token=/i.test(tile.url));assert.equal(JSON.stringify(records),raw);assert.equal(JSON.stringify(api.getView()),beforeView);
  }
});
test('NASA uses the static JPEG/Level8 source and native level 8 limits',()=>{
  const tile=tileLayers.at(-1);assert.equal(tile.options.maxNativeZoom,8);
  assert(tile.url.includes('LAYER=BlueMarble_ShadedRelief_Bathymetry'));assert(tile.url.includes('GoogleMapsCompatible_Level8'));assert(tile.url.includes('FORMAT=image%2Fjpeg'));assert(!/[?&]TIME=/i.test(tile.url));
  assert(tile.options.attribution.includes('2004'));assert(tile.options.attribution.includes('ESDIS'));
});
test('switching HOT to NASA then Natural Earth removes each retired attribution',()=>{
  api.setBase('osm-hot');const hot=tileLayers.at(-1);
  assert(attributions.has(specs['osm-hot'].attribution));
  api.setBase('nasa-blue-marble');const nasa=tileLayers.at(-1);
  assert(!attributions.has(specs['osm-hot'].attribution));assert(attributions.has(specs['nasa-blue-marble'].attribution));
  assert(!Object.hasOwn(hot.handlers,'tileerror'));assert(!layers.has(hot));
  api.setBase('local');assert(!attributions.has(specs['nasa-blue-marble'].attribution));
  assert.equal(attributions.size,1);assert([...attributions][0].includes('Natural Earth'));
  assert(!Object.hasOwn(nasa.handlers,'tileerror'));assert(!layers.has(nasa));assert.equal(JSON.stringify(records),raw);
});
test('the expanded-map picker synchronizes the base callback and preserves Escape/Tab propagation',()=>{
  picker.value='osm-hot';picker.fire('change');assert.equal(api.getBase(),'osm-hot');assert.equal(changes.at(-1),'osm-hot');
  for(const key of ['Escape','Tab']){let stopped=false;picker.fire('keydown',{key,stopPropagation(){stopped=true;}});assert.equal(stopped,false);}
  let stopped=false;picker.fire('keydown',{key:'ArrowDown',stopPropagation(){stopped=true;}});assert.equal(stopped,true);
});
test('repeated tile failures restore the local base, attribution and picker without altering records',()=>{
  const tile=tileLayers.at(-1);tile.fire('tileerror');tile.fire('tileerror');assert.equal(api.getBase(),'osm-hot');tile.fire('tileerror');
  assert.equal(api.getBase(),'local');assert.equal(picker.value,'local');assert.equal(changes.at(-1),'local');assert.equal(statuses.at(-1),'baseFallback');
  assert([...attributions].some(text=>text.includes('Natural Earth')));assert.equal(JSON.stringify(records),raw);
});
test('changing interface language updates every in-map option label',()=>{
  language='en';api.languageChanged();assert.equal(picker.attributes['aria-label'],'en:mapBase');
  for(const option of picker.options)assert.equal(option.textContent,'en:'+specs[option.value].labelKey);
});
test('country hits preserve exact region identifiers and defer epicenter clicks to the event inspector',()=>{
  const countries=geoLayers[0];assert.equal(countries.options.interactive,true);
  countries.features[0].fire('click',{containerPoint:{x:0,y:0}});assert.equal(countryRequests.at(-1),'MEX');
  countries.features[1].fire('click',{containerPoint:{x:0,y:0}});assert.equal(countryRequests.at(-1),'NE_france');
  const n=countryRequests.length;countries.features[0].fire('click',{containerPoint:{x:400,y:250}});assert.equal(countryRequests.length,n);
  api.setBase('osm');assert(layers.has(countries));assert(attributions.has([...attributions].find(s=>s.includes('Natural Earth'))));assert.equal(JSON.stringify(records),raw);
  assert.equal(panes.seismicEvents.style.zIndex,450);assert.equal(panes.seismicEvents.style.pointerEvents,'none');
});
test('administrative overlays expose only the chosen country and keep input geometries and catalogue rows unchanged',()=>{
  const geometry={type:'FeatureCollection',features:[polygon({admin1_id:'MEX-test',country_id:'MEX',label_es:'Estado prueba',label_en:'Test state'},[[-105,20],[-102,20],[-102,23],[-105,20]]),polygon({admin1_id:'CAN-test',country_id:'CAN',label_en:'Test province'},[[-105,50],[-102,50],[-102,53],[-105,50]])]},before=JSON.stringify(geometry);
  api.setCountry('MEX');api.setAdmin1({geometry,countryId:'MEX',selectedId:'MEX-test'});const overlay=geoLayers.at(-1);
  assert.equal(overlay.features.length,1);assert.equal(overlay.features[0].feature.properties.admin1_id,'MEX-test');
  overlay.features[0].fire('click',{containerPoint:{x:0,y:0}});assert.equal(admin1Requests.at(-1),'MEX-test');
  const n=admin1Requests.length;overlay.features[0].fire('click',{containerPoint:{x:400,y:250}});assert.equal(admin1Requests.length,n);
  assert.equal(api.fitAdmin1('MEX-test'),true);assert.equal(api.fitAdmin1('CAN-test'),false);assert.equal(api.fitCountry('MEX'),true);
  api.setCountry('CAN');assert.equal(api.getOverlays().admin1Country,'');assert(!layers.has(overlay));assert.equal(JSON.stringify(geometry),before);assert.equal(JSON.stringify(records),raw);assert.equal(JSON.stringify(basemap),original);
});
test('tectonic geometry is an optional attributed context layer with continuous antimeridian display and generic boundaries',()=>{
  const geometry={type:'FeatureCollection',features:[polygon({kind:'plate',plate_code:'PA',plate_name:'Pacific'},[[170,10],[-175,10],[-170,20],[170,10]]),{type:'Feature',properties:{kind:'boundary',boundary_type:'subduction',plate_a:'PA',plate_b:'NA'},geometry:{type:'LineString',coordinates:[[170,10],[-175,10],[-170,20]]}}]},before=JSON.stringify(geometry);
  api.setTectonics(geometry);const overlay=geoLayers.at(-1);assert.equal(api.getOverlays().tectonics,true);assert.equal(overlay.options.interactive,false);
  assert([...attributions].some(s=>s.includes('Bird (2003)')&&s.includes('ODC-BY')));
  const coordinates=overlay.data.features[1].geometry.coordinates;assert(coordinates.every((p,i)=>i===0||Math.abs(p[0]-coordinates[i-1][0])<=180));
  assert.equal(overlay.features[1].lastStyle.dashArray,'5 5');assert.equal(overlay.features[1].lastStyle.fill,false);
  api.setTectonics(null);assert.equal(api.getOverlays().tectonics,false);assert(!layers.has(overlay));assert(![...attributions].some(s=>s.includes('Bird (2003)')));
  assert.equal(JSON.stringify(geometry),before);assert.equal(JSON.stringify(records),raw);
});
test('screen heat conserves visible equal row weights, excludes offscreen centers and has a normalized finite kernel',()=>{
  const H=context.window.SeismicMapHeat,g=H.create(96,96);
  for(let i=0;i<32;i++)assert.equal(H.add(g,52,52),true);
  for(const [x,y]of [[-1,0],[96,0],[0,96],[NaN,2],[2,Infinity]])assert.equal(H.add(g,x,y),false);
  assert.equal(g.visible_rows,32);assert.equal(g.occupied_cells,1);assert.equal(g.counts.reduce((n,v)=>n+v,0),32);
  const smoothed=H.smooth(g);assert(Math.abs(smoothed.values.reduce((n,v)=>n+v,0)-32)<1e-10);
  assert(smoothed.max>0&&smoothed.max<32);assert.equal(H.rgba(smoothed).length,g.counts.length*4);
  const empty=H.create(96,96);assert.equal(H.smooth(empty).max,0);assert(H.rgba(H.smooth(empty)).every(n=>n===0));
  assert.equal(H.spec.weight_per_source_row,1);assert.equal(H.spec.grid_css_pixels,8);assert.equal(H.spec.radius_css_pixels,32);assert.equal(H.spec.sigma_css_pixels,12);
});
test('heat aggregates all 287936 fixture rows with work bounded by the viewport grid, without sampling',()=>{
  const H=context.window.SeismicMapHeat,g=H.create(320,200);
  for(let i=0;i<287936;i++)H.add(g,i%320,Math.floor(i/320)%200);
  assert.equal(g.visible_rows,287936);assert.equal(g.counts.reduce((n,v)=>n+v,0),287936);
  assert.equal(g.counts.length,1000);assert.equal(H.rgba(H.smooth(g)).length,4000);
});
test('heat is a presentation-only mode with explicit evidence and geographic clicks rather than cell identities',()=>{
  const savedProjection=map.latLngToContainerPoint,savedSize=map.getSize,before=JSON.stringify(api.getView());
  const fixtures=[{...records[0],id:'small',longitude:-180,latitude:20,mag:3.5},{...records[0],id:'large',longitude:-180,latitude:20,mag:8.5},{...records[0],id:'offscreen',longitude:-50,latitude:20}],original=JSON.stringify(fixtures);
  let projections=0;
  try{
    map.getSize=()=>({x:100,y:100});map.latLngToContainerPoint=([lat,lng])=>{projections++;return {x:lng+200,y:lat};};api.setRecords(fixtures);
    assert.equal(api.getDisplayMode(),'points');api.setDisplayMode('heat');
    const e=api.getDisplayEvidence();assert.equal(e.mode,'heat');assert.equal(e.selected_rows,3);assert.equal(e.visible_rows,2);assert.equal(e.occupied_cells,1);
    assert.equal(e.weight_per_source_row,1);assert.equal(e.normalization,'log1p_relative_to_viewport_max');assert.equal(e.palette.length,4);assert(e.limits.some(s=>s.includes('not a density per square kilometre')));
    assert.equal(panes.seismicHeat.style.zIndex,405);assert.equal(panes.seismicHeat.style.pointerEvents,'none');assert.equal(panes.seismicAdmin1.style.zIndex,410);
    const prepared=projections;api.setRecords(fixtures);assert.equal(projections,prepared,'Same-view redraws reuse the heat grid');
    assert.equal(displayChanges.at(-1).mode,'heat');e.palette[0].color='mutated';assert.notEqual(api.getDisplayEvidence().palette[0].color,'mutated');
    const n=countryRequests.length;geoLayers[0].features[0].fire('click',{containerPoint:{x:20,y:20}});assert.equal(countryRequests.length,n+1);assert.equal(countryRequests.at(-1),'MEX');
    const geometry={type:'FeatureCollection',features:[polygon({admin1_id:'MEX-heat',country_id:'MEX'},[[-180,20],[-179,20],[-179,21],[-180,20]])]};
    api.setCountry('MEX');api.setAdmin1({geometry,countryId:'MEX'});const requests=admin1Requests.length;geoLayers.at(-1).features[0].fire('click',{containerPoint:{x:20,y:20}});assert.equal(admin1Requests.length,requests+1);assert.equal(admin1Requests.at(-1),'MEX-heat');api.clearAdmin1();api.setCountry('');
    api.highlight('large');assert.equal(api.getDisplayMode(),'heat');assert.equal(api.getDisplayEvidence().visible_rows,2);
    assert.equal(api.focusRecord('large'),true);assert.equal(api.getDisplayMode(),'heat');assert.equal(api.focusRecord('heat-cell-1'),false);
    api.setDisplayMode('points');assert.equal(api.getDisplayMode(),'points');assert.equal(api.getDisplayEvidence().selected_rows,3);
    assert.throws(()=>api.setDisplayMode('energy'),/Unknown/);assert.equal(JSON.stringify(fixtures),original);assert.equal(JSON.stringify(api.getView()),before);
  }finally{map.latLngToContainerPoint=savedProjection;map.getSize=savedSize;api.setDisplayMode('points');api.setRecords(records);api.highlight('');}
});

test('actual Canvas fills use four stable catalogue colours and distinct marker paths without changing source coordinates, depths or magnitudes',()=>{
  const ids=['usgs-na-2020-2025','usgs-mx-historical','nrcan-ca-historical','ssn-mx-historical'];
  const fixtures=ids.map((id,i)=>({...records[0],id:'colour-'+i,_catalog_id:id,mag:[3.5,4.5,6,7][i],depth:[10,80,null,20][i]})),before=JSON.stringify(fixtures),view=JSON.stringify(api.getView());
  const canvas=panes.seismicEvents.children.find(e=>e.className?.includes('epicenter-canvas'));
  api.setRecords(fixtures);api.setColorMode('catalogue');
  const painted=canvas.painted.slice(-4),expected=['#2563eb','#7c3aed','#c28112','#0d9471'];
  assert.deepEqual(painted.map(p=>p.color),expected);
  assert.deepEqual(painted.map(p=>p.path[0][0]),['arc','rect','moveTo','moveTo']);
  assert.equal(painted[0].path[0][3],2,'M3.5 retains its 2 CSS-pixel radius');
  assert.equal(painted[1].path[0][3],4.4,'M4.5 square retains the magnitude-derived 2.5 CSS-pixel radial scale');
  const evidence=api.getDisplayEvidence();assert.equal(evidence.color_encoding,'catalogue');assert.equal(evidence.catalogue_palette.length,4);
  assert.deepEqual(Array.from(evidence.catalogue_palette,s=>s.code),['01','02','03','04']);
  evidence.catalogue_palette[0].color='mutated';assert.equal(api.getDisplayEvidence().catalogue_palette[0].color,expected[0]);
  const beforeRepeat=canvas.painted.length;api.setRecords(fixtures);assert.equal(canvas.painted.length,beforeRepeat,'Identical row reference, viewport and point style reuse the raster without dropping hit targets');
  api.highlight('colour-0');assert.equal(canvas.painted.length,beforeRepeat+4,'Highlight changes must invalidate the raster');api.highlight('');
  api.themeChanged();assert.deepEqual(canvas.painted.slice(-4).map(p=>p.color),expected,'Theme changes do not change catalogue identities');
  api.setColorMode('depth');assert.equal(api.getDisplayEvidence().color_encoding,'depth');assert.deepEqual(canvas.painted.slice(-4).map(p=>p.path[0][0]),['arc','arc','arc','arc']);
  assert.notDeepEqual(canvas.painted.slice(-4).map(p=>p.color),expected);
  api.setColorMode('catalogue');api.setDisplayMode('heat');assert.equal(api.getDisplayEvidence().color_encoding,'relative_source_row_concentration');
  assert.equal(JSON.stringify(fixtures),before);assert.equal(JSON.stringify(api.getView()),view);assert.throws(()=>api.setColorMode('risk'),/Unknown/);
  api.setDisplayMode('points');api.setColorMode('depth');api.setRecords(records);
});
test('Mexico administrative context shows all 33 source units without filtering 204 fixture rows or offshore records',()=>{
  const geometry=JSON.parse(fs.readFileSync('system/dist/data/admin1.geojson','utf8')),beforeGeometry=JSON.stringify(geometry);
  const fixtures=Array.from({length:204},(_,i)=>({...records[0],id:'fixture-'+i,country_id:i%2?'MEX':'outside'})),beforeRows=JSON.stringify(fixtures),beforeFit=map.lastFit;
  api.setCountry('');api.setRecords(fixtures);api.setAdmin1Context({geometry,countryId:'MEX'});const overlay=geoLayers.at(-1);
  assert.equal(overlay.features.length,33);assert.equal(overlay.options.interactive,false);assert(overlay.features.every(l=>l.feature.properties.country_id==='MEX'));
  assert.equal(api.getOverlays().admin1Context,true);assert.equal(api.getOverlays().country,'');api.setCountry('');assert(layers.has(overlay));
  assert.equal(api.getDisplayEvidence().selected_rows,204);assert.equal(fixtures.filter(e=>e.country_id==='outside').length,102);assert.equal(map.lastFit,beforeFit);
  api.setDisplayMode('heat');assert.equal(api.getDisplayEvidence().selected_rows,204);assert.equal(api.getDisplayEvidence().visible_rows,204);
  assert.equal(JSON.stringify(fixtures),beforeRows);assert.equal(JSON.stringify(geometry),beforeGeometry);
  api.setCountry('CAN');assert.equal(api.getOverlays().admin1Context,false);assert(!layers.has(overlay));api.setCountry('');api.setDisplayMode('points');api.setRecords(records);
});
test('real Leaflet resize compensation preserves the center through mobile, expansion and hidden reparenting',()=>{
  // Execute the pinned dependency's real method, rather than duplicating its
  // compensation algorithm in the mock. The small harness models its cached
  // container size, pixel origin and map pane in Web Mercator coordinates.
  const leaflet=fs.readFileSync('system/dist/vendor/leaflet/leaflet.js','utf8');
  const start=leaflet.indexOf('invalidateSize:function(')+'invalidateSize:'.length;
  const end=leaflet.indexOf(',stop:function(',start);
  assert(start>'invalidateSize:'.length&&end>start,'Pinned Leaflet invalidateSize method is available');
  const invalidate=vm.runInNewContext('('+leaflet.slice(start,end)+')',{
    l:Object.assign,a:(fn,scope,...args)=>fn.bind(scope,...args),setTimeout,clearTimeout
  });
  class Point {
    constructor(x,y){this.x=x;this.y=y;}
    clone(){return new Point(this.x,this.y);}
    divideBy(n){return new Point(this.x/n,this.y/n);}
    round(){return new Point(Math.round(this.x),Math.round(this.y));}
    subtract(p){return new Point(this.x-p.x,this.y-p.y);}
    add(p){return new Point(this.x+p.x,this.y+p.y);}
  }
  const scale=256*2**3;
  const project=([lat,lng])=>new Point((lng+180)/360*scale,(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2*scale);
  const unproject=p=>({lng:p.x/scale*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*p.y/scale)))*180/Math.PI});
  const saved={getSize:map.getSize,getCenter:map.getCenter,invalidateSize:map.invalidateSize,fire:map.fire,_rawPanBy:map._rawPanBy};
  const expected=[53,-125,3],beforeRows=JSON.stringify(records),beforeFit=map.lastFit;
  let pane,origin,moves=0;
  function reset(){
    mapElement.clientWidth=992;mapElement.clientHeight=600;map._loaded=true;map._sizeChanged=false;map._size=new Point(992,600);
    pane=new Point(0,0);origin=project(expected).subtract(map._size.divideBy(2));
  }
  try{
    map.getSize=function(){if(this._sizeChanged){this._size=new Point(mapElement.clientWidth,mapElement.clientHeight);this._sizeChanged=false;}return this._size.clone();};
    map.getCenter=()=>unproject(origin.add(map.getSize().divideBy(2)).subtract(pane));
    map._rawPanBy=offset=>{pane=pane.subtract(offset);};
    map.fire=function(type){if(type==='moveend')moves++;return this;};map.invalidateSize=invalidate;
    // Confirm the old pan:false behavior actually exposes the reported defect.
    reset();mapElement.clientWidth=346;mapElement.clientHeight=360;invalidate.call(map,{pan:false,animate:false});
    assert(Math.abs(map.getCenter().lng-expected[1])>50);
    reset();
    for(const [width,height] of [[346,360],[346,500],[346,360],[992,600],[346,360]]){
      mapElement.clientWidth=width;mapElement.clientHeight=height;api.resize();
      const view=api.getView();assert(Math.abs(view[0]-expected[0])<1e-10);assert(Math.abs(view[1]-expected[1])<1e-10);assert.equal(view[2],expected[2]);
    }
    const cached=map._size.clone(),beforeMoves=moves;mapElement.clientWidth=0;mapElement.clientHeight=0;api.resize();
    assert.equal(map._size.x,cached.x);assert.equal(map._size.y,cached.y);assert.equal(moves,beforeMoves);
    mapElement.clientWidth=992;mapElement.clientHeight=600;api.resize();
    const view=api.getView();assert(Math.abs(view[0]-expected[0])<1e-10);assert(Math.abs(view[1]-expected[1])<1e-10);
    assert.equal(map.lastFit,beforeFit);assert.equal(JSON.stringify(records),beforeRows);
    assert.equal(map.options.trackResize,false);
  }finally{Object.assign(map,saved);delete map._size;delete map._sizeChanged;delete map._loaded;}
});
console.log(JSON.stringify({passed:count,base_choices:ids.length,network_requests:0},null,2));
