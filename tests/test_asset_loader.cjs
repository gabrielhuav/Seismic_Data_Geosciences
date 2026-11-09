'use strict';
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {gzipSync,gunzipSync}=require('node:zlib');
const A=require('../system/dist/asset-loader.js');
const enc=new TextEncoder();
const hash=async b=>Buffer.from(await webcrypto.subtle.digest('SHA-256',b)).toString('hex');
function response(bytes,status=200,failAfter=false){
  bytes=new Uint8Array(bytes);let position=0,reads=0;
  return {ok:status>=200&&status<300,status,headers:{get:()=>String(bytes.length)},body:{getReader:()=>({
    async read(){if(failAfter&&++reads===2)throw new Error('connection interrupted');if(position>=bytes.length)return {done:true};const end=Math.min(bytes.length,position+3),value=bytes.slice(position,end);position=end;return {value,done:false};},
    async cancel(){},releaseLock(){}
  })}};
}
async function main(){
  const raw=enc.encode(JSON.stringify({rows:[['é',0,null],['abc',-1,3.4]],fields:['label','n','depth']})),gz=gzipSync(raw);
  const entry={path:'data/catalogs/ssn-mx/events.json',bytes:raw.length,sha256:await hash(raw),gzip:{path:'data/catalogs/ssn-mx/events.json.gz',bytes:gz.length,sha256:await hash(gz)}};
  const transport={schema:'seismic-transport/1',assets:[entry]},events=[],requests=[];
  const make=options=>A.createLoader({crypto:webcrypto,transport,decompress:b=>gunzipSync(b),yieldTask:()=>Promise.resolve(),waitRetry:()=>Promise.resolve(),...options});
  let loader=make({fetch:async url=>{requests.push(url);return response(gz);},onProgress:e=>events.push(e)});
  const result=await loader.load(entry.path);
  assert.deepEqual(result.data,JSON.parse(new TextDecoder().decode(raw)));assert.equal(result.hash,entry.sha256);
  assert.equal(result.transfer.encoding,'gzip');assert.equal(result.transfer.bytes,gz.length);assert.equal(result.transfer.sourceBytes,raw.length);
  assert.deepEqual(requests,[entry.gzip.path]);
  const downloads=events.filter(e=>e.phase==='download');assert(downloads.length>2);assert.equal(downloads.at(-1).loaded,gz.length);assert(downloads.every(e=>e.total===gz.length));
  assert.deepEqual(events.filter(e=>e.phase==='verify').map(e=>e.encoding),['gzip','gzip']);assert.equal(events.at(-1).phase,'done');
  console.log('PASS gzip transport, original hashes and streamed byte progress preserve exact data');

  for(const status of [404,415]){
    const seen=[];loader=make({fetch:async url=>{seen.push(url);return url.endsWith('.gz')?response([],status):response(raw);}});
    const r=await loader.load(entry.path);assert.equal(r.hash,entry.sha256);assert.equal(r.transfer.encoding,'identity');assert.equal(r.transfer.fallback,'gzip-http-'+status);assert.deepEqual(seen,[entry.gzip.path,entry.path]);
  }
  const unsupported=[];loader=make({decompress:false,fetch:async url=>{unsupported.push(url);return response(raw);}});
  assert.equal((await loader.load(entry.path)).transfer.fallback,'gzip-unsupported');assert.deepEqual(unsupported,[entry.path]);
  console.log('PASS unsupported decompression and missing gzip use the verified original file');

  for(const kind of ['compressed-hash','compressed-size','original-hash','original-size','invalid-gzip']){
    const corrupt=JSON.parse(JSON.stringify(transport));let supplied=gz;
    if(kind==='compressed-hash')corrupt.assets[0].gzip.sha256='0'.repeat(64);
    if(kind==='compressed-size')corrupt.assets[0].gzip.bytes++;
    if(kind==='original-hash')corrupt.assets[0].sha256='0'.repeat(64);
    if(kind==='original-size')corrupt.assets[0].bytes++;
    if(kind==='invalid-gzip'){supplied=enc.encode('not a gzip payload');corrupt.assets[0].gzip={...entry.gzip,bytes:supplied.length,sha256:await hash(supplied)};}
    let calls=0;loader=make({transport:corrupt,fetch:async()=>{calls++;return response(supplied);}});
    await assert.rejects(loader.load(entry.path),e=>e.code==='INTEGRITY_ERROR',kind);assert.equal(calls,1,kind);
  }
  console.log('PASS corrupt compressed/original bytes stop loading without retries or silent fallback');

  for(const kind of ['http','fetch','stream']){
    let calls=0;loader=make({fetch:async()=>{calls++;if(calls===1){if(kind==='http')return response([],503);if(kind==='fetch')throw new Error('offline');if(kind==='stream')return response(gz,200,true);}return response(gz);}});
    const r=await loader.load(entry.path);assert.equal(calls,2);assert.equal(r.transfer.attempts,2);assert.equal(r.hash,entry.sha256);
  }
  let calls=0;loader=make({fetch:async()=>{calls++;return response([],502);}});await assert.rejects(loader.load(entry.path),e=>e.status===502);assert.equal(calls,3);
  calls=0;loader=make({fetch:async()=>{calls++;return response([],403);}});await assert.rejects(loader.load(entry.path),e=>e.status===403);assert.equal(calls,1);
  console.log('PASS network/server interruptions retry within the bound while permanent HTTP errors do not');

  const controller=new AbortController();controller.abort();calls=0;loader=make({fetch:async()=>{calls++;return response(gz);}});
  await assert.rejects(loader.load(entry.path,{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(calls,0);
  const mid=new AbortController();loader=make({fetch:async()=>response(gz),onProgress:e=>{if(e.phase==='download'&&e.loaded>0)mid.abort();}});
  await assert.rejects(loader.load(entry.path,{signal:mid.signal}),e=>e.name==='AbortError');
  console.log('PASS cancellation before and during a transfer does not continue parsing');

  const absolute='https://example.org/research/'+entry.path,absoluteSeen=[];loader=make({fetch:async url=>{absoluteSeen.push(url);return response(gz);}});await loader.load(absolute);
  assert.deepEqual(absoluteSeen,['https://example.org/research/'+entry.gzip.path]);
  loader=make({fetch:async()=>response(enc.encode('{"registry":1}'))});assert.equal((await loader.load('data/transport-manifest.json')).data.registry,1);
  console.log('PASS absolute project URLs retain their prefix and bootstrap JSON remains compatible');
  assert.throws(()=>make({transport:{assets:[{...entry,path:'../escape.json'}]}}));
  assert.throws(()=>make({transport:{assets:[{...entry,gzip:{...entry.gzip,path:'data/other.json.gz'}}]}}));
  assert.throws(()=>make({transport:{assets:[entry,entry]}}));
  assert.throws(()=>make({transport:{schema:'other/1',assets:[]}}));
  const duringRetry=new AbortController();let retriedCalls=0;
  loader=A.createLoader({crypto:webcrypto,transport,decompress:b=>gunzipSync(b),fetch:async()=>{retriedCalls++;return response([],503);},onProgress:e=>{if(e.phase==='retry')duringRetry.abort();}});
  await assert.rejects(loader.load(entry.path,{signal:duringRetry.signal}),e=>e.name==='AbortError');assert.equal(retriedCalls,1);
  console.log('PASS malformed transport entries fail early and cancellation interrupts retry backoff');
  console.log(JSON.stringify({passed:7}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
