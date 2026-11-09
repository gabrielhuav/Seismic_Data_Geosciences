'use strict';
// Exercise generated guided questions against the actual pinned SQLite engine.
// Independent row predicates below are the oracle; no browser/network is needed.
const assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../system/dist/sql-panel.js'),Q=require('../system/dist/sql-explorer.js');
const init=require('../system/dist/vendor/sqljs/sql-wasm.js');
async function main(){
  const SQL=await init({wasmBinary:fs.readFileSync('system/dist/vendor/sqljs/sql-wasm.wasm')});
  let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
  const A="catalog'one",records=[
    {catalogue_id:A,record_key:'a',year:2020,time:'2020-01-01',mag:4.5,mag_type:'mww',depth_km:null,country_id:'CAN',admin1_id:null},
    {catalogue_id:A,record_key:'b',year:2022,time:'2022-01-01',mag:5.5,mag_type:'mww',depth_km:0,country_id:'CAN',admin1_id:'CAN-1'},
    {catalogue_id:A,record_key:'c',year:2022,time:'2022-02-01',mag:6.5,mag_type:'mww',depth_km:10,country_id:'MEX',admin1_id:'MEX-1'},
    {catalogue_id:A,record_key:'different-case',year:2021,mag:9,mag_type:'Mww',depth_km:999,country_id:'CAN'},
    {catalogue_id:A,record_key:'unknown',year:2020,mag:3.5,mag_type:null,depth_km:null,country_id:'outside'},
    {catalogue_id:A,record_key:'empty',year:2021,mag:4,mag_type:'',depth_km:1,country_id:'CAN'},
    {catalogue_id:'B',record_key:'different-source',year:2021,mag:8,mag_type:'mww',depth_km:20,country_id:'CAN'}
  ];
  const input={records,catalogs:[{catalogue_id:A},{catalogue_id:'B'}],key:'fixture',evidence:{sha256:'fixture'}};
  const original=JSON.stringify(input),db=await Q.createDatabase(SQL,input),group=P.guidedGroups(input).find(g=>g.catalogue_id===A&&g.mag_type==='mww');
  const execute=(question,g=group,level)=>Q.execute(db.db,P.buildGuidedQuery(question,g,level));
  await test('guided groups preserve exact case, catalogue identity, empty literals and NULL without mutation',()=>{
    assert.equal(P.guidedGroups(input).length,5);assert.equal(group.count,3);
    assert.equal(P.guidedGroups(input).find(g=>g.mag_type===null).count,1);
    assert.equal(P.guidedGroups(input).find(g=>g.mag_type==='').count,1);
    assert.equal(JSON.stringify(input),original);
  });
  await test('summary is a genuine read-only SQL result; zero depth is valid and unknown depth is never imputed',()=>{
    const result=execute('summary'),summary=P.summaryFromResult(result);
    assert.deepEqual(summary,{count:3,magnitude_n:3,mean_magnitude:5.5,minimum:4.5,maximum:6.5,depth_n:2,mean_depth_km:5,unknown_magnitudes:0,unknown_depths:1});
    assert.equal(Q.execute(db.db,'SELECT COUNT(*) FROM records').rows[0][0],7);
    assert.throws(()=>db.db.run('UPDATE records SET mag=10'),/readonly/);
  });
  await test('annual series counts the exact group and explicitly retains internal zero years',()=>{
    const result=execute('annual');assert.deepEqual(result.rows,[[2020,1],[2021,0],[2022,2]]);
    assert(P.guidedChart('annual',result,'en').includes('not physical absence'));
    assert(P.guidedChart('annual',result,'es').includes('no ausencia física'));
  });
  await test('country/subdivision grouping and record inspection retain every selected row and NULL category',()=>{
    assert.deepEqual(execute('regions').rows,[['CAN',2,1],['MEX',1,1]]);
    const subdivisions=execute('regions',group,'admin1');
    assert(subdivisions.rows.some(r=>r[0]==='CAN'&&r[1]===null&&r[2]===1));
    assert.equal(subdivisions.rows.reduce((n,r)=>n+r[2],0),3);
    const rows=execute('records');assert.equal(rows.rows.length,3);
    assert(rows.rows.some(r=>r[5]===null));assert(rows.rows.some(r=>r[5]===0));
  });
  await test('empty and unknown-type groups retain NULL means and separate scope; CSV preserves null versus empty',()=>{
    const empty=P.summaryFromResult(execute('summary',null));assert.equal(empty.count,0);assert.equal(empty.mean_magnitude,null);assert.equal(empty.minimum,null);assert.equal(empty.mean_depth_km,null);
    const unknown=P.guidedGroups(input).find(g=>g.mag_type===null);assert.equal(P.summaryFromResult(execute('summary',unknown)).count,1);
    assert.equal(P.toCsv(['null','empty','zero'],[[null,'',0]]),'"null","empty","zero"\r\n,"","0"\r\n');
  });
  db.db.close();
  await test('real 659-row USGS case agrees with an independent row predicate and arithmetic',async()=>{
    const registry=JSON.parse(fs.readFileSync('system/dist/data/catalogs.json','utf8')),catalog=registry.catalogs.find(c=>c.id==='usgs-na-2020-2025');
    const pack=JSON.parse(fs.readFileSync('system/dist/'+catalog.events_url,'utf8'));
    const selected=pack.rows.map(row=>Object.fromEntries(pack.fields.map((name,i)=>[name,row[i]]))).filter(r=>Number(r.time.slice(0,4))>=2020&&Number(r.time.slice(0,4))<=2025&&r.mag>=4.5&&r.mag<=10&&r.magType==='mww'&&(r.depth===null||r.depth<=1000));
    const payload={catalogs:[{catalogue_id:catalog.id}],records:selected.map((r,i)=>({catalogue_id:catalog.id,record_key:r.id,time:r.time,year:Number(r.time.slice(0,4)),mag:r.mag,mag_type:r.magType,depth_km:r.depth})),key:'real-659'};
    const database=await Q.createDatabase(SQL,payload),g=P.guidedGroups(payload)[0],summary=P.summaryFromResult(Q.execute(database.db,P.buildGuidedQuery('summary',g)));
    assert.equal(selected.length,659);assert.equal(summary.count,selected.length);assert.equal(summary.depth_n,659);
    assert(Math.abs(summary.mean_magnitude-selected.reduce((n,r)=>n+r.mag,0)/selected.length)<1e-12);
    assert(Math.abs(summary.mean_depth_km-selected.reduce((n,r)=>n+r.depth,0)/selected.length)<1e-12);
    assert.equal(summary.minimum,4.5);assert.equal(summary.maximum,8.2);
    assert.deepEqual(Q.execute(database.db,P.buildGuidedQuery('annual',g)).rows.map(r=>r[1]),[120,104,93,75,124,143]);
    database.db.close();
  });
  await test('guided record inspection keeps the real 5000-row cap and reports truncation',async()=>{
    const payload={catalogs:[{catalogue_id:'many'}],records:Array.from({length:5002},(_,i)=>({catalogue_id:'many',record_key:String(i),mag:4.5,mag_type:'mww',year:2025})),key:'large'};
    const database=await Q.createDatabase(SQL,payload),result=Q.execute(database.db,P.buildGuidedQuery('records',P.guidedGroups(payload)[0]));
    assert.equal(result.rows.length,5000);assert.equal(result.limit,5000);assert.equal(result.truncated,true);database.db.close();
  });
  console.log(JSON.stringify({passed}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
