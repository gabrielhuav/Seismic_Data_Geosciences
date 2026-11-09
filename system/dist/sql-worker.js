'use strict';
// Dedicated, disposable worker: SQL never changes the map's verified arrays.
importScripts('sql-explorer.js','vendor/sqljs/sql-wasm.js');
let engine=null,database=null,metadata=null;
const WASM_HASH='0734155c83e493983d1f2ff5b09a4fab6e35a32e9449c7e4e545756439f62d73';
async function getEngine(){
  if(!engine)engine=(async()=>{
    const response=await fetch('vendor/sqljs/sql-wasm.wasm');if(!response.ok)throw new Error('SQLite engine download: HTTP '+response.status);
    const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==WASM_HASH)throw Object.assign(new Error('SQLite engine integrity mismatch.'),{code:'SQL_INTEGRITY'});
    return initSqlJs({wasmBinary:new Uint8Array(bytes),locateFile:file=>'vendor/sqljs/'+file});
  })();return engine;
}
self.onmessage=async event=>{
  const {id,type,payload,sql}=event.data||{};
  try{
    if(type==='load'){
      if(database){database.close();database=null;}metadata=null;
      const result=await SeismicSQL.createDatabase(await getEngine(),payload,status=>postMessage({type:'progress',status}));
      database=result.db;metadata=result.metadata;postMessage({id,result:metadata});
    }else if(type==='query'){
      if(!database||!metadata)throw Object.assign(new Error('Build the SQL query snapshot first.'),{code:'SQL_NOT_READY'});
      const result=SeismicSQL.execute(database,sql);
      Object.assign(result,{evidence:metadata.evidence,selectionKey:metadata.selectionKey,sourceRecordCount:metadata.recordCount,engine:metadata.engine});
      postMessage({id,result});
    }else throw new Error('Unknown SQL worker command.');
  }catch(exc){postMessage({id,error:{message:exc.message||String(exc),code:exc.code||'SQL_ERROR'}});}
};
