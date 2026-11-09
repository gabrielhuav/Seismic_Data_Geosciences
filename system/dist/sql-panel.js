(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeismicSQLPanel = api;
})(typeof globalThis === 'object' ? globalThis : this, function (host) {
  'use strict';
  const PAGE_SIZE = 50;
  const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const messages = {
    es: {
      eyebrow:'PREGUNTAS SOBRE TUS DATOS', title:'Explora tu selección con SQL',
      intro:'Consulta las mismas filas verificadas del mapa, combina su catálogo de procedencia y conserva el resultado con su evidencia.',
      runtime:'SQLite en el navegador', local:'Consulta local · sin servidor ni Docker', selection:'Selección activa', records:'filas de origen', catalogues:'catálogos',
      scope:'El editor trabaja sobre la selección actual, incluidos sus filtros. Las filas no representan necesariamente terremotos únicos o independientes. Cambiar el mapa de fondo o desplazarlo no modifica esta selección.',
      schema:'Tablas disponibles', schemaHelp:'Nombres, tipos y significado de los campos que puedes consultar.', columns:'Columnas', type:'Tipo', meaning:'Significado',
      editorTitle:'Una pregunta, un resultado', editorLabel:'Consulta SQL', editorHelp:'Una sola consulta SELECT o WITH. Ctrl + Enter para ejecutar. La sesión se mantiene en memoria y no modifica los catálogos originales.',
      exampleLabel:'Ejemplos para empezar', useExample:'Usar ejemplo', run:'Ejecutar consulta', cancel:'Cancelar',
      idle:'Listo para consultar tu selección.', unavailable:'Espera a que terminen de cargar y verificarse los datos o corrige los filtros.',
      importing:'Preparando las tablas de la selección…', initializing:'Iniciando el motor local…', querying:'Ejecutando tu consulta…', cancelled:'Consulta cancelada. Puedes ejecutar otra vez.',
      stale:'La selección cambió. Ejecuta la consulta para obtener un resultado actualizado.', error:'No se pudo ejecutar la consulta.',
      timeout:'La consulta superó el tiempo disponible. Reduce el alcance o simplifica las combinaciones y vuelve a ejecutarla.',
      engineMissing:'El motor SQL todavía no está disponible. Recarga el sistema e inténtalo de nuevo.',
      result:'Resultado de la consulta', returned:'filas devueltas', execution:'Tiempo de consulta', exportCsv:'Descargar CSV', exportJson:'Descargar JSON y evidencia',
      none:'Todavía no hay resultados', noneHelp:'Elige un ejemplo o escribe una consulta. Los datos y el mapa permanecen intactos.',
      empty:'La consulta terminó sin filas. Ese resultado no establece ausencia física de sismos.',
      previous:'← Anterior', next:'Siguiente →', page:'Página {page} de {pages}', range:'Filas {from}–{to} de {count}',
      truncated:'Se alcanzó el límite de {limit} filas. Hay más resultados; la tabla y las descargas contienen únicamente las primeras {limit}. Usa filtros, agregaciones o un ORDER BY explícito.',
      resultScope:'Las agregaciones consultan toda la selección. La tabla se pagina de 50 en 50; la paginación no cambia los archivos descargados.',
      nullHelp:'NULL significa desconocido o no suministrado; no equivale a cero. El CSV usa un campo vacío para NULL; el JSON conserva null y los tipos de valor.',
      evidence:'Consulta y procedencia del resultado', evidenceHelp:'La descarga JSON conserva el SQL ejecutado, los filtros, hashes de entrada, claves de la selección y límites del resultado.',
      saved:'Archivo generado con el resultado visible y su alcance.', rowsLoaded:'{loaded} de {total} filas preparadas',
      notes:'La coincidencia de tipos de magnitud no prueba homogeneidad. No se estiman probabilidades, daños ni independencia entre fuentes.',
      exInspect:'Inspeccionar registros', exCatalogues:'Contar por catálogo', exYears:'Contar por año', exMagnitude:'Resumir magnitudes mww', exCountry:'Consultar países y profundidad',
      recordTable:'Filas de la selección · conserva una fila por registro de origen', catalogTable:'Procedencia de cada catálogo seleccionado',
      fieldRow:'Orden de la fila en la selección', fieldKey:'Clave de registro cualificada por catálogo', fieldCatalogue:'Identificador del catálogo; relación con catalogs', fieldEvent:'ID conservado de la fuente; NULL para claves derivadas SSN/NRCan',
      fieldTime:'Hora de origen UTC conservada', fieldYear:'Año UTC de origen', fieldLatitude:'Latitud reportada, grados', fieldLongitude:'Longitud reportada, grados', fieldMagnitude:'Magnitud reportada; sin conversión',
      fieldMagnitudeType:'Tipo literal; NULL si no se suministró', fieldDepth:'Sólo profundidad documentada en km; resto NULL', fieldCountry:'Clase terrestre de Natural Earth; outside/boundary explícitas',
      fieldProvider:'Distribuidor de los datos', fieldOrigin:'Agencia del origen cuando se suministró', fieldMagSource:'Agencia de magnitud cuando se suministró', fieldPlace:'Texto de localización conservado', fieldIdentifier:'Tipo de identificador conservado o derivado',
      fieldOriginal:'Campos raw_* y referencia/hash de fila disponibles, como JSON; resto en el paquete original', fieldLabel:'Nombre visible del catálogo', fieldSnapshot:'Versión o instantánea conservada', fieldSourceHash:'SHA-256 del paquete de registros', fieldManifestHash:'SHA-256 del manifiesto', fieldDepthUnit:'Unidad documentada de profundidad o NULL',
      exampleScope:'Los ejemplos se aplican a las filas que ya seleccionaste; no recuperan filas excluidas por los filtros.',
      evidencePreview:'Vista resumida; descarga el JSON para conservar la evidencia completa.', fieldAdmin:'Estado/provincia según polígono documentado; categorías admin1-* explícitas; NULL si no se cargó la capa',
      loadingBar:'Preparación de la selección SQL', tableLabel:'Filas devueltas por la consulta SQL', metadataLabel:'Evidencia del resultado SQL'
    },
    en: {
      eyebrow:'ASK QUESTIONS OF YOUR DATA', title:'Explore your selection with SQL',
      intro:'Query the same verified rows as the map, join their catalogue metadata and retain the result with its evidence.',
      runtime:'SQLite in the browser', local:'Local query · no server or Docker', selection:'Active selection', records:'source rows', catalogues:'catalogues',
      scope:'The editor uses the current selection, including its filters. Rows are not necessarily unique or independent earthquakes. Changing the map background or panning does not change this selection.',
      schema:'Available tables', schemaHelp:'Names, types and meanings of the fields you can query.', columns:'Columns', type:'Type', meaning:'Meaning',
      editorTitle:'One question, one result', editorLabel:'SQL query', editorHelp:'One SELECT or WITH query. Press Ctrl + Enter to run. The session stays in memory and does not modify the original catalogues.',
      exampleLabel:'Examples to start with', useExample:'Use example', run:'Run query', cancel:'Cancel',
      idle:'Ready to query your selection.', unavailable:'Wait for data loading and verification to finish, or correct the filters.',
      importing:'Preparing the selection tables…', initializing:'Starting the local engine…', querying:'Running your query…', cancelled:'Query cancelled. You can run it again.',
      stale:'The selection changed. Run the query for an updated result.', error:'The query could not be completed.',
      timeout:'The query exceeded the time limit. Narrow its scope or simplify joins, then run it again.',
      engineMissing:'The SQL engine is not available yet. Reload the system and try again.',
      result:'Query result', returned:'returned rows', execution:'Query time', exportCsv:'Download CSV', exportJson:'Download JSON and evidence',
      none:'No results yet', noneHelp:'Choose an example or write a query. The data and map remain intact.',
      empty:'The query returned no rows. This does not establish physical absence of earthquakes.',
      previous:'← Previous', next:'Next →', page:'Page {page} of {pages}', range:'Rows {from}–{to} of {count}',
      truncated:'The {limit}-row limit was reached. More results exist; the table and downloads contain only the first {limit}. Use filters, aggregations or an explicit ORDER BY.',
      resultScope:'Aggregations query the entire selection. The table shows 50 rows per page; pagination does not change downloaded files.',
      nullHelp:'NULL means unknown or not supplied; it is not zero. CSV represents NULL as an empty field; JSON preserves null and value types.',
      evidence:'Query and result provenance', evidenceHelp:'The JSON download preserves executed SQL, filters, input hashes, selection keys and result limits.',
      saved:'File generated with this result and its stated scope.', rowsLoaded:'{loaded} of {total} rows prepared',
      notes:'Matching magnitude types do not establish homogeneity. No probability, damage or source-independence estimate is made.',
      exInspect:'Inspect source records', exCatalogues:'Count by catalogue', exYears:'Count by year', exMagnitude:'Summarize mww magnitudes', exCountry:'Inspect country and depth',
      recordTable:'Selection rows · one row per retained source record', catalogTable:'Provenance of each selected catalogue',
      fieldRow:'Row order within the selection', fieldKey:'Catalogue-qualified record key', fieldCatalogue:'Catalogue identifier; relationship to catalogs', fieldEvent:'Retained source ID; NULL for derived SSN/NRCan keys',
      fieldTime:'Retained UTC origin time', fieldYear:'UTC origin year', fieldLatitude:'Reported latitude, degrees', fieldLongitude:'Reported longitude, degrees', fieldMagnitude:'Reported magnitude; no conversion',
      fieldMagnitudeType:'Literal type; NULL when not supplied', fieldDepth:'Documented kilometre depth only; otherwise NULL', fieldCountry:'Natural Earth land class; explicit outside/boundary',
      fieldProvider:'Data distributor', fieldOrigin:'Origin agency when supplied', fieldMagSource:'Magnitude agency when supplied', fieldPlace:'Retained location text', fieldIdentifier:'Retained or derived identifier kind',
      fieldOriginal:'Available raw_* fields and row reference/hash as JSON; other fields remain in the original package', fieldLabel:'Display name of the catalogue', fieldSnapshot:'Preserved version or snapshot', fieldSourceHash:'SHA-256 of the records package', fieldManifestHash:'SHA-256 of the manifest', fieldDepthUnit:'Documented depth unit or NULL',
      exampleScope:'Examples use the rows you have already selected; they do not recover rows excluded by filters.',
      evidencePreview:'Abbreviated preview; download JSON to retain the complete evidence.', fieldAdmin:'State/province from documented polygons; explicit admin1-* categories; NULL if the layer is not loaded',
      loadingBar:'Preparing the SQL selection', tableLabel:'Rows returned by the SQL query', metadataLabel:'SQL result evidence'
    }
  };
  const fields = [
    ['row_no','INTEGER','fieldRow'],['record_key','TEXT','fieldKey'],['catalogue_id','TEXT','fieldCatalogue'],['event_id','TEXT / NULL','fieldEvent'],
    ['time','TEXT','fieldTime'],['year','INTEGER','fieldYear'],['latitude','REAL','fieldLatitude'],['longitude','REAL','fieldLongitude'],
    ['mag','REAL','fieldMagnitude'],['mag_type','TEXT / NULL','fieldMagnitudeType'],['depth_km','REAL / NULL','fieldDepth'],['country_id','TEXT','fieldCountry'],['admin1_id','TEXT / NULL','fieldAdmin'],
    ['provider','TEXT','fieldProvider'],['location_source','TEXT / NULL','fieldOrigin'],['mag_source','TEXT / NULL','fieldMagSource'],['place','TEXT / NULL','fieldPlace'],
    ['identifier_kind','TEXT','fieldIdentifier'],['original_fields','TEXT / NULL','fieldOriginal']
  ];
  const catalogFields = [['catalogue_id','TEXT','fieldCatalogue'],['label','TEXT','fieldLabel'],['provider','TEXT','fieldProvider'],['snapshot','TEXT','fieldSnapshot'],['source_hash','TEXT','fieldSourceHash'],['manifest_hash','TEXT','fieldManifestHash'],['identifier_kind','TEXT','fieldIdentifier'],['depth_unit','TEXT / NULL','fieldDepthUnit']];
  const examples = [
    {label:'exInspect', sql:'SELECT catalogue_id, event_id, time, mag, mag_type,\n       depth_km, country_id, place\nFROM records\nORDER BY time DESC\nLIMIT 100;'},
    {label:'exCatalogues', sql:'SELECT c.label, r.catalogue_id, COUNT(*) AS source_rows\nFROM records AS r\nLEFT JOIN catalogs AS c USING (catalogue_id)\nGROUP BY r.catalogue_id, c.label\nORDER BY source_rows DESC;'},
    {label:'exYears', sql:'SELECT year, COUNT(*) AS source_rows\nFROM records\nGROUP BY year\nORDER BY year;'},
    {label:'exMagnitude', sql:"SELECT catalogue_id, mag_type, COUNT(*) AS source_rows,\n       AVG(mag) AS mean_magnitude,\n       MIN(mag) AS min_magnitude, MAX(mag) AS max_magnitude,\n       COUNT(depth_km) AS depths_with_km,\n       AVG(depth_km) AS mean_depth_km\nFROM records\nWHERE mag_type = 'mww'\nGROUP BY catalogue_id, mag_type;"},
    {label:'exCountry', sql:'SELECT catalogue_id, country_id, admin1_id,\n       COUNT(*) AS source_rows,\n       COUNT(depth_km) AS depths_with_km\nFROM records\nGROUP BY catalogue_id, country_id, admin1_id\nORDER BY catalogue_id, source_rows DESC;'}
  ];
  function toCsv(columns, rows) {
    const cell = value => value === null || value === undefined ? '' : '"' + String(typeof value === 'object' ? JSON.stringify(value) : value).replace(/"/g,'""') + '"';
    return [columns,...rows].map(row => row.map(cell).join(',')).join('\r\n')+'\r\n';
  }
  function evidencePreview(value, depth = 0) {
    if (depth > 7) return '[nested evidence retained in JSON download]';
    if (typeof value === 'string') return value.length > 350 ? value.slice(0,347)+'…' : value;
    if (Array.isArray(value)) return value.length > 6 ? [...value.slice(0,3).map(v=>evidencePreview(v,depth+1)),{additional_items:value.length-3}] : value.map(v=>evidencePreview(v,depth+1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,evidencePreview(v,depth+1)]));
    return value;
  }
  Object.assign(messages.en,{title:'What does this selection tell us?',intro:'Choose a question. Turn the verified rows in your map selection into an answer you can read, explore and retain.',eyebrow:'FROM RECORDS TO ANSWERS',group:'Analysis group',groupHelp:'One catalogue and one literal magnitude type per answer. Map filters still apply.',qSummary:'Summarize my selection',hSummary:'Rows, magnitudes and documented depths.',qAnnual:'Follow its evolution',hAnnual:'Source-row counts by UTC year.',qRegions:'Explore the regions',hRegions:'Country or state, with unknowns retained.',qRecords:'Inspect source records',hRecords:'The actual rows behind this selection.',ask:'Get answer',advanced:'Advanced SQL editor',advancedHelp:'Write your own SELECT query using the same local engine.',schema:'Explore the data schema',result:'Your answer',typeUnknown:'Type not supplied · NULL',emptyLiteral:'Literal empty string',noGroup:'No selected rows',meanM:'Mean reported M',rangeM:'Observed M range',meanDepth:'Mean depth',sourceRows:'source rows',validM:'valid magnitudes',validDepth:'documented km depths',unknown:'unknown / NULL',summarySentence:'{count} source rows describe this exact catalogue/type group. They are not merged into unique earthquakes.',rangeTitle:'Magnitude, from lowest to highest',rangeHelp:'The band spans the observed minimum and maximum. The marker shows the mean.',minimum:'Minimum',maximum:'Maximum',meanMarker:'Mean',depthTitle:'How many depths are known?',depthHelp:'Only documented kilometre values enter the mean. NULL retains what is unknown.',known:'Documented km',missing:'No km value',exactTable:'View the exact result table',annualTitle:'How the selected counts change',annualHelp:'Years between the first and last row in this group. Zero means zero selected rows, not physical absence of earthquakes.',yearAxis:'UTC year',rowsAxis:'Source rows',regionTitle:'Where the source rows are grouped',regionHelp:'Approximate land containment; offshore, boundary and missing categories remain explicit.',regionLevel:'Group by',byCountry:'Country / territory',byAdmin:'State / province',regionTop:'Showing {shown} of {total} groups. The table and downloads retain every returned group.',outside:'Outside land polygons',boundary:'Boundary / overlap',invalid:'Invalid coordinates',notLoaded:'NULL · layer not loaded / not supplied',emptySummary:'No rows match this group. Means and ranges remain NULL; physical absence of earthquakes is not inferred.',none:'Start with a question',noneHelp:'Get a summary, follow annual counts or explore regions. Advanced SQL remains available below.',notes:'Selection descriptives do not establish completeness, magnitude-scale homogeneity, hazard or probability.'});
  Object.assign(messages.es,{title:'¿Qué nos dice esta selección?',intro:'Elige una pregunta. Convierte las filas verificadas de tu selección del mapa en una respuesta que puedes leer, explorar y conservar.',eyebrow:'DEL REGISTRO A LA RESPUESTA',group:'Grupo de análisis',groupHelp:'Un catálogo y un tipo literal de magnitud por respuesta. Los filtros del mapa siguen vigentes.',qSummary:'Resume mi selección',hSummary:'Filas, magnitudes y profundidades documentadas.',qAnnual:'Observa su evolución',hAnnual:'Conteos de filas por año UTC.',qRegions:'Explora las regiones',hRegions:'País o estado, conservando lo desconocido.',qRecords:'Consulta los registros',hRecords:'Las filas reales detrás de esta selección.',ask:'Obtener respuesta',advanced:'Editor SQL avanzado',advancedHelp:'Escribe tu propia consulta SELECT usando el mismo motor local.',schema:'Explorar el esquema de datos',result:'Tu respuesta',typeUnknown:'Tipo no suministrado · NULL',emptyLiteral:'Cadena vacía literal',noGroup:'Sin filas seleccionadas',meanM:'Media de M reportada',rangeM:'Rango observado de M',meanDepth:'Profundidad media',sourceRows:'filas de origen',validM:'magnitudes válidas',validDepth:'profundidades en km documentadas',unknown:'desconocidos / NULL',summarySentence:'{count} filas de origen describen este grupo de catálogo y tipo exactos. No se fusionan en terremotos únicos.',rangeTitle:'La magnitud, de menor a mayor',rangeHelp:'La banda muestra el mínimo y máximo observados. El marcador señala la media.',minimum:'Mínimo',maximum:'Máximo',meanMarker:'Media',depthTitle:'¿Cuántas profundidades se conocen?',depthHelp:'Sólo entran en la media los valores documentados en kilómetros. NULL conserva lo desconocido.',known:'Con unidad km',missing:'Sin dato en km',exactTable:'Ver la tabla exacta del resultado',annualTitle:'Cómo cambian los conteos de la selección',annualHelp:'Años entre la primera y la última fila de este grupo. Cero significa cero filas seleccionadas, no ausencia física de sismos.',yearAxis:'Año UTC',rowsAxis:'Filas de origen',regionTitle:'Dónde se agrupan las filas de origen',regionHelp:'Contención terrestre aproximada; mar, límites y categorías ausentes permanecen explícitos.',regionLevel:'Agrupar por',byCountry:'País / territorio',byAdmin:'Estado / provincia',regionTop:'Se muestran {shown} de {total} grupos. La tabla y las descargas conservan todos los grupos devueltos.',outside:'Fuera de polígonos terrestres',boundary:'Límite / superposición',invalid:'Coordenadas no válidas',notLoaded:'NULL · capa no cargada / no suministrada',emptySummary:'No hay filas para este grupo. Las medias y los rangos quedan en NULL; no se infiere ausencia física de sismos.',none:'Empieza con una pregunta',noneHelp:'Obtén un resumen, sigue la serie anual o explora las regiones. El editor SQL avanzado sigue disponible abajo.',notes:'Los descriptivos de la selección no establecen completitud, homogeneidad de escalas, amenaza o probabilidad.'});
  const finite = value => typeof value==='number' && Number.isFinite(value);
  const questions=[['summary','qSummary','hSummary','M4 25V15h5v10m5 0V5h5v20m5 0V10h5v15'],['annual','qAnnual','hAnnual','M4 4v23h25M7 21l7-10 7 5 8-11'],['regions','qRegions','hRegions','M3 7l8-4 10 5 8-4v21l-8 4-10-5-8 4ZM11 3v21m10-16v21'],['records','qRecords','hRecords','M5 3h22v26H5ZM10 10h12m-12 6h12m-12 6h9']];
  const questionIcon=q=>`<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="${q[3]}"/></svg>`;
  function guidedGroups(context){
    const groups=new Map();for(const row of context?.records||[]){const type=row.mag_type===undefined?null:row.mag_type,key=JSON.stringify([row.catalogue_id,type]);if(!groups.has(key))groups.set(key,{key,catalogue_id:row.catalogue_id,mag_type:type,count:0});groups.get(key).count++;}
    return [...groups.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
  }
  function groupPredicate(group,alias=''){
    if(!group||group.catalogue_id==null)return '0';const p=alias?alias+'.':'',quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
    return p+'catalogue_id = '+quote(group.catalogue_id)+' AND '+p+'mag_type '+(group.mag_type===null?'IS NULL':'= '+quote(group.mag_type));
  }
  function buildGuidedQuery(question,group,level='country'){
    const where=groupPredicate(group);
    if(question==='summary')return 'SELECT COUNT(*) AS source_rows, COUNT(mag) AS magnitude_n,\n       AVG(mag) AS mean_magnitude, MIN(mag) AS min_magnitude,\n       MAX(mag) AS max_magnitude, COUNT(depth_km) AS depths_with_km,\n       AVG(depth_km) AS mean_depth_km\nFROM records\nWHERE '+where+';';
    if(question==='annual')return 'WITH RECURSIVE years(year) AS (\n  SELECT MIN(year) FROM records WHERE '+where+'\n  UNION ALL SELECT year + 1 FROM years\n  WHERE year < (SELECT MAX(year) FROM records WHERE '+where+')\n)\nSELECT years.year, COUNT(r.row_no) AS source_rows\nFROM years LEFT JOIN records AS r ON r.year = years.year\n AND '+groupPredicate(group,'r')+'\nWHERE years.year IS NOT NULL\nGROUP BY years.year ORDER BY years.year;';
    if(question==='regions'){const field=level==='admin1'?', admin1_id':'';return 'SELECT country_id'+field+', COUNT(*) AS source_rows,\n       COUNT(depth_km) AS depths_with_km\nFROM records WHERE '+where+'\nGROUP BY country_id'+field+'\nORDER BY source_rows DESC, country_id'+field+';';}
    if(question==='records')return 'SELECT row_no, event_id, time, mag, mag_type, depth_km,\n       country_id, admin1_id, place\nFROM records WHERE '+where+'\nORDER BY time DESC, row_no;';
    throw Error('Unknown guided question');
  }
  const resultObjects=result=>result.rows.map(row=>Object.fromEntries(result.columns.map((name,i)=>[name,row[i]])));
  function summaryFromResult(result){
    const r=resultObjects(result)[0];if(!r)return null;const n=r.source_rows,m=r.magnitude_n,d=r.depths_with_km;
    if(![n,m,d].every(v=>Number.isInteger(v)&&v>=0)||m>n||d>n)throw Error('Inconsistent guided count result');
    return {count:n,magnitude_n:m,mean_magnitude:finite(r.mean_magnitude)?r.mean_magnitude:null,minimum:finite(r.min_magnitude)?r.min_magnitude:null,maximum:finite(r.max_magnitude)?r.max_magnitude:null,depth_n:d,mean_depth_km:finite(r.mean_depth_km)?r.mean_depth_km:null,unknown_magnitudes:n-m,unknown_depths:n-d};
  }
  function guidedChart(question,result,language='en',level='country'){
    const m=messages[language],rows=resultObjects(result),num=n=>finite(n)?n.toLocaleString(language,{maximumFractionDigits:3}):'NULL';if(!rows.length)return '';
    if(question==='annual'){
      const max=Math.max(1,...rows.map(r=>r.source_rows)),left=66,right=940,top=40,bottom=275,step=(right-left)/rows.length;
      let s=`<svg viewBox="0 0 980 340" role="img" aria-label="${esc(m.annualTitle)}"><title>${esc(m.annualTitle)}</title><desc>${esc(m.annualHelp)}</desc><g fill="currentColor" font-family="Arial,sans-serif">`;
      for(const v of new Set([0,1,2,3,4].map(k=>Math.round(max*k/4)))){const y=bottom-(bottom-top)*v/max;s+=`<path d="M${left} ${y}H${right}" stroke="currentColor" opacity=".12"/><text x="${left-12}" y="${y+6}" text-anchor="end" font-size="18">${num(v)}</text>`;}
      const stride=Math.max(1,Math.ceil(rows.length/10));rows.forEach((r,i)=>{const x=left+step*(i+.5),h=(bottom-top)*r.source_rows/max,w=Math.min(72,step*.6);s+=`<rect x="${x-w/2}" y="${bottom-h}" width="${w}" height="${h}" rx="4" fill="var(--sql-accent,#1b7392)"><title>${r.year}: ${r.source_rows} ${esc(m.sourceRows)}</title></rect>`;if(i%stride===0||i===rows.length-1)s+=`<text x="${x}" y="306" text-anchor="middle" font-size="18">${r.year}</text>`;});
      return s+`<text x="66" y="22" font-size="17">${esc(m.rowsAxis)}</text><text x="500" y="335" text-anchor="middle" font-size="18">${esc(m.yearAxis)}</text></g></svg>`;
    }
    if(question==='regions'){
      const shown=rows.slice(0,8),max=Math.max(1,...shown.map(r=>r.source_rows)),height=shown.length*55+20;
      const names={CAN:language==='es'?'Canadá':'Canada',MEX:language==='es'?'México':'Mexico',USA:language==='es'?'Estados Unidos':'United States',outside:m.outside,boundary:m.boundary,invalid:m.invalid};
      let s=`<svg viewBox="0 0 980 ${height}" role="img" aria-label="${esc(m.regionTitle)}"><title>${esc(m.regionTitle)}</title><desc>${esc(m.regionHelp)}</desc><g fill="currentColor" font-family="Arial,sans-serif">`;
      shown.forEach((r,i)=>{const id=level==='admin1'?r.admin1_id:r.country_id,label=id===null?m.notLoaded:(names[id]||String(id)),short=label.length>29?label.slice(0,26)+'…':label,y=i*55+10,w=590*r.source_rows/max;s+=`<text x="6" y="${y+20}" font-size="18"><title>${esc(label)}</title>${esc(short)}</text><rect x="310" y="${y}" width="${w}" height="31" rx="6" fill="var(--sql-accent,#1b7392)"/><text x="${w+916-590}" y="${y+22}" font-size="19" font-weight="700">${num(r.source_rows)}</text>`;});
      return s+'</g></svg>';
    }return '';
  }
  function mount(element, options = {}) {
    if (!element || typeof options.getContext !== 'function') throw new Error('SQL panel requires an element and getContext()');
    const doc = element.ownerDocument, win = doc.defaultView || host;
    const state = {context:null, result:null, page:0, busy:false, phase:'idle', token:0, loadedKey:null, client:null, invalidated:false, destroyed:false, progress:null, groups:[], groupKey:null, question:'summary', regionLevel:'country'};
    let language = options.getLanguage?.() === 'en' ? 'en' : 'es';
    const t = (key, values = {}) => Object.entries(values).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',String(v)),messages[language][key] || key);
    const fmt = n => Number(n || 0).toLocaleString(language);
    element.classList.add('sql-workspace');
    element.innerHTML = `<header class="sql-heading"><div><p class="sql-eyebrow" data-sql-text="eyebrow"></p><h2 data-sql-text="title"></h2><p data-sql-text="intro"></p></div><div class="sql-runtime"><span class="sql-runtime-dot" aria-hidden="true"></span><strong data-sql-text="runtime"></strong><small data-sql-text="local"></small></div></header>
<section class="sql-selection"><div><span data-sql-text="selection"></span><p class="sql-selection-label"></p></div><div class="sql-selection-count"><strong class="sql-row-count">—</strong><span data-sql-text="records"></span></div><div class="sql-selection-count"><strong class="sql-catalog-count">—</strong><span data-sql-text="catalogues"></span></div></section>
<section class="sql-guided-controls"><div class="sql-question-grid"></div><div class="sql-group-row"><label class="sql-group-label"><span data-sql-text="group"></span><select class="sql-group-select"></select></label><p data-sql-text="groupHelp"></p><label class="sql-region-label" hidden><span data-sql-text="regionLevel"></span><select class="sql-region-level"><option value="country" data-sql-text="byCountry"></option><option value="admin1" data-sql-text="byAdmin"></option></select></label><button type="button" class="sql-guided-run primary" data-sql-text="ask"></button></div><div class="sql-live-row"><span class="sql-query-status" role="status" aria-live="polite"></span><button type="button" class="sql-cancel" data-sql-text="cancel" disabled></button><progress class="sql-import-progress" max="1" value="0" hidden></progress></div></section>
<section class="sql-result-card"><div class="sql-answer-heading"><p class="sql-eyebrow" data-sql-text="result"></p><div class="sql-result-summary" hidden></div></div><div class="sql-result-visual"></div><p class="sql-truncation" role="status" hidden></p><details class="sql-exact-table"><summary data-sql-text="exactTable"></summary><div class="sql-result-content"></div><div class="sql-pagination" hidden><button type="button" class="sql-prev" data-sql-text="previous"></button><span class="sql-page-status" aria-live="polite"></span><button type="button" class="sql-next" data-sql-text="next"></button></div></details><div class="sql-downloads"><button type="button" class="sql-export-csv" data-sql-text="exportCsv" disabled></button><button type="button" class="sql-export-json" data-sql-text="exportJson" disabled></button></div><p class="sql-null-note" data-sql-text="nullHelp"></p><details class="sql-evidence" hidden><summary data-sql-text="evidence"></summary><p data-sql-text="evidenceHelp"></p><pre class="sql-evidence-json"></pre></details></section>
<div class="sql-advanced-area"><details class="sql-advanced"><summary><strong data-sql-text="advanced"></strong><small data-sql-text="advancedHelp"></small></summary><div class="sql-query-card"><label class="sql-example-label"><span data-sql-text="exampleLabel"></span><select class="sql-examples"></select></label><button type="button" class="sql-use-example" data-sql-text="useExample"></button><form class="sql-query-form"><label class="sql-editor-label"><span data-sql-text="editorLabel"></span><textarea class="sql-editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" rows="8" aria-describedby="seismicSqlEditorHelp"></textarea></label><p id="seismicSqlEditorHelp" class="sql-editor-help" data-sql-text="editorHelp"></p><button type="submit" class="sql-run primary" data-sql-text="run"></button></form></div></details><details class="sql-schema"><summary><strong data-sql-text="schema"></strong><small data-sql-text="schemaHelp"></small></summary><div class="sql-schema-tables"></div></details></div><p class="sql-scope" data-sql-text="scope"></p><p class="sql-limits" data-sql-text="notes"></p>`;
    const $ = selector => element.querySelector(selector);
    const editor = $('.sql-editor'), status = $('.sql-query-status');
    editor.value = examples[0].sql;
    const metricValue=(n,places=3)=>finite(n)?n.toLocaleString(language,{maximumFractionDigits:places}):'NULL';
    const activeGroup=()=>state.groups.find(g=>g.key===state.groupKey)||null;
    function catalogName(group){const names={'usgs-na-2020-2025':{es:'USGS · Norteamérica',en:'USGS · North America'},'usgs-mx-historical':{es:'USGS · región de México',en:'USGS · Mexico region'},'ssn-mx-historical':{es:'SSN / UNAM · México',en:'SSN / UNAM · Mexico'},'nrcan-ca-historical':{es:'NRCan / GSC · Canadá',en:'NRCan / GSC · Canada'}};if(names[group?.catalogue_id])return names[group.catalogue_id][language];const c=state.context?.catalogs?.find(c=>(c.catalogue_id??c.id)===group?.catalogue_id),label=c?.label;return typeof label==='object'?(label[language]||label.en||group.catalogue_id):(label||group?.catalogue_id||t('noGroup'));}
    const typeName=group=>group?.mag_type===null?t('typeUnknown'):group?.mag_type===''?t('emptyLiteral'):String(group?.mag_type??'NULL');
    function showQuestions(){
      $('.sql-question-grid').innerHTML=questions.map(q=>`<button type="button" class="sql-question${state.question===q[0]?' is-active':''}" data-question="${q[0]}" aria-pressed="${state.question===q[0]}"><span>${questionIcon(q)}</span><strong>${esc(t(q[1]))}</strong><small>${esc(t(q[2]))}</small></button>`).join('');
      for(const button of element.querySelectorAll('[data-question]'))button.addEventListener('click',()=>runGuided(button.dataset.question));
      state.groups=guidedGroups(state.context);if(!state.groups.some(g=>g.key===state.groupKey))state.groupKey=state.groups[0]?.key||null;
      $('.sql-group-select').innerHTML=state.groups.length?state.groups.map(g=>`<option value="${esc(g.key)}"${g.key===state.groupKey?' selected':''}>${esc(catalogName(g))} · ${esc(typeName(g))} · n=${fmt(g.count)}</option>`).join(''):`<option value="">${esc(t('noGroup'))}</option>`;
      $('.sql-region-label').hidden=state.question!=='regions';
    }
    function summaryVisual(result){
      const m=summaryFromResult(result),g=result.guided.group;
      const metric=(label,value,detail,cls='')=>`<article class="sql-metric ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
      let html=`<div class="sql-answer-context"><span>${esc(catalogName(g))}</span><strong>${esc(typeName(g))}</strong></div><p class="sql-answer-sentence">${esc(t('summarySentence',{count:fmt(m.count)}))}</p><div class="sql-metrics">`+
        metric(t('records'),fmt(m.count),t('sourceRows'),'sql-metric-primary')+
        metric(t('meanM'),metricValue(m.mean_magnitude),`${fmt(m.magnitude_n)} ${t('validM')} · ${fmt(m.unknown_magnitudes)} ${t('unknown')}`)+
        metric(t('rangeM'),m.minimum===null?'NULL':metricValue(m.minimum,2)+' — '+metricValue(m.maximum,2),t('minimum')+' → '+t('maximum'))+
        metric(t('meanDepth'),m.mean_depth_km===null?'NULL':metricValue(m.mean_depth_km,2)+' km',`${fmt(m.depth_n)} ${t('validDepth')} · ${fmt(m.unknown_depths)} ${t('unknown')}`)+'</div>';
      if(!m.count)return html+`<p class="sql-zero-note">${esc(t('emptySummary'))}</p>`;
      let range=`<p class="sql-zero-note">NULL</p>`;
      if(m.minimum!==null&&m.minimum===m.maximum){
        range=`<svg viewBox="0 0 780 182" role="img" aria-label="${esc(t('rangeTitle'))}"><title>${esc(t('rangeTitle'))}</title><path d="M65 83H705" stroke="var(--line,#ccd9df)" stroke-width="10" stroke-linecap="round"/><circle cx="385" cy="83" r="17" fill="var(--sql-accent,#1b7392)"/><g fill="currentColor" font-family="Arial,sans-serif" text-anchor="middle"><text x="385" y="39" font-size="28" font-weight="700">${esc(metricValue(m.minimum))}</text><text x="385" y="135" font-size="18">${esc(t('minimum'))} = ${esc(t('meanMarker'))} = ${esc(t('maximum'))}</text></g></svg>`;
      }else if(m.minimum!==null&&m.maximum!==null&&m.mean_magnitude!==null){
        const span=Math.max(.5,m.maximum-m.minimum),lo=m.minimum-span*.15,hi=m.maximum+span*.15,at=v=>65+(v-lo)/(hi-lo)*640;
        range=`<svg viewBox="0 0 780 182" role="img" aria-label="${esc(t('rangeTitle'))}"><title>${esc(t('rangeTitle'))}</title><desc>${esc(t('rangeHelp'))}</desc><path d="M65 83H705" stroke="var(--line,#ccd9df)" stroke-width="14" stroke-linecap="round"/><path d="M${at(m.minimum)} 83H${at(m.maximum)}" stroke="var(--sql-accent,#1b7392)" stroke-width="14" stroke-linecap="round"/><circle cx="${at(m.mean_magnitude)}" cy="83" r="17" fill="var(--sql-highlight,#b85c31)" stroke="var(--paper,#fff)" stroke-width="5"/><g fill="currentColor" font-family="Arial,sans-serif" text-anchor="middle"><text x="${at(m.mean_magnitude)}" y="37" font-size="25" font-weight="700">${esc(metricValue(m.mean_magnitude))}</text><text x="${at(m.mean_magnitude)}" y="58" font-size="15">${esc(t('meanMarker'))}</text><text x="${at(m.minimum)}" y="132" font-size="24" font-weight="700">${esc(metricValue(m.minimum,2))}</text><text x="${at(m.minimum)}" y="155" font-size="15">${esc(t('minimum'))}</text><text x="${at(m.maximum)}" y="132" font-size="24" font-weight="700">${esc(metricValue(m.maximum,2))}</text><text x="${at(m.maximum)}" y="155" font-size="15">${esc(t('maximum'))}</text></g></svg>`;
      }
      const known=m.depth_n/m.count,percent=(known*100).toLocaleString(language,{maximumFractionDigits:1});
      return html+`<div class="sql-summary-visuals"><article><h4>${esc(t('rangeTitle'))}</h4>${range}<p>${esc(t('rangeHelp'))}</p></article><article><h4>${esc(t('depthTitle'))}</h4><div class="sql-depth-visual"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(fmt(m.depth_n)+' '+t('validDepth')+'; '+fmt(m.unknown_depths)+' '+t('unknown'))}"><circle cx="80" cy="80" r="61" fill="none" stroke="var(--line,#ccd9df)" stroke-width="14"/><circle cx="80" cy="80" r="61" fill="none" stroke="var(--sql-accent,#1b7392)" stroke-width="14" pathLength="100" stroke-dasharray="${known*100} 100" transform="rotate(-90 80 80)"/><text x="80" y="83" text-anchor="middle" fill="currentColor" font-size="27" font-family="Arial,sans-serif" font-weight="700">${esc(percent)}%</text><text x="80" y="105" text-anchor="middle" fill="currentColor" font-size="12" font-family="Arial,sans-serif">${esc(t('known'))}</text></svg><dl><div><dt>${esc(t('known'))}</dt><dd>${fmt(m.depth_n)}</dd></div><div><dt>${esc(t('missing'))}</dt><dd>${fmt(m.unknown_depths)} <span>NULL</span></dd></div></dl></div><p>${esc(t('depthHelp'))}</p></article></div>`;
    }
    function showVisualResult(result){
      const visual=$('.sql-result-visual');$('.sql-exact-table').hidden=!result;$('.sql-downloads').hidden=!result;$('.sql-null-note').hidden=!result;
      if(!result){visual.innerHTML=`<div class="sql-empty">${questionIcon(questions[0])}<h4>${esc(t('none'))}</h4><p>${esc(t('noneHelp'))}</p></div>`;return;}
      const question=result.guided?.question;
      if(question==='summary'){visual.innerHTML=summaryVisual(result);return;}
      if(question==='annual'||question==='regions'){
        const title=question==='annual'?'annualTitle':'regionTitle',help=question==='annual'?'annualHelp':'regionHelp';
        visual.innerHTML=`<div class="sql-answer-context"><span>${esc(catalogName(result.guided.group))}</span><strong>${esc(typeName(result.guided.group))}</strong></div><article class="sql-guided-chart"><h4>${esc(t(title))}</h4>${result.rows.length?`<div class="sql-guided-chart-scroll" tabindex="0" role="region" aria-label="${esc(t(title))}">${guidedChart(question,result,language,result.guided.regionLevel)}</div>`:`<p class="sql-zero-note">${esc(t('empty'))}</p>`}<p>${esc(t(help))}</p>${question==='regions'?`<p>${esc(t('regionTop',{shown:Math.min(8,result.rows.length),total:result.rows.length}))}</p>`:''}</article>`;
      }else visual.innerHTML=`<p class="sql-answer-sentence">${fmt(result.rows.length)} ${esc(t('returned'))}</p><p class="sql-result-scope">${esc(t('resultScope'))}</p>`;
    }
    function setStatus(phase, detail = '') {
      state.phase = phase;
      const key = ['idle','unavailable','importing','initializing','querying','cancelled','stale','timeout','engineMissing','saved'].includes(phase) ? phase : 'error';
      status.textContent = (key==='idle'&&state.result?'':t(key))+(detail ? ' '+detail : '');
      status.classList.toggle('sql-status-error', ['error','timeout','engineMissing'].includes(key));
    }
    function setBusy(busy) {
      state.busy = busy; $('.sql-run').disabled = busy || state.context?.ready === false || !state.context;
      for(const control of element.querySelectorAll('.sql-question,.sql-guided-run,.sql-group-select,.sql-region-level'))control.disabled=busy||state.context?.ready===false||!state.context;
      $('.sql-cancel').disabled = !busy; editor.readOnly = busy; $('.sql-use-example').disabled = busy; $('.sql-examples').disabled = busy;
      $('.sql-cancel').hidden=!busy;
      $('.sql-export-csv').disabled = busy || !state.result; $('.sql-export-json').disabled = busy || !state.result;
      element.setAttribute('aria-busy', String(busy));
      if (!busy) $('.sql-import-progress').hidden = true;
    }
    function showSchema() {
      const schema = (name,desc,list,open) => `<details ${open?'open':''}><summary><code>${name}</code><small>${esc(t(desc))}</small></summary><div class="sql-schema-scroll"><table><thead><tr><th>${esc(t('columns'))}</th><th>${esc(t('type'))}</th><th>${esc(t('meaning'))}</th></tr></thead><tbody>${list.map(([name,type,label])=>`<tr><td><code>${name}</code></td><td><code>${type}</code></td><td>${esc(t(label))}</td></tr>`).join('')}</tbody></table></div></details>`;
      $('.sql-schema-tables').innerHTML = schema('records','recordTable',fields,true)+schema('catalogs','catalogTable',catalogFields,false);
    }
    function showSelection() {
      const context = state.context;
      $('.sql-selection-label').textContent = context?.selectionLabel || '—';
      $('.sql-row-count').textContent = context?.ready === false || !context ? '—' : fmt(context.records?.length);
      $('.sql-catalog-count').textContent = context?.ready === false || !context ? '—' : fmt(context.catalogs?.length);
      $('.sql-run').disabled = state.busy || context?.ready === false || !context;
    }
    function resultEvidence() {
      if (!state.result) return null;
      const result = state.result;
      return {schema:'seismic-sql-result/1',created_utc:result.created_utc,engine:'SQLite in browser memory',sql:result.sql,guided_question:copy(result.guided),selection_key:result.selectionKey,selection_label:result.selectionLabel,input_evidence:copy(result.evidence),result:{columns:[...result.columns],rows:result.rows.map(row=>[...row]),returned_rows:result.rows.length,truncated:!!result.truncated,row_limit:result.limit,elapsed_ms:result.elapsedMs},limits:['Current filtered source rows only; not an independent earthquake population.','SQL results do not change the source selection or original catalogue packages.','Guided answers keep one exact catalogue and literal magnitude type; matching types do not prove scale homogeneity.','NULL retains unknown/not-supplied meaning.','CSV represents NULL with an empty field; JSON preserves null and types.','A truncated result and its downloads contain only the returned rows.']};
    }
    function renderResult() {
      const result = state.result, content = $('.sql-result-content');
      showVisualResult(result);
      $('.sql-result-summary').hidden = !result; $('.sql-evidence').hidden = !result;
      $('.sql-truncation').hidden = !result?.truncated;
      $('.sql-pagination').hidden = !result || !result.rows.length;
      $('.sql-export-csv').disabled = !result || state.busy; $('.sql-export-json').disabled = !result || state.busy;
      if (!result) {content.innerHTML = `<div class="sql-empty"><span aria-hidden="true">⌕</span><h4>${esc(t('none'))}</h4><p>${esc(t('noneHelp'))}</p></div>`; return;}
      const rows = result.rows, pages = Math.max(1, Math.ceil(rows.length/PAGE_SIZE)); state.page = Math.min(state.page,pages-1);
      const from = state.page*PAGE_SIZE, to = Math.min(from+PAGE_SIZE,rows.length);
      $('.sql-result-summary').innerHTML = `<div><strong>${fmt(rows.length)}</strong><span>${esc(t('returned'))}</span></div><div><strong>${Number(result.elapsedMs||0).toLocaleString(language,{maximumFractionDigits:1})} ms</strong><span>${esc(t('execution'))}</span></div><p>${esc(t('resultScope'))}</p>`;
      $('.sql-truncation').textContent = result.truncated ? t('truncated',{limit:fmt(result.limit || 5000)}) : '';
      if (!rows.length) content.innerHTML = `<p class="sql-empty-result">${esc(t('empty'))}</p>`;
      else content.innerHTML = `<div class="sql-result-scroll" role="region" aria-label="${esc(t('tableLabel'))}" tabindex="0"><table><thead><tr>${result.columns.map(name=>`<th scope="col"><code>${esc(name)}</code></th>`).join('')}</tr></thead><tbody>${rows.slice(from,to).map(row=>`<tr>${row.map(value=>{
        if (value === null || value === undefined) return '<td><span class="sql-null">NULL</span></td>';
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value), shortened = text.length>160 ? text.slice(0,157)+'…' : text;
        return `<td${typeof value==='number'?' class="sql-number"':''}${text.length<=2000?' title="'+esc(text)+'"':''}>${esc(shortened)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
      $('.sql-page-status').textContent = t('page',{page:state.page+1,pages})+' · '+t('range',{from:rows.length?fmt(from+1):'0',to:fmt(to),count:fmt(rows.length)});
      $('.sql-prev').disabled = state.page===0; $('.sql-next').disabled = state.page>=pages-1;
      const evidence = {preview_note:t('evidencePreview'),sql:result.sql,selection_key:result.selectionKey,selection_label:result.selectionLabel,input_evidence:evidencePreview(result.evidence),returned_rows:rows.length,truncated:!!result.truncated,row_limit:result.limit};
      $('.sql-evidence-json').textContent = JSON.stringify(evidence,null,2);
    }
    function updateLanguage() {
      language = options.getLanguage?.()==='en' ? 'en' : 'es';
      element.lang = language;
      element.querySelectorAll('[data-sql-text]').forEach(e=>e.textContent=t(e.dataset.sqlText));
      $('.sql-import-progress').setAttribute('aria-label',t('loadingBar'));
      $('.sql-evidence-json').setAttribute('aria-label',t('metadataLabel'));
      const exampleIndex = $('.sql-examples').value || '0';
      $('.sql-examples').innerHTML = examples.map((example,i)=>`<option value="${i}">${esc(t(example.label))}</option>`).join('');
      $('.sql-examples').value = exampleIndex;
      showQuestions();showSchema(); showSelection(); renderResult(); setStatus(state.phase);setBusy(state.busy);
    }
    function invalidate() {
      state.token++; state.client?.cancel(); state.loadedKey = null; state.context = null; state.result = null; state.page = 0; state.invalidated = true;
      setBusy(false);showSelection();renderResult();setStatus('stale');
    }
    function refresh() {
      if (state.destroyed) return;
      const context = options.getContext();
      if (state.context && context?.key !== state.context.key) invalidate();
      state.context = context || {ready:false,records:[],catalogs:[]};
      showSelection();
      if (state.context.ready === false) {state.result = null;renderResult();setStatus('unavailable');}
      else if (!state.busy && !state.result) setStatus(state.invalidated ? 'stale' : 'idle');
      updateLanguage();
    }
    function progress(event) {
      if (!state.busy || state.destroyed) return;
      const phase = event?.phase || 'initializing';
      if (phase === 'importing') {
        const loaded = Number(event.loaded)||0,total = Number(event.total)||0, bar=$('.sql-import-progress');
        bar.hidden = false;
        if(total){bar.max=total;bar.value=loaded;}else bar.removeAttribute('value');
        setStatus('importing',total ? t('rowsLoaded',{loaded:fmt(loaded),total:fmt(total)}) : '');
      } else if (phase==='querying') setStatus('querying');
      else if (phase==='initializing') setStatus('initializing');
    }
    async function run(guided=null) {
      if (state.busy || state.destroyed) return;
      refresh();const context = state.context;
      if (!context || context.ready===false) return;
      const sql = editor.value.trim();if(!sql){editor.focus();return;}
      const api = options.engine || host.SeismicSQL;
      if (!api?.create) {setStatus('engineMissing');return;}
      const token = ++state.token;
      state.result=null;state.page=0;renderResult();setBusy(true);setStatus('initializing');
      try {
        if (!state.client) state.client=api.create({onStatus:progress,timeoutMs:10000});
        if (state.loadedKey !== context.key) {
          await state.client.setData({records:context.records,catalogs:context.catalogs,evidence:context.evidence,key:context.key});
          if(token!==state.token)return;
          state.loadedKey=context.key;
        }
        setStatus('querying');const result=await state.client.query(sql);
        if(token!==state.token||state.destroyed)return;
        const latest=options.getContext();
        if(latest?.key!==context.key || latest?.ready===false){invalidate();return;}
        state.result={...result,sql:result.sql||sql,guided:copy(guided),evidence:copy(result.evidence||context.evidence),selectionKey:result.selectionKey||context.key,selectionLabel:context.selectionLabel||'',created_utc:new Date().toISOString()};
        $('.sql-exact-table').open=!guided||guided.question==='records';
        state.invalidated=false;setBusy(false);renderResult();setStatus('idle');
        options.onResult?.(resultEvidence());
      } catch(error) {
        if(token!==state.token||state.destroyed)return;
        state.loadedKey=null;setBusy(false);
        const message=String(error?.message||error||'');
        if (/timeout|time limit|timed out/i.test(message+' '+error?.code)) setStatus('timeout');
        else if(/cancel/i.test(message+' '+error?.code))setStatus('cancelled');
        else setStatus('error',message);
      } finally {if(token===state.token&&!state.destroyed)setBusy(false);}
    }
    function cancel() {
      state.token++;state.client?.cancel();state.loadedKey=null;state.result=null;
      setBusy(false);renderResult();setStatus('cancelled');
    }
    function runGuided(question=state.question){
      if(state.busy||state.destroyed)return;refresh();state.question=questions.some(q=>q[0]===question)?question:'summary';showQuestions();
      const group=activeGroup();editor.value=buildGuidedQuery(state.question,group,state.regionLevel);setBusy(false);
      return run({question:state.question,group:copy(group),regionLevel:state.regionLevel,scope:'One exact catalogue and literal magnitude type within the current map selection.'});
    }
    function download(kind) {
      if (!state.result || state.busy) return;
      const current=options.getContext();if(current?.ready===false||current?.key!==state.result.selectionKey){invalidate();return;}
      const json=kind==='json', data=json ? JSON.stringify(resultEvidence(),null,2) : toCsv(state.result.columns,state.result.rows);
      const blob=new win.Blob([data],{type:json?'application/json;charset=utf-8':'text/csv;charset=utf-8'});
      const url=win.URL.createObjectURL(blob),a=doc.createElement('a');
      a.href=url;a.download='seismic-sql-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+kind;
      doc.body.append(a);a.click();a.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);setStatus('saved');
    }
    $('.sql-query-form').addEventListener('submit',event=>{event.preventDefault();run();});
    editor.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}});
    $('.sql-cancel').addEventListener('click',cancel);
    $('.sql-guided-run').addEventListener('click',()=>runGuided());
    $('.sql-group-select').addEventListener('change',event=>{state.groupKey=event.target.value;runGuided();});
    $('.sql-region-level').addEventListener('change',event=>{state.regionLevel=event.target.value;runGuided('regions');});
    $('.sql-use-example').addEventListener('click',()=>{editor.value=examples[Number($('.sql-examples').value)||0].sql;editor.focus();});
    $('.sql-prev').addEventListener('click',()=>{if(state.page){state.page--;renderResult();}});
    $('.sql-next').addEventListener('click',()=>{if(state.result&&state.page<Math.ceil(state.result.rows.length/PAGE_SIZE)-1){state.page++;renderResult();}});
    $('.sql-export-csv').addEventListener('click',()=>download('csv'));$('.sql-export-json').addEventListener('click',()=>download('json'));
    updateLanguage();setStatus('unavailable');setBusy(false);
    return Object.freeze({activate(){refresh();if(state.context?.ready!==false&&!state.result&&!state.busy&&options.autoRun!==false)return runGuided();},refresh,refreshLanguage:updateLanguage,invalidate,run,runGuided,cancel,getResult:resultEvidence,destroy(){state.destroyed=true;state.token++;state.client?.dispose();element.replaceChildren();}});
  }
  return Object.freeze({mount,toCsv,guidedGroups,buildGuidedQuery,summaryFromResult,guidedChart,questions:questions.map(q=>Object.freeze([...q])),examples:examples.map(e=>Object.freeze({...e})),fields:fields.map(f=>Object.freeze([...f])),catalogFields:catalogFields.map(f=>Object.freeze([...f]))});
});
