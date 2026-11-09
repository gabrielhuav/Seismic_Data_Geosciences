'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const Q=require('../system/dist/sql-explorer.js');
const init=require('../system/dist/vendor/sqljs/sql-wasm.js');
async function main(){
  let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
  const SQL=await init({wasmBinary:fs.readFileSync('system/dist/vendor/sqljs/sql-wasm.wasm')});
  await test('one read-only statement preserves quoted semicolons, comments and escaped literals',()=>{
    for(const text of ["SELECT ';' AS value; -- end",'/* begin */ WITH x(v) AS (SELECT 1) SELECT v FROM x;',"SELECT 'it''s; safe'",'SELECT "name;part" FROM records',"SELECT REPLACE('DELETE','D','X')"])assert(Q.validateSQL(text));
    for(const text of ['DELETE FROM records','PRAGMA query_only=OFF','SELECT 1; DELETE FROM records','SELECT 1; SELECT 2','WITH x AS (SELECT 1) DELETE FROM records','SELECT 1 /* never closes',"SELECT 'unterminated"]){assert.throws(()=>Q.validateSQL(text));}
  });
  let handle;
  await test('SQLite import preserves multiplicity, source fields and unknown depth without mutating inputs',async()=>{
    const payload={key:'verified-selection',evidence:{sha256:'abc'},catalogs:[{id:'known',provider:'usgs'},{id:'unknown',provider:'nrcan'}],records:[
      {record_key:'same',catalogue_id:'known',event_id:'s',mag:0,mag_type:'mb',depth_km:-1,original_fields:{raw:'<unmodified>'}},
      {record_key:'same',catalogue_id:'known',event_id:'s',mag:0,mag_type:'mB',depth_km:0},
      {record_key:'local-key',catalogue_id:'unknown',event_id:'local-key',mag:3.5,mag_type:null,depth_km:null}
    ]};const before=JSON.stringify(payload);handle=await Q.createDatabase(SQL,payload);
    assert.equal(JSON.stringify(payload),before);assert.equal(handle.metadata.recordCount,3);
    assert.deepEqual(Q.execute(handle.db,'SELECT row_no,record_key,mag_type,depth_km FROM records ORDER BY row_no').rows,[[1,'same','mb',-1],[2,'same','mB',0],[3,'local-key',null,null]]);
    assert.equal(Q.execute(handle.db,"SELECT COUNT(*) FROM records r JOIN catalogs c USING(catalogue_id)").rows[0][0],3);
    assert.equal(Q.execute(handle.db,"SELECT original_fields FROM records WHERE row_no=1").rows[0][0],'{"raw":"<unmodified>"}');
    assert.throws(()=>handle.db.run('DELETE FROM records'),/readonly/);
    for(const query of ['INSERT INTO records(row_no) VALUES(4)','SELECT 1; UPDATE records SET mag=7','WITH x AS(SELECT 1) DELETE FROM records'])assert.throws(()=>Q.execute(handle.db,query));
    assert.equal(Q.execute(handle.db,'SELECT COUNT(*) FROM records').rows[0][0],3);
  });
  await test('result limit is explicit and zero-row queries retain column names',()=>{
    const result=Q.execute(handle.db,'SELECT record_key FROM records ORDER BY row_no',{limit:2});assert.equal(result.rowCount,2);assert(result.truncated);assert.equal(result.limit,2);
    assert.deepEqual(Q.execute(handle.db,'SELECT mag FROM records WHERE 0').columns,['mag']);assert.deepEqual(Q.execute(handle.db,'SELECT mag FROM records WHERE 0').rows,[]);
    handle.db.close();
  });
  await test('browser client is lazy, snapshots are reusable and timeouts dispose isolated workers',async()=>{
    let created=0,terminated=0;
    const factory=()=>{created++;return {postMessage(m){if(m.type==='load')setTimeout(()=>this.onmessage({data:{id:m.id,result:{recordCount:1,selectionKey:m.payload.key}}}),1);},terminate(){terminated++;}};};
    const client=Q.create({workerFactory:factory,timeoutMs:10});assert.equal(created,0);
    await client.setData({key:'a',records:[],catalogs:[]});assert.equal(created,1);assert.equal((await client.setData({key:'a'})).recordCount,1);
    await assert.rejects(client.query('SELECT 1'),e=>e.code==='SQL_TIMEOUT');assert.equal(terminated,1);assert.equal(client.isReady(),false);
    await assert.rejects(client.query('SELECT 1'),e=>e.code==='SQL_NOT_READY');client.dispose();
  });
  await test('a replacement snapshot survives rejection of the cancelled previous load',async()=>{
    let n=0;const client=Q.create({workerFactory:()=>{const instance=++n;return {postMessage(m){if(instance>1)setTimeout(()=>this.onmessage({data:{id:m.id,result:{selectionKey:m.payload.key}}}),1);},terminate(){}};}});
    const first=client.setData({key:'old',records:[],catalogs:[]}).catch(e=>e.code);
    const second=client.setData({key:'new',records:[],catalogs:[]});assert.equal(await first,'SQL_CANCELLED');assert.equal((await second).selectionKey,'new');assert(client.isReady());client.dispose();
  });
  console.log(JSON.stringify({passed:checks}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
