(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicAssetLoader=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  class AssetIntegrityError extends Error {
    constructor(message){super(message);this.name='AssetIntegrityError';this.code='INTEGRITY_ERROR';}
  }
  class AssetHttpError extends Error {
    constructor(url,status){super(url+': HTTP '+status);this.name='AssetHttpError';this.status=status;}
  }
  function abortError(){const e=new Error('Asset load aborted');e.name='AbortError';return e;}
  function checkAbort(signal){if(signal?.aborted)throw abortError();}
  function pathOf(url){
    const text=String(url);
    // Manifest keys are site-relative. Preserve relative prefixes used by the caller.
    if(/^[a-z][a-z\d+.-]*:/i.test(text)){
      const u=new URL(text);const at=u.pathname.lastIndexOf('/data/');
      return at<0?u.pathname.replace(/^\//,''):u.pathname.slice(at+1);
    }
    return text.replace(/^\.\//,'').split(/[?#]/,1)[0];
  }
  function siblingUrl(url,path){
    const text=String(url),key=pathOf(text);
    const start=text.indexOf(key);
    if(start>=0)return text.slice(0,start)+path;
    return path;
  }
  async function digest(crypto,bytes){
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function defaultDecompress(bytes){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function createLoader(options={}){
    const fetcher=options.fetch||globalThis.fetch?.bind(globalThis),crypto=options.crypto||globalThis.crypto;
    if(typeof fetcher!=='function'||!crypto?.subtle)throw new Error('Fetch and Web Crypto are required');
    const retries=options.retries??2;
    if(!Number.isInteger(retries)||retries<0||retries>3)throw new Error('Retries must be an integer from zero to three');
    const transport=options.transport||{assets:[]},entries=new Map();
    if(!Array.isArray(transport.assets)||(transport.schema&&transport.schema!=='seismic-transport/1'))throw new Error('Invalid transport manifest');
    const validBytes=v=>Number.isSafeInteger(v)&&v>=0;
    const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
    const validPath=v=>typeof v==='string'&&/^data\/[A-Za-z0-9_./-]+$/.test(v)&&!v.split('/').some(s=>!s||s==='.'||s==='..');
    for(const item of transport.assets){
      if(!item||!validPath(item.path)||entries.has(item.path)||!validBytes(item.bytes)||!validHash(item.sha256))throw new Error('Invalid or duplicate transport entry');
      if(item.gzip&&(!validPath(item.gzip.path)||item.gzip.path!==item.path+'.gz'||!validBytes(item.gzip.bytes)||!validHash(item.gzip.sha256)))throw new Error('Invalid gzip transport entry');
      entries.set(item.path,item);
    }
    const decompressor=options.decompress===false?null:(options.decompress||(typeof DecompressionStream==='function'?defaultDecompress:null));
    const pause=options.yieldTask||(()=>new Promise(resolve=>setTimeout(resolve,0)));
    const waitRetry=options.waitRetry||((attempt,signal)=>new Promise((resolve,reject)=>{
      checkAbort(signal);
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},Math.min(attempt*250,750));
      const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(abortError());};
      signal?.addEventListener('abort',cancel,{once:true});
    }));
    function emit(event,call){options.onProgress?.(event);if(call.onProgress&&call.onProgress!==options.onProgress)call.onProgress(event);}
    async function download(url,requestUrl,encoding,expected,call){
      for(let attempt=1;attempt<=retries+1;attempt++){
        checkAbort(call.signal);
        try{
          let response;
          try{response=await fetcher(requestUrl,{signal:call.signal});}
          catch(error){if(error?.name==='AbortError'||call.signal?.aborted)throw abortError();error.retryable=true;throw error;}
          if(!response.ok){const error=new AssetHttpError(requestUrl,response.status);error.retryable=response.status>=500&&response.status<=599;throw error;}
          const header=Number(response.headers?.get?.('content-length'));
          const total=Number.isFinite(expected)?expected:(Number.isFinite(header)&&header>0?header:null);
          let loaded=0;const chunks=[];
          emit({url,requestUrl,phase:'download',encoding,attempt,loaded,total},call);
          if(response.body?.getReader){
            const reader=response.body.getReader();
            try{
              for(;;){checkAbort(call.signal);const part=await reader.read();if(part.done)break;
                const chunk=part.value instanceof Uint8Array?part.value:new Uint8Array(part.value);
                loaded+=chunk.byteLength;chunks.push(chunk);emit({url,requestUrl,phase:'download',encoding,attempt,loaded,total},call);
              }
            }catch(error){try{await reader.cancel();}catch(_){}if(error?.name==='AbortError'||call.signal?.aborted)throw abortError();error.retryable=true;throw error;}
            finally{reader.releaseLock?.();}
          }else{
            try{const chunk=new Uint8Array(await response.arrayBuffer());loaded=chunk.byteLength;chunks.push(chunk);}
            catch(error){if(error?.name==='AbortError'||call.signal?.aborted)throw abortError();error.retryable=true;throw error;}
            emit({url,requestUrl,phase:'download',encoding,attempt,loaded,total},call);
          }
          const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
          return {bytes,attempts:attempt};
        }catch(error){
          if(error?.name==='AbortError'||call.signal?.aborted)throw abortError();
          if(!error.retryable||attempt>retries)throw error;
          emit({url,requestUrl,phase:'retry',encoding,attempt,loaded:0,total:expected??null},call);
          await waitRetry(attempt,call.signal);checkAbort(call.signal);
        }
      }
    }
    async function verify(bytes,expected,url,call,encoding){
      checkAbort(call.signal);emit({url,phase:'verify',encoding,loaded:bytes.byteLength,total:expected?.bytes??bytes.byteLength},call);await pause();
      if(expected&&bytes.byteLength!==expected.bytes)throw new AssetIntegrityError(url+': byte length differs from the transport manifest');
      const hash=await digest(crypto,bytes);checkAbort(call.signal);
      if(expected&&hash!==expected.sha256)throw new AssetIntegrityError(url+': SHA-256 differs from the transport manifest');
      return hash;
    }
    async function load(url,call={}){
      url=String(url);const expected=entries.get(pathOf(url));let fetched,bytes,hash,encoding='identity',fallback=null;
      checkAbort(call.signal);
      if(expected?.gzip&&decompressor){
        const compressedUrl=siblingUrl(url,expected.gzip.path);
        try{fetched=await download(url,compressedUrl,'gzip',expected.gzip.bytes,call);}
        catch(error){
          if(!(error instanceof AssetHttpError)||![404,415].includes(error.status))throw error;
          fallback='gzip-http-'+error.status;emit({url,requestUrl:compressedUrl,phase:'fallback',encoding:'identity',loaded:0,total:expected.bytes},call);
        }
        if(fetched){
          await verify(fetched.bytes,expected.gzip,url,call,'gzip');
          emit({url,phase:'decompress',encoding:'gzip',loaded:fetched.bytes.byteLength,total:expected.gzip.bytes},call);await pause();checkAbort(call.signal);
          try{bytes=new Uint8Array(await decompressor(fetched.bytes));}
          catch(error){if(error?.name==='AbortError'||call.signal?.aborted)throw abortError();throw new AssetIntegrityError(url+': gzip decompression failed');}
          hash=await verify(bytes,expected,url,call,'gzip');encoding='gzip';
        }
      }else if(expected?.gzip)fallback='gzip-unsupported';
      if(!bytes){fetched=await download(url,url,'identity',expected?.bytes,call);bytes=fetched.bytes;hash=await verify(bytes,expected,url,call,'identity');}
      checkAbort(call.signal);emit({url,phase:'parse',encoding,loaded:bytes.byteLength,total:bytes.byteLength},call);await pause();checkAbort(call.signal);
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));checkAbort(call.signal);
      const transfer={url,encoding,bytes:fetched.bytes.byteLength,sourceBytes:bytes.byteLength,attempts:fetched.attempts,fallback};
      emit({url,phase:'done',encoding,loaded:transfer.bytes,total:transfer.bytes,sourceBytes:transfer.sourceBytes,attempt:transfer.attempts},call);
      return {data,hash,transfer};
    }
    return Object.freeze({load});
  }
  return Object.freeze({createLoader,AssetIntegrityError,AssetHttpError});
});
