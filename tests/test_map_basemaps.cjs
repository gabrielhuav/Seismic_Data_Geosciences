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
  getContext(){return {setTransform(){},beginPath(){},arc(){},fill(){},stroke(){}};}
  remove(){}
  fire(type,event={}){for(const callback of this.listeners[type]||[])callback(event);}
}
const nodeById={mapStatus:new Element()},controls=[],tileLayers=[],layers=new Set(),attributions=new Set();
const map={options:{},controls,layers,
  attributionControl:{setPrefix(){},addAttribution(value){attributions.add(value);},removeAttribution(value){attributions.delete(value);}},
  on(){},off(){},createPane(){return new Element();},getPanes(){return {overlayPane:new Element()};},getSize(){return {x:800,y:500};},containerPointToLayerPoint(){return {x:0,y:0};},
  latLngToContainerPoint(){return {x:400,y:250};},getZoom(){return 3;},getCenter(){return {lat:50,lng:-120};},
  hasLayer(layer){return layers.has(layer);},removeLayer(layer){if(layers.delete(layer)){layer.onRemove?.(this);layer.fire?.('remove');}return this;},closePopup(){},fitBounds(){},setView(){},invalidateSize(){}};
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
  fire(name){for(const callback of [...(this.handlers?.[name]||[])])callback();return this;}
  clearLayers(){}
  addLayer(){}
  setStyle(){}
  setIcon(){}
}
const L={map:(_,options)=>{map.options=options;return map;},latLngBounds:values=>values,
  canvas:()=>({}),geoJSON:()=>new Layer(),layerGroup:()=>new Layer(),marker:()=>new Layer(),divIcon:()=>({}),
  control:options=>({options,addTo(m){this.element=this.onAdd?.(m);controls.push(this);return this;}}),
  DomUtil:{create:(tag,cls)=>{const element=new Element(tag);element.className=cls;return element;},setPosition(){}},
  DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}},
  Layer:{extend(proto){class Custom extends Layer{}Object.assign(Custom.prototype,proto);return Custom;}},
  tileLayer(url,options){const tile=new Layer();tile.url=url;tile.options=options;tileLayers.push(tile);return tile;}};
L.control.scale=()=>({addTo(){}});
const document={documentElement:{},createElement:tag=>new Element(tag),getElementById:id=>nodeById[id]};
const context={window:{devicePixelRatio:1,matchMedia:()=>({matches:true,addEventListener(){}})},document,L};
vm.createContext(context);vm.runInContext(fs.readFileSync('system/dist/map.js','utf8'),context);
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
let language='es',changes=[],statuses=[];
const basemap={type:'FeatureCollection',features:[]},original=JSON.stringify(basemap);
const api=context.window.createSeismicMap({element:new Element(),basemap,onSelect(){},
  translate:key=>language+':'+key,onBaseChange:id=>changes.push(id),onBaseStatus:key=>statuses.push(key)});
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
console.log(JSON.stringify({passed:count,base_choices:ids.length,network_requests:0},null,2));
