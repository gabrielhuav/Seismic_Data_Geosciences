(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicSQL=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const version='1.13.0',defaultLimit=5000;
  const recordColumns=Object.freeze([
    ['row_no','INTEGER'],['record_key','TEXT'],['catalogue_id','TEXT'],['event_id','TEXT'],['time','TEXT'],['year','INTEGER'],
    ['latitude','REAL'],['longitude','REAL'],['mag','REAL'],['mag_type','TEXT'],['depth_km','REAL'],['country_id','TEXT'],['admin1_id','TEXT'],
    ['provider','TEXT'],['location_source','TEXT'],['mag_source','TEXT'],['place','TEXT'],['identifier_kind','TEXT'],['original_fields','TEXT']
  ]);
  const catalogColumns=Object.freeze([['catalogue_id','TEXT'],['label','TEXT'],['provider','TEXT'],['snapshot','TEXT'],['source_hash','TEXT'],['manifest_hash','TEXT'],['identifier_kind','TEXT'],['depth_unit','TEXT']]);
  const error=(message,code)=>Object.assign(new Error(message),{code});
  const copy=value=>JSON.parse(JSON.stringify(value??null));

  // A scanner, rather than splitting on semicolons, preserves literal strings and
  // comments. SQLite query_only and the derived-table wrapper are additional guards.
  function validateSQL(input){
    if(typeof input!=='string'||!input.trim())throw error('Enter one SELECT query.','SQL_INVALID');
    if(input.length>20000)throw error('SQL is limited to 20,000 characters.','SQL_INVALID');
    let i=0,end=input.length,terminated=false;const words=[];
    while(i<input.length){
      const c=input[i],n=input[i+1];
      if(/\s/.test(c)){i++;continue;}
      if(c==='-'&&n==='-'){i=input.indexOf('\n',i+2);if(i<0)i=input.length;continue;}
      if(c==='/'&&n==='*'){const next=input.indexOf('*/',i+2);if(next<0)throw error('Unclosed SQL comment.','SQL_INVALID');i=next+2;continue;}
      if(terminated)throw error('Only one SQL statement is allowed.','SQL_INVALID');
      if(c===';'){end=i;terminated=true;i++;continue;}
      if(c==="'"||c==='"'||c==='`'||c==='['){
        const close=c==='['?']':c;i++;let closed=false;
        while(i<input.length){if(input[i]===close){if(input[i+1]===close){i+=2;continue;}i++;closed=true;break;}i++;}
        if(!closed)throw error('Unclosed SQL string or identifier.','SQL_INVALID');continue;
      }
      const word=input.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
      if(word){words.push(word[0].toUpperCase());i+=word[0].length;}else i++;
    }
    if(!['SELECT','WITH'].includes(words[0]))throw error('Only SELECT or WITH queries are available.','SQL_READ_ONLY');
    const forbidden=new Set(['PRAGMA','ATTACH','DETACH','INSERT','UPDATE','DELETE','DROP','ALTER','CREATE','VACUUM','ANALYZE','REINDEX','LOAD_EXTENSION','WRITEFILE','READFILE']);
    if(words.some(word=>forbidden.has(word)))throw error('This explorer accepts read-only queries only.','SQL_READ_ONLY');
    return input.slice(0,end).trim();
  }
  function scalar(value,type){
    if(value===null||value===undefined)return null;
    if(type==='REAL'||type==='INTEGER'){
      if(typeof value!=='number'||!Number.isFinite(value)||(type==='INTEGER'&&!Number.isInteger(value)))throw error('Invalid numeric value in the query snapshot.','SQL_DATA');
      return value;
    }
    if(typeof value==='object')return JSON.stringify(value);
    return String(value);
  }
  function projectRecord(row,index){
    const source={...row,row_no:index+1};
    source.catalogue_id=row.catalogue_id??row.catalog_id??row._catalog_id;
    source.record_key=row.record_key??row.id;
    source.event_id=row.event_id??row.source_event_id??row.id;
    if(!source.record_key||!source.catalogue_id)throw error('Records need catalogue and preserved row keys.','SQL_DATA');
    return recordColumns.map(([name,type])=>scalar(source[name],type));
  }
  function projectCatalog(row){
    const source={...row,catalogue_id:row.catalogue_id??row.id};
    if(!source.catalogue_id)throw error('Catalogue identity is missing.','SQL_DATA');
    if(source.label&&typeof source.label==='object')source.label=source.label.en??source.label.es??source.catalogue_id;
    source.source_hash=row.source_hash??row.sha256;
    source.manifest_hash=row.manifest_hash??row.manifest_sha256;
    return catalogColumns.map(([name,type])=>scalar(source[name],type));
  }
  async function createDatabase(SQL,payload,onProgress=()=>{}){
    if(!payload||!Array.isArray(payload.records)||!Array.isArray(payload.catalogs))throw error('The query snapshot is unavailable.','SQL_DATA');
    const db=new SQL.Database(),started=Date.now();
    try{
      db.run('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON;');
      db.run('CREATE TABLE catalogs ('+catalogColumns.map(([name,type])=>name+' '+type+(name==='catalogue_id'?' PRIMARY KEY':'')).join(',')+');');
      db.run('CREATE TABLE records ('+recordColumns.map(([name,type])=>name+' '+type+(name==='row_no'?' PRIMARY KEY':'')).join(',')+', FOREIGN KEY(catalogue_id) REFERENCES catalogs(catalogue_id));');
      db.run('BEGIN');
      const catalog=db.prepare('INSERT INTO catalogs VALUES('+catalogColumns.map(()=>'?').join(',')+')');
      try{for(const row of payload.catalogs)catalog.run(projectCatalog(row));}finally{catalog.free();}
      const insert=db.prepare('INSERT INTO records VALUES('+recordColumns.map(()=>'?').join(',')+')');
      try{
        for(let i=0;i<payload.records.length;i++){
          insert.run(projectRecord(payload.records[i],i));
          if(i%5000===0)onProgress({phase:'importing',loaded:i,total:payload.records.length});
        }
      }finally{insert.free();}
      db.run('COMMIT');
      db.run('CREATE INDEX records_catalogue ON records(catalogue_id); CREATE INDEX records_year ON records(year);');
      db.run('PRAGMA query_only=ON;');
      const metadata={recordCount:payload.records.length,catalogueCount:payload.catalogs.length,selectionKey:String(payload.key??''),importMs:Date.now()-started,
        engine:'SQLite via sql.js '+version,recordColumns:recordColumns.map(([name,type])=>({name,type})),catalogColumns:catalogColumns.map(([name,type])=>({name,type})),evidence:copy(payload.evidence)};
      onProgress({phase:'ready',loaded:payload.records.length,total:payload.records.length});return {db,metadata};
    }catch(exc){db.close();throw exc;}
  }
  function execute(database,query,options={}){
    const sql=validateSQL(query),limit=Number.isInteger(options.limit)&&options.limit>0?Math.min(options.limit,defaultLimit):defaultLimit;
    const started=Date.now(),statement=database.prepare('SELECT * FROM (\n'+sql+'\n) AS explorer_result LIMIT '+(limit+1));
    const rows=[];let columns;
    try{
      columns=statement.getColumnNames();let bytes=0;
      while(statement.step()){
        const row=statement.get();bytes+=JSON.stringify(row).length;
        if(bytes>16000000)throw error('Query output exceeds the 16 MB result limit. Select fewer columns or use a smaller LIMIT.','SQL_RESULT_LIMIT');
        rows.push(row);if(rows.length>limit)break;
      }
    }finally{statement.free();}
    const truncated=rows.length>limit;if(truncated)rows.pop();
    return {sql,columns,rows,rowCount:rows.length,truncated,limit,elapsedMs:Date.now()-started};
  }
  function create(options={}){
    let worker=null,serial=0,pending=new Map(),ready=false,currentKey='',targetKey='',loading=null,disposed=false,generation=0,lastMetadata=null;
    const status=event=>{if(options.onStatus)options.onStatus(event);};
    function stop(reason=error('SQL operation cancelled.','SQL_CANCELLED')){
      generation++;if(worker)worker.terminate();worker=null;ready=false;currentKey='';targetKey='';loading=null;lastMetadata=null;
      for(const item of pending.values()){clearTimeout(item.timer);item.reject(reason);}pending.clear();
    }
    function ensureWorker(){
      if(disposed)throw error('SQL explorer is closed.','SQL_CLOSED');
      if(!worker){
        const factory=options.workerFactory||(url=>new Worker(url));worker=factory(options.workerURL||'sql-worker.js');
        worker.onmessage=event=>{
          const message=event.data||{};if(message.type==='progress'){status(message.status);return;}
          const item=pending.get(message.id);if(!item)return;clearTimeout(item.timer);pending.delete(message.id);
          if(message.error)item.reject(error(message.error.message,message.error.code||'SQL_ERROR'));else item.resolve(message.result);
        };
        worker.onerror=event=>{stop(error(event.message||'The SQL worker failed.','SQL_WORKER'));status({phase:'error',code:'SQL_WORKER'});};
      }
    }
    function request(type,data,timeout){
      ensureWorker();const id=++serial;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{stop(error('SQL time limit reached. Rebuild the query snapshot before trying again.','SQL_TIMEOUT'));status({phase:'timeout'});},timeout);
        pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...data});
      });
    }
    async function setData(payload){
      const key=String(payload?.key??'');if(ready&&key&&key===currentKey)return {...lastMetadata,reused:true};
      if(loading&&key&&key===targetKey)return loading;
      stop();targetKey=key;status({phase:'initializing',total:payload?.records?.length??0});
      const ownGeneration=generation;
      loading=request('load',{payload},options.importTimeoutMs||60000).then(result=>{if(ownGeneration!==generation)throw error('The query snapshot changed.','SQL_CANCELLED');ready=true;currentKey=key;loading=null;lastMetadata=result;return result;},exc=>{if(ownGeneration===generation){stop(exc);status({phase:'error',code:exc.code});}throw exc;});
      return loading;
    }
    async function query(sql){
      validateSQL(sql);if(!ready)throw error('Build the SQL query snapshot first.','SQL_NOT_READY');
      const ownGeneration=generation;status({phase:'querying'});
      try{const result=await request('query',{sql},options.timeoutMs||10000);status({phase:'ready'});return result;}
      catch(exc){if(ownGeneration===generation&&exc.code!=='SQL_TIMEOUT')status({phase:'error',code:exc.code});throw exc;}
    }
    return Object.freeze({setData,query,cancel(){stop();status({phase:'cancelled'});},dispose(){stop();disposed=true;status({phase:'closed'});},isReady:()=>ready});
  }
  return Object.freeze({create,validateSQL,createDatabase,execute,recordColumns,catalogColumns,version,defaultLimit});
});
