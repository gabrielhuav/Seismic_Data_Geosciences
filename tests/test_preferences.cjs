'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const code=fs.readFileSync('system/dist/preferences.js','utf8'), css=fs.readFileSync('system/dist/style.css','utf8');
let checks=0;
function test(name,run){run();checks++;console.log('PASS '+name);}
function browser({dark=false,stored=null,blocked=false}={}) {
  const attributes={},events={},mediaEvents={},storage=new Map();
  if(stored!==null)storage.set('seismic-observatory:appearance:v1',stored);
  const media={matches:dark,addEventListener:(type,fn)=>{mediaEvents[type]=fn;}};
  const window={document:{documentElement:{setAttribute:(key,value)=>{attributes[key]=value;}}},
    matchMedia:()=>media,addEventListener:(type,fn)=>{events[type]=fn;}};
  Object.defineProperty(window,'localStorage',{get(){if(blocked)throw Error('Storage blocked');return {getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};}});
  vm.runInNewContext(code,{window});
  return {P:window.SeismicPreferences,attributes,storage,events,changeSystem(dark){media.matches=dark;mediaEvents.change?.();}};
}
test('initial head application follows the OS before any body controls exist',()=>{
  for(const dark of [false,true]) {
    const b=browser({dark});assert.equal(b.attributes['data-theme'],'green');assert.equal(b.attributes['data-mode'],dark?'dark':'light');assert.equal(b.P.get().mode,'system');
  }
  const html=fs.readFileSync('system/dist/index.html','utf8');
  assert(html.indexOf('<script src="preferences.js"></script>')<html.indexOf('href="style.css"'));
});
test('all theme and mode choices persist under a project-specific key',()=>{
  const b=browser();
  for(const theme of ['green','blue','maroon'])for(const mode of ['system','light','dark']) {
    b.P.set({theme,mode});const saved=b.storage.get(b.P.key), reloaded=browser({stored:saved});
    assert.equal(reloaded.P.get().theme,theme);assert.equal(reloaded.P.get().mode,mode);
  }
  assert.equal(b.storage.size,1);assert(b.P.key.startsWith('seismic-observatory:'));
  b.P.set({theme:'unknown',mode:'unknown'});assert.equal(b.P.get().theme,'maroon');assert.equal(b.P.get().mode,'dark');
});
test('blocked or malformed browser storage cannot prevent changing appearance',()=>{
  const b=browser({blocked:true});let notified;
  b.P.subscribe(value=>{notified=value;});b.P.set({theme:'blue',mode:'dark'});
  assert.equal(b.attributes['data-theme'],'blue');assert.equal(b.attributes['data-mode'],'dark');assert.equal(notified.effectiveMode,'dark');
  const malformed=browser({stored:'{broken'});assert.equal(malformed.P.get().theme,'green');assert.equal(malformed.P.get().mode,'system');
});
test('system changes affect automatic mode; explicit modes and unrelated projects are independent',()=>{
  const b=browser();b.changeSystem(true);assert.equal(b.P.get().effectiveMode,'dark');
  b.P.set({mode:'light'});b.changeSystem(false);b.changeSystem(true);assert.equal(b.P.get().effectiveMode,'light');
  b.events.storage({key:'obraslago-tema',newValue:'azul'});assert.equal(b.P.get().theme,'green');
  b.events.storage({key:b.P.key,newValue:JSON.stringify({theme:'maroon',mode:'system'})});assert.equal(b.P.get().theme,'maroon');assert.equal(b.P.get().effectiveMode,'dark');
});
function palette(theme,mode) {
  const vars={};
  for(const match of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selector=match[1].trim();if(!selector.startsWith(':root'))continue;
    const t=selector.match(/\[data-theme="([^"]+)"\]/),m=selector.match(/\[data-mode="([^"]+)"\]/);
    if(t&&t[1]!==theme || m&&m[1]!==mode)continue;
    for(const declaration of match[2].matchAll(/(--[\w-]+):([^;{}]+)/g))vars[declaration[1]]=declaration[2].trim();
  }
  const resolve=name=>vars[name]?.startsWith('var(') ? resolve(vars[name].slice(4,-1)) : vars[name];
  return resolve;
}
function luminance(hex) {
  assert(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(hex),'Expected opaque hex, got '+hex);
  let h=hex.slice(1);if(h.length===3)h=[...h].map(c=>c+c).join('');
  const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function ratio(a,b) {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('six theme/mode combinations meet text and focus contrast thresholds',()=>{
  for(const theme of ['green','blue','maroon'])for(const mode of ['light','dark']) {
    const c=palette(theme,mode),context=theme+'/'+mode;
    for(const [fg,bg] of [['--ink','--paper'],['--muted','--paper'],['--green','--paper'],['--on-accent','--green'],['--on-accent','--accent-hover'],['--ink','--soft']])assert(ratio(c(fg),c(bg))>=4.5,context+' text '+fg+' '+bg);
    for(const [fg,bg] of [['--focus','--paper'],['--point-selected','--map-ocean'],['--point-shallow','--map-land'],['--point-deep','--map-land'],['--point-unknown','--map-land']])assert(ratio(c(fg),c(bg))>=3,context+' UI '+fg+' '+bg);
  }
});
console.log(JSON.stringify({passed:checks,appearance_combinations:6},null,2));
