'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),S=require('../system/dist/revision-story.js');
const data=JSON.parse(fs.readFileSync('system/dist/data/revisions.json','utf8')),original=JSON.stringify(data);
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
test('the genuine seven-version branch keeps reported endpoints, product clocks and provenance',()=>{
  const m=S.model(data);assert.equal(m.event.id,'us2000ahv0');assert.equal(m.versions.length,7);assert.equal(m.before.magnitude,8);assert.equal(m.after.magnitude,8.2);
  assert.equal(m.before.depth_km,35);assert.equal(m.after.depth_km,47.39);assert(Math.abs(m.depth_delta_km-12.39)<1e-10);assert(Math.abs(m.magnitude_delta-.2)<1e-10);
  assert(Math.abs(m.epicentre_displacement_km-9.937926688036613)<1e-9);assert.equal(m.before.update_time_utc,'2017-09-08T05:08:47.040Z');assert.equal(m.after.update_time_utc,'2017-12-07T20:00:19.040Z');
  assert.equal(m.event.raw_sha256,'f743036b6ca652ae69ec17ece802127b37d8923072ca6028896945b68a91ddd0');assert.equal(m.event_choices.length,36);
  assert(m.limits.some(s=>s.includes('not necessarily first issued')));assert.equal(JSON.stringify(data),original);
});
test('threshold membership uses the same exact-type pairs for earliest and latest retained queries',()=>{
  const a=S.model(data,{endpoint:'earliest'}),b=S.model(data,{endpoint:'latest'});
  assert.equal(a.threshold.pair_count,30);assert.equal(a.threshold.members.length,26);assert.equal(b.threshold.members.length,30);assert.equal(b.threshold.crossings.length,4);
  assert.deepEqual(new Set(b.threshold.crossings.map(p=>p.event_id)),new Set(['us2000ailq','us2000ap3b','us2000aqji','us1000arzf']));
  assert(b.threshold.pairs.every(p=>p.mag_type==='mww'));assert(a.threshold.members.every(p=>p.earliest>=5.5));assert(b.threshold.members.every(p=>p.latest>=5.5));
  assert.equal(b.threshold.example.event_id,'us2000ap3b');assert.equal(b.threshold.example.earliest,5.4);assert.equal(b.threshold.example.latest,5.6);
  assert.deepEqual(a.threshold.pairs,b.threshold.pairs);assert.equal(JSON.stringify(data),original);
});
test('native panels have complete discrete timestamps, readable labels and no continuous trajectory',()=>{
  const m=S.model(data),en=S.html(m,'en'),es=S.html(m,'es');
  for(const id of ['revisionStoryBeforeAfter','revisionStoryThreshold','revisionStoryTimeline'])assert(en.includes('id="'+id+'"'));
  assert.equal((en.match(/<time datetime=/g)||[]).length,7);for(const v of m.versions)assert(en.includes('datetime="'+v.update_time_utc+'"'));
  assert.equal((en.match(/data-product-id=/g)||[]).length,7);assert(!/<svg|<path|<canvas|<line\b/.test(en));
  assert(en.includes('Card spacing is ordinal, not elapsed time'));assert(en.includes('Product update (UTC)'));assert(en.includes('26/30')&&en.includes('30/30'));
  assert(es.includes('Un evento, dos soluciones conservadas'));assert(es.includes('Actualización del producto (UTC)'));assert(es.includes('no tiempo transcurrido'));
  assert(en.includes('No historical')||en.includes('no continuous curve'));assert(en.includes(m.event.raw_sha256));
});
test('mixed types and deletion do not fabricate comparable magnitude deltas or a later retained endpoint',()=>{
  const mixed=JSON.parse(original),e=mixed.events.find(e=>e.id==='us2000ahv0');e.versions.at(-1).magnitude_type='mb';const m=S.model(mixed);
  assert.equal(m.magnitude_delta,null);assert.equal(m.threshold.pair_count,29);assert.equal(m.after.magnitude_type,'mb');
  const deleted=JSON.parse(original),d=deleted.events.find(e=>e.id==='us2000ahv0');d.versions.at(-1).status='DELETE';const n=S.model(deleted);
  assert.equal(n.versions.length,6);assert.equal(n.after.update_time_utc,'2017-10-27T21:44:51.040Z');
  const conflict=JSON.parse(original),c=conflict.events.find(e=>e.id==='us2000ahv0');c.versions.push({...c.versions[0],magnitude:9});assert.throws(()=>S.model(conflict),/Conflicting/);
  assert.equal(JSON.stringify(data),original);
});
test('controller preserves event/endpoint state across languages and notifies only user event changes',()=>{
  const callbacks=[],listeners={},element={innerHTML:'',classList:{add(){}},addEventListener(k,f){listeners[k]=f;},removeEventListener(k){delete listeners[k];}};let lang='en';
  const api=S.mount(element,{data,getLanguage:()=>lang,onEventSelect:id=>callbacks.push(id)});api.setEndpoint('earliest');api.setEvent('us2000ap3b');
  assert.equal(callbacks.length,0);assert.equal(api.getModel().event.id,'us2000ap3b');assert.equal(api.getModel().threshold.endpoint,'earliest');lang='es';api.refreshLanguage();assert(element.innerHTML.includes('Un evento'));
  listeners.change({target:{dataset:{storyControl:'event'},value:'us2000ahv0'}});assert.deepEqual(callbacks,['us2000ahv0']);assert.equal(api.getModel().versions.length,7);
  const snapshot=api.getModel();snapshot.before.depth_km=999;assert.equal(api.getModel().before.depth_km,35);
  assert.throws(()=>api.update({endpoint:'preferred'}),/Choose/);assert.equal(api.getModel().threshold.endpoint,'earliest');api.render();
  api.dispose();assert.equal(element.innerHTML,'');assert(!listeners.change);
});
console.log(JSON.stringify({passed,observed_primary_versions:7,threshold_pairs:30,earliest_members:26,latest_members:30,network_requests:0}));
