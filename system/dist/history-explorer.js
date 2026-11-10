(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicHistoryExplorer=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const EARTH_RADIUS_KM=6371.0088, DISTANCE_TOLERANCE_KM=1e-9, NA=['MEX','CAN','USA'], MISSING='__missing__';
  const finite=v=>typeof v==='number'&&Number.isFinite(v),copy=v=>JSON.parse(JSON.stringify(v??null));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rowKey=e=>String(e.source_event_id??e.id??e.record_key??'');
  const magType=e=>(e.magType??e.mag_type)||MISSING;
  const year=e=>Number.isInteger(e.year)?e.year:Number(String(e.time??'').slice(0,4));
  const radians=d=>d*Math.PI/180;
  const normLon=d=>((d+180)%360+360)%360-180;
  function validPoint(e){return finite(e.latitude)&&e.latitude>=-90&&e.latitude<=90&&finite(e.longitude)&&e.longitude>=-180&&e.longitude<=180;}
  function haversine(a,b){
    if(!validPoint(a)||!validPoint(b))return null;
    const dlat=radians(b.latitude-a.latitude),dlon=radians(normLon(b.longitude-a.longitude));
    const h=Math.sin(dlat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dlon/2)**2;
    return EARTH_RADIUS_KM*2*Math.atan2(Math.sqrt(Math.max(0,Math.min(1,h))),Math.sqrt(Math.max(0,1-h)));
  }
  const compare=(a,b)=>b.mag-a.mag||String(a.time??'').localeCompare(String(b.time??''))||rowKey(a).localeCompare(rowKey(b));
  const countryName=(id,lang)=>({MEX:lang==='es'?'México':'Mexico',CAN:lang==='es'?'Canadá':'Canada',USA:lang==='es'?'Estados Unidos':'United States'})[id]||id;
  function label(region,lang){return region?.label?.[lang]||region?.label?.en||region?.id||'';}
  function types(data){return [...new Set(data.events.map(magType))].sort((a,b)=>a.localeCompare(b));}
  function usefulType(data,mode='top'){
    const available=types(data);if(available.includes('mww'))return 'mww';
    const counted=new Map(),maxima=new Map();for(const e of data.events)if(finite(e.mag)&&(mode!=='recurrence'||e.mag>=7)){counted.set(magType(e),(counted.get(magType(e))||0)+1);maxima.set(magType(e),Math.max(e.mag,maxima.get(magType(e))??-Infinity));}
    if(mode==='top')return [...available].sort((a,b)=>(maxima.get(b)??-Infinity)-(maxima.get(a)??-Infinity)||(counted.get(b)||0)-(counted.get(a)||0)||a.localeCompare(b))[0]||MISSING;
    return [...available].sort((a,b)=>(counted.get(b)||0)-(counted.get(a)||0)||a.localeCompare(b))[0]||MISSING;
  }
  function defaults(data,mode='top'){
    const years=data.catalog?.years||[1900,2026];
    return {catalogueId:data.catalog.id,scope:mode==='recurrence'&&data.catalog.id==='ssn-mx-historical'?'footprint':'NA',admin1:'',yearFrom:years[0],yearTo:years[1],magType:usefulType(data,mode),minimumMagnitude:7,radiusKm:100,includeOffshore:false,offshoreKm:100};
  }
  function validate(data,raw,mode){
    if(!data?.catalog?.id||!Array.isArray(data.events))throw Error('HISTORY_SOURCE');
    const f={...defaults(data,mode),...raw};
    if(f.catalogueId!==data.catalog.id||!['NA','footprint',...NA].includes(f.scope))throw Error('HISTORY_SCOPE');
    const [lo,hi]=data.catalog.years||[1900,2026];
    if(!Number.isInteger(f.yearFrom)||!Number.isInteger(f.yearTo)||f.yearFrom<lo||f.yearTo>hi||f.yearFrom>f.yearTo)throw Error('HISTORY_YEARS');
    if(!types(data).includes(f.magType))throw Error('HISTORY_TYPE');
    if(f.admin1&&!NA.includes(f.scope))throw Error('HISTORY_ADMIN1');
    if(f.admin1&&(!data.admin1?.regions?.some(r=>r.id===f.admin1&&r.country_id===f.scope)))throw Error('HISTORY_ADMIN1');
    if(mode==='recurrence'&&(!finite(f.minimumMagnitude)||f.minimumMagnitude<7||f.minimumMagnitude>9||![25,50,100,200].includes(f.radiusKm)||f.offshoreKm!==100||typeof f.includeOffshore!=='boolean'))throw Error('HISTORY_RECURRENCE');
    if(mode==='top'&&f.includeOffshore)throw Error('HISTORY_OFFSHORE_MODE');
    return f;
  }
  function inLandScope(e,f){return f.scope==='footprint'||(f.scope==='NA'?NA.includes(e.country_id):e.country_id===f.scope)&&(!f.admin1||e.admin1_id===f.admin1);}
  function bearing(a,b){const p=radians(a.latitude),q=radians(b.latitude),dl=radians(normLon(b.longitude-a.longitude));return Math.atan2(Math.sin(dl)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(dl));}
  // Distance to each finite minor great-circle arc, not to its infinite line.
  // Natural Earth polygons are generalized geographic context, not coast surveys.
  function segmentDistance(p,a,b){
    const length=haversine(a,b)/EARTH_RADIUS_KM,ap=haversine(a,p)/EARTH_RADIUS_KM;
    if(length<1e-12||Math.abs(length-Math.PI)<1e-10)return Math.min(haversine(a,p),haversine(b,p));
    const delta=bearing(a,p)-bearing(a,b),along=Math.atan2(Math.sin(ap)*Math.cos(delta),Math.cos(ap));
    if(along<0||along>length)return Math.min(haversine(a,p),haversine(b,p));
    return Math.abs(Math.asin(Math.max(-1,Math.min(1,Math.sin(ap)*Math.sin(delta)))))*EARTH_RADIUS_KM;
  }
  function polygonRings(feature){const g=feature?.geometry;return g?.type==='Polygon'?g.coordinates:g?.type==='MultiPolygon'?g.coordinates.flat():[];}
  function boundaryDistance(e,features){
    if(!validPoint(e)||!features.length)return null;let nearest=Infinity;
    for(const feature of features)for(const ring of polygonRings(feature))for(let i=1;i<ring.length;i++){
      const a={latitude:ring[i-1][1],longitude:ring[i-1][0]},b={latitude:ring[i][1],longitude:ring[i][0]};
      nearest=Math.min(nearest,segmentDistance(e,a,b));
    }
    return Number.isFinite(nearest)?nearest:null;
  }
  function contextualFeatures(data,f){
    if(f.admin1)return (data.admin1Geometry?.features||[]).filter(g=>g.properties?.admin1_id===f.admin1);
    return (data.geometry?.features||[]).filter(g=>(f.scope==='NA'?NA:[f.scope]).includes(g.properties?.ISO_A3));
  }
  function baseRows(data,f){return data.events.filter(e=>finite(e.mag)&&year(e)>=f.yearFrom&&year(e)<=f.yearTo&&magType(e)===f.magType);}
  function sourceRecord(e,data,extra={}){
    const documented=data.catalog.provider==='usgs'||data.catalog.depth_unit==='km';
    return {record_key:rowKey(e),identifier_kind:data.catalog.identifier_kind||'source_event_id',time:e.time??null,year:year(e),latitude:finite(e.latitude)?e.latitude:null,longitude:finite(e.longitude)?e.longitude:null,reported_magnitude:e.mag,magnitude_type:magType(e)===MISSING?null:magType(e),depth_km:documented&&finite(e.depth)?e.depth:null,country_id:e.country_id??null,admin1_id:e.admin1_id??null,place:e.place??null,...extra};
  }
  function inputEvidence(data){return {catalogue_id:data.catalog.id,provider:data.catalog.provider,catalogue:copy(data.catalog),hashes:copy(data.hashes),geography:copy(data.geographyEvidence)};}
  const commonLimits=[
    'A single preserved catalogue and literal reported magnitude type are used. Magnitude scales are not converted or homogenized.',
    'Results describe available source records in the selected UTC years, not the strongest earthquakes ever or a complete historical population.',
    'Country and subdivision classes use generalized land polygons. Offshore, boundary and unassigned rows remain separate; catalogue footprint is a separate scope.',
    'Derived SSN/NRCan keys identify retained rows rather than official event identifiers. Rows are not proved unique or independent physical earthquakes.',
    'No completeness, fault recurrence, earthquake probability, forecast, ground-shaking hazard, exposure or seismic risk is estimated.'
  ];
  function computeTop(data,filters={}){
    const f=validate(data,filters,'top'),base=baseRows(data,f),selected=base.filter(e=>inLandScope(e,f)).sort(compare),ranked=selected.slice(0,10);
    return {schema:'seismic-historical-top10/1',filters:f,input:inputEvidence(data),counting_unit:'retained source records',eligible_records:selected.length,ranked_records:ranked.map((e,i)=>sourceRecord(e,data,{rank:i+1})),selection:{before_geography:base.length,excluded_by_geography:base.length-selected.length},rule:{rank_limit:10,sort:['reported magnitude descending','UTC time ascending','record key ascending'],ties:'A deterministic maximum of ten rows; not all ties at the tenth value are included.'},limits:[...commonLimits]};
  }
  function computeRecurrence(data,filters={}){
    const f=validate(data,filters,'recurrence'),base=baseRows(data,f).filter(e=>e.mag>=f.minimumMagnitude),land=base.filter(e=>inLandScope(e,f));
    const features=f.includeOffshore&&f.scope!=='footprint'?contextualFeatures(data,f):[],selected=[];
    if(f.includeOffshore&&f.scope!=='footprint'&&!features.length)throw Error('HISTORY_GEOMETRY');
    for(const e of base){
      if(inLandScope(e,f)){selected.push({e,scope_basis:'land_class',distance_to_land_km:null});continue;}
      // Proximity only adds unassigned offshore/boundary rows. It never annexes a
      // record already assigned to a different country or subdivision.
      const unassigned=!e.country_id||['outside','boundary','invalid'].includes(e.country_id);
      const unassignedAdmin=f.admin1&&e.country_id===f.scope&&String(e.admin1_id||'').startsWith('admin1-');
      if(f.includeOffshore&&f.scope!=='footprint'&&(unassigned||unassignedAdmin)){
        const distance=boundaryDistance(e,features);if(distance!==null&&distance<=f.offshoreKm+DISTANCE_TOLERANCE_KM)selected.push({e,scope_basis:'nearby_unassigned_context',distance_to_land_km:distance});
      }
    }
    const valid=selected.filter(x=>validPoint(x.e)).sort((a,b)=>compare(a.e,b.e));
    const seen=new Set();for(const x of valid){if(!rowKey(x.e)||seen.has(rowKey(x.e)))throw Error('HISTORY_DUPLICATE_KEY');seen.add(rowKey(x.e));}
    const pairs=[],participating=new Set();
    for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
      const distance=haversine(valid[i].e,valid[j].e);if(distance<=f.radiusKm+DISTANCE_TOLERANCE_KM){pairs.push({pair_no:pairs.length+1,record_a:rowKey(valid[i].e),record_b:rowKey(valid[j].e),distance_km:distance});participating.add(rowKey(valid[i].e));participating.add(rowKey(valid[j].e));}
    }
    pairs.sort((a,b)=>a.distance_km-b.distance_km||a.record_a.localeCompare(b.record_a)||a.record_b.localeCompare(b.record_b));pairs.forEach((p,i)=>p.pair_no=i+1);
    return {schema:'seismic-historical-proximity/1',filters:f,input:inputEvidence(data),counting_unit:'retained source records',eligible_records:selected.length,located_records:valid.length,nearby_unassigned_records:selected.filter(x=>x.scope_basis==='nearby_unassigned_context').length,paired_records:participating.size,pair_count:pairs.length,records:valid.map(x=>sourceRecord(x.e,data,{scope_basis:f.scope==='footprint'?'catalogue_footprint':x.scope_basis,distance_to_land_km:x.distance_to_land_km,in_proximity_pair:participating.has(rowKey(x.e))})),pairs,selection:{before_geography:base.length,land_records:land.length,excluded_by_geography:base.length-selected.length,invalid_or_missing_coordinates:selected.length-valid.length},rule:{distance:'great-circle haversine',earth_radius_km:EARTH_RADIUS_KM,threshold_inclusive:true,numeric_tolerance_km:DISTANCE_TOLERANCE_KM,distance_comparison:'Pair and nearby-context predicates use distance_km <= threshold_km + numeric_tolerance_km before display rounding. The absolute 1e-9 km (one micrometre) tolerance stabilizes floating-point boundary comparisons only; it is not geographic or epicentral uncertainty.',pair_rule:'Every unordered pair of distinct source keys within radiusKm using the declared numerical boundary tolerance; no transitive groups.',time_rule:'UTC year interval only; aftershocks and same-day records are retained, without declustering or independence claims.',nearby_context:f.includeOffshore?{distance_km:100,method:'Minimum spherical point-to-minor-great-circle-segment distance to selected generalized polygon boundaries. Existing country/admin1 classes are preserved; this is contextual proximity, not a reassignment.'}:null},limits:[...commonLimits,'A pair means two nearby reported epicentres in this archive, not the same rupture, a verified repeating earthquake, a causal sequence or a danger zone.','Links apply only to direct pairs. Two endpoints linked through a third record need not lie within the chosen radius.','A location without selected pairs is not demonstrated safe; archive coverage and a short time window can omit large historical earthquakes.']};
  }
  function csv(result){
    const quote=v=>{if(v===null||v===undefined)return '';const s=String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const fields=['section','rank_or_pair','record_key','record_b','time_utc','latitude','longitude','reported_magnitude','magnitude_type','depth_km','country_id','admin1_id','distance_km','scope_basis','distance_to_land_km','place','value'];
    const evidence=Array(fields.length).fill('');evidence[0]='evidence';evidence[fields.length-1]=JSON.stringify({schema:result.schema,filters:result.filters,input:result.input,rule:result.rule,limits:result.limits});
    const rows=[fields,evidence];
    for(const e of result.ranked_records||result.records)rows.push(['record',e.rank??'',e.record_key,'',e.time,e.latitude,e.longitude,e.reported_magnitude,e.magnitude_type,e.depth_km,e.country_id,e.admin1_id,'',e.scope_basis??'',e.distance_to_land_km??'',e.place,'']);
    for(const p of result.pairs||[])rows.push(['pair',p.pair_no,p.record_a,p.record_b,'','','','','','','','',p.distance_km,'','','','']);
    return rows.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  // Reuse the main map's pure, continuous antimeridian transformation. These
  // are display copies; query coordinates, geographic classes and exports stay raw.
  function displayGeometry(source,transform){
    if(!source)return source;
    if(source.type==='FeatureCollection')return {...source,features:source.features.map(feature=>displayGeometry(feature,transform))};
    if(source.type==='Feature')return {...source,geometry:displayGeometry(source.geometry,transform)};
    if(!transform?.displayPolygon)return copy(source);
    if(source.type==='Polygon')return {...source,coordinates:transform.displayPolygon(source.coordinates)};
    if(source.type==='MultiPolygon')return {...source,coordinates:source.coordinates.map(rings=>transform.displayPolygon(rings))};
    if(source.type==='LineString')return {...source,coordinates:transform.displayPolygon([source.coordinates])[0]};
    if(source.type==='MultiLineString')return {...source,coordinates:source.coordinates.map(line=>transform.displayPolygon([line])[0])};
    return copy(source);
  }
  const text={en:{topTitle:'The largest records in your selection',topIntro:'Choose a catalogue, a region and a reported magnitude type. Trace the ten largest available records back to their source.',recTitle:'Where do large historical records lie close together?',recIntro:'Explore direct pairs of reported M ≥ 7 epicentres. A nearby pair is an observation in an archive, not an estimate of future danger.',topEyebrow:'HISTORICAL TOP 10',recEyebrow:'HISTORICAL PROXIMITY · DESCRIPTIVE',catalogue:'Source catalogue',scope:'Region or country',north:'North America · Mexico, Canada and USA land classes',footprint:'Catalogue footprint · includes offshore and other land classes',state:'State / province with records',allStates:'All land subdivisions',type:'Literal magnitude type',missing:'Not supplied by the source',from:'First UTC year',to:'Last UTC year',min:'Reported M at least',radius:'Pair distance at most',offshore:'Include nearby unassigned / offshore records within 100 km of the selected land boundary',run:'Update result',loading:'Loading and verifying the preserved source package…',retry:'Try again',noData:'No records match these criteria. Try another period, region or magnitude type.',noPairs:'No direct pair meets these criteria. This does not establish that the region is safe.',topCount:'ranked records',eligible:'matching source records',pairs:'direct pairs',participants:'records in a pair',single:'single-source selection',map:'Selected historical epicentres',mapNote:'Local Natural Earth context · no live feed. Markers are source records; equal locations can overlap.',rank:'Rank',date:'Origin time · UTC',mag:'Reported M',place:'Source place / land class',record:'Source key',open:'Open record',csv:'Download CSV',json:'Download JSON and evidence',evidence:'Criteria, provenance and interpretation',coverage:'Available coverage',notComplete:'The archive is limited to this package. These are not the strongest earthquakes ever, and a zero is not proof of no physical earthquakes.',typeLimit:'One source and one literal magnitude type per result. No magnitude-scale conversion.',landLimit:'Country/state selections use approximate land polygons. Offshore records are separate; select the catalogue footprint to inspect them.',unknownLimit:'The source does not document a magnitude type. This result is a ranking of its reported numbers, not a homogeneous Mw ranking.',pairA:'First record',pairB:'Second record',distance:'Epicentral distance',directOnly:'Each link is one direct pair within the radius. Links do not define a fault, rupture, recurrence interval or transitive cluster.',coastNote:'The optional 100 km context uses distance to generalized land-polygon boundaries and retains the original geographic class. It does not assign offshore events to a jurisdiction.',shown:'records shown on map',noMap:'Map unavailable; the complete computed rows remain in the table and downloads.',invalid:'Review the selected years, source and magnitude type before updating.',unassigned:'offshore / unassigned',more:'Inspect every selected record',pairsTable:'Direct nearby pairs',timeline:'Selected records through time',sourceRows:'Source rows, not independently verified earthquakes',resultStale:'Criteria changed. Update the result to apply them.',geometry:'The geographic context could not be verified. Try loading this catalogue again.'},es:{topTitle:'Los mayores registros de tu selección',topIntro:'Elige un catálogo, una región y un tipo de magnitud reportado. Sigue los diez mayores registros disponibles hasta su fuente.',recTitle:'¿Dónde hay grandes registros históricos próximos?',recIntro:'Explora pares directos de epicentros con M reportada ≥ 7. Un par próximo es una observación del archivo, no una estimación de peligro futuro.',topEyebrow:'TOP 10 HISTÓRICO',recEyebrow:'PROXIMIDAD HISTÓRICA · DESCRIPTIVA',catalogue:'Catálogo de origen',scope:'Región o país',north:'Norteamérica · clases terrestres de México, Canadá y USA',footprint:'Cobertura del catálogo · incluye mar y otras clases terrestres',state:'Estado / provincia con registros',allStates:'Todas las subdivisiones terrestres',type:'Tipo literal de magnitud',missing:'No suministrado por la fuente',from:'Primer año UTC',to:'Último año UTC',min:'M reportada al menos',radius:'Distancia máxima del par',offshore:'Incluir registros sin asignación / marinos a 100 km o menos del límite terrestre seleccionado',run:'Actualizar resultado',loading:'Cargando y verificando el paquete de origen conservado…',retry:'Reintentar',noData:'No hay registros con estos criterios. Prueba otro periodo, región o tipo de magnitud.',noPairs:'Ningún par directo cumple estos criterios. Esto no demuestra que la región sea segura.',topCount:'registros clasificados',eligible:'filas de origen coincidentes',pairs:'pares directos',participants:'registros en un par',single:'selección de una fuente',map:'Epicentros históricos seleccionados',mapNote:'Contexto local Natural Earth · sin datos en vivo. Los símbolos son filas de origen; las posiciones iguales pueden superponerse.',rank:'Puesto',date:'Hora de origen · UTC',mag:'M reportada',place:'Lugar de origen / clase terrestre',record:'Clave de origen',open:'Abrir registro',csv:'Descargar CSV',json:'Descargar JSON y evidencia',evidence:'Criterios, procedencia e interpretación',coverage:'Cobertura disponible',notComplete:'El archivo se limita a este paquete. No son los mayores sismos de toda la historia, y un cero no demuestra ausencia de sismos físicos.',typeLimit:'Una fuente y un tipo literal de magnitud por resultado. No se convierten escalas.',landLimit:'País y estado se seleccionan mediante polígonos terrestres aproximados. Los registros marinos quedan separados; elige la cobertura del catálogo para consultarlos.',unknownLimit:'La fuente no documenta el tipo de magnitud. Se clasifican sus números reportados, sin afirmar homogeneidad Mw.',pairA:'Primer registro',pairB:'Segundo registro',distance:'Distancia epicentral',directOnly:'Cada enlace representa un par directo dentro del radio. No define una falla, ruptura, intervalo de recurrencia ni un grupo transitivo.',coastNote:'El contexto opcional de 100 km usa distancia a límites terrestres generalizados y conserva la clase geográfica original. No asigna eventos marinos a una jurisdicción.',shown:'registros mostrados en el mapa',noMap:'Mapa no disponible; las filas calculadas completas siguen en la tabla y las descargas.',invalid:'Revisa los años, la fuente y el tipo de magnitud antes de actualizar.',unassigned:'mar / sin asignar',more:'Consultar todos los registros seleccionados',pairsTable:'Pares directos próximos',timeline:'Los registros seleccionados en el tiempo',sourceRows:'Filas de origen, sin validar como sismos independientes',resultStale:'Cambiaste los criterios. Actualiza el resultado para aplicarlos.',geometry:'No se pudo verificar el contexto geográfico. Intenta cargar este catálogo de nuevo.'}};
  function mount(element,options={}){
    const mode=options.mode==='recurrence'?'recurrence':'top';let data=null,filters=null,result=null,map=null,layers=null,disposed=false,request=0,pending=false;
    const lang=()=>options.getLanguage?.()==='es'?'es':'en',t=()=>text[lang()],n=(v,d=2)=>finite(v)?v.toLocaleString(lang(),{maximumFractionDigits:d}):'—';
    const catalogs=()=>options.getCatalogs?.()||[];
    const catalogLabel=c=>c.label?.[lang()]||c.label?.en||c.id;
    const regionLabel=id=>label(data?.admin1?.regions?.find(r=>r.id===id),lang())||id;
    const q=s=>element.querySelector(s);
    function select(name,items,value){return '<select data-history="'+name+'">'+items.map(([id,title])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select>';}
    function writeMarkup(){
      if(disposed)return;destroyMap();const tx=t(),cs=catalogs(),chosen=filters?.catalogueId||cs.find(c=>c.id==='usgs-na-2020-2025')?.id||cs[0]?.id||'';
      element.classList.add('history-explorer');element.innerHTML='<div class="history-heading"><div><p class="history-eyebrow">'+tx[mode==='top'?'topEyebrow':'recEyebrow']+'</p><h2>'+tx[mode==='top'?'topTitle':'recTitle']+'</h2><p>'+tx[mode==='top'?'topIntro':'recIntro']+'</p></div><span class="history-source-badge">'+tx.single+'</span></div><div class="history-controls"><label>'+tx.catalogue+select('catalogueId',cs.map(c=>[c.id,catalogLabel(c)]),chosen)+'</label><label>'+tx.scope+select('scope',[['NA',tx.north],...NA.map(id=>[id,countryName(id,lang())]),['footprint',tx.footprint]],filters?.scope||'NA')+'</label><label class="history-admin-label">'+tx.state+select('admin1',[['',tx.allStates]],filters?.admin1||'')+'</label><label>'+tx.type+select('magType',[],filters?.magType||'')+'</label><div class="history-years"><label>'+tx.from+'<input data-history="yearFrom" type="number" step="1" value="'+esc(filters?.yearFrom??'')+'"></label><label>'+tx.to+'<input data-history="yearTo" type="number" step="1" value="'+esc(filters?.yearTo??'')+'"></label></div>'+(mode==='recurrence'?'<label>'+tx.min+'<input data-history="minimumMagnitude" type="number" step="0.1" min="7" max="9" value="'+(filters?.minimumMagnitude??7)+'"></label><label>'+tx.radius+select('radiusKm',[25,50,100,200].map(k=>[String(k),k+' km']),String(filters?.radiusKm??100))+'</label><label class="history-offshore"><input type="checkbox" data-history="includeOffshore"'+(filters?.includeOffshore?' checked':'')+'><span>'+tx.offshore+'</span></label>':'')+'<button class="history-run">'+tx.run+' ↗</button></div><p class="history-status" role="status" aria-live="polite"></p><p class="history-coverage"></p><div class="history-output"></div>';
      q('[data-history="catalogueId"]').addEventListener('change',()=>load(q('[data-history="catalogueId"]').value));
      q('[data-history="scope"]').addEventListener('change',()=>{if(!data)return;filters={...read(),admin1:''};populateState();pendingResult();});
      for(const control of element.querySelectorAll('[data-history]'))if(!['catalogueId','scope'].includes(control.dataset.history))control.addEventListener('change',()=>{if(data)pendingResult();});
      q('.history-run').addEventListener('click',()=>run());
      if(data){populateControls();if(result)render();}
    }
    function populateState(){
      const scope=q('[data-history="scope"]').value,selected=filters?.admin1||'',counts=new Map();
      for(const e of data.events)if(e.country_id===scope&&e.admin1_id)counts.set(e.admin1_id,(counts.get(e.admin1_id)||0)+1);
      const regions=(data.admin1?.regions||[]).filter(r=>r.country_id===scope&&counts.has(r.id)).sort((a,b)=>label(a,lang()).localeCompare(label(b,lang()),lang()));
      const stateControl=q('[data-history="admin1"]');stateControl.innerHTML='<option value="">'+t().allStates+'</option>'+regions.map(r=>'<option value="'+esc(r.id)+'"'+(r.id===selected?' selected':'')+'>'+esc(label(r,lang()))+' · '+n(counts.get(r.id),0)+'</option>').join('');
      stateControl.disabled=!NA.includes(scope);q('.history-admin-label').hidden=!NA.includes(scope);
      const offshore=q('[data-history="includeOffshore"]');if(offshore){offshore.disabled=scope==='footprint';if(scope==='footprint')offshore.checked=false;}
    }
    function populateControls(){
      q('[data-history="scope"]').value=filters.scope;
      q('[data-history="magType"]').innerHTML=types(data).map(type=>'<option value="'+esc(type)+'"'+(type===filters.magType?' selected':'')+'>'+esc(type===MISSING?t().missing:type)+'</option>').join('');
      const [lo,hi]=data.catalog.years;for(const key of ['yearFrom','yearTo']){const input=q('[data-history="'+key+'"]');input.min=lo;input.max=hi;input.value=filters[key];}
      populateState();
      const coverage=data.catalog.coverage_period;
      q('.history-coverage').textContent=t().coverage+': '+catalogLabel(data.catalog)+' · '+(coverage?.start_utc||lo)+' → '+(coverage?.end_exclusive_utc?'< '+coverage.end_exclusive_utc:coverage?.end_inclusive_utc||hi)+' · '+t().notComplete;
      for(const b of element.querySelectorAll('input,select,button'))b.disabled=false;populateState();
    }
    function read(){return {...filters,catalogueId:q('[data-history="catalogueId"]').value,scope:q('[data-history="scope"]').value,admin1:q('[data-history="admin1"]').value,yearFrom:Number(q('[data-history="yearFrom"]').value),yearTo:Number(q('[data-history="yearTo"]').value),magType:q('[data-history="magType"]').value,...(mode==='recurrence'?{minimumMagnitude:Number(q('[data-history="minimumMagnitude"]').value),radiusKm:Number(q('[data-history="radiusKm"]').value),includeOffshore:q('[data-history="includeOffshore"]').checked}:{includeOffshore:false})};}
    function pendingResult(){pending=true;q('.history-status').textContent=t().resultStale;for(const b of element.querySelectorAll('[data-history-download]'))b.disabled=true;}
    function errorMessage(error){return error.message==='HISTORY_GEOMETRY'?t().geometry:t().invalid;}
    function run(){
      if(!data)return;try{const next=read(),computed=mode==='top'?computeTop(data,next):computeRecurrence(data,next);filters=next;result=computed;pending=false;q('.history-status').textContent='';render();}catch(error){pending=true;q('.history-status').textContent=errorMessage(error);for(const b of element.querySelectorAll('[data-history-download]'))b.disabled=true;}
    }
    function scopeTitle(){const f=result.filters;return (f.scope==='footprint'?t().footprint:f.scope==='NA'?t().north:countryName(f.scope,lang()))+(f.admin1?' / '+regionLabel(f.admin1):'');}
    function recordPlace(e){return e.place||(e.admin1_id&&!String(e.admin1_id).startsWith('admin1-')?regionLabel(e.admin1_id):NA.includes(e.country_id)?countryName(e.country_id,lang()):t().unassigned);}
    function tableRows(rows,rank=false){return '<div class="history-table-scroll" tabindex="0"><table><thead><tr>'+(rank?'<th>'+t().rank+'</th>':'')+'<th>'+t().date+'</th><th>'+t().mag+'</th><th>'+t().place+'</th><th>'+t().record+'</th></tr></thead><tbody>'+rows.map(e=>'<tr>'+(rank?'<td class="history-rank">'+e.rank+'</td>':'')+'<td>'+esc(e.time?.replace('T',' ').replace(/Z$/,'')||'—')+'</td><td class="history-mag">'+n(e.reported_magnitude)+' <small>'+esc(e.magnitude_type||t().missing)+'</small></td><td>'+esc(recordPlace(e))+'</td><td><button class="history-record-link" data-open-record="'+esc(e.record_key)+'">'+esc(e.record_key)+'</button></td></tr>').join('')+'</tbody></table></div>';}
    function rankChart(rows){return '<div class="history-rank-chart" role="img" aria-label="'+esc(t().topTitle)+'">'+rows.map(e=>'<div><span>'+String(e.rank).padStart(2,'0')+'</span><div><b>'+esc(recordPlace(e))+'</b><small>'+esc(String(e.time||'').slice(0,10))+'</small><i style="width:'+Math.max(0,e.reported_magnitude/10*100)+'%"></i></div><strong>'+n(e.reported_magnitude)+'</strong></div>').join('')+'</div>';}
    function render(){
      if(!result)return;destroyMap();const tx=t(),rows=result.ranked_records||result.records,rec=mode==='recurrence',paired=result.paired_records||0,applied=result.filters;
      q('.history-output').innerHTML='<div class="history-applied"><strong>'+esc(scopeTitle())+'</strong><span>'+applied.yearFrom+'–'+applied.yearTo+' UTC</span><span>'+esc(applied.magType===MISSING?tx.missing:applied.magType)+'</span>'+(rec?'<span>M ≥ '+n(applied.minimumMagnitude)+' · ≤ '+applied.radiusKm+' km</span>':'')+'</div><p class="history-meaning">'+tx.typeLimit+' '+(applied.magType===MISSING?tx.unknownLimit:'')+'</p><div class="history-observation"><div class="history-focus">'+(rec?'<div class="history-metric"><b>'+n(result.pair_count,0)+'</b><span>'+tx.pairs+'</span></div><div class="history-metric"><b>'+n(paired,0)+'</b><span>'+tx.participants+'</span></div><p>'+tx.directOnly+'</p>':'<div class="history-metric"><b>'+rows.length+'</b><span>'+tx.topCount+'</span><small>'+n(result.eligible_records,0)+' '+tx.eligible+'</small></div>'+rankChart(rows))+'</div><article class="history-map-card"><div><h3>'+tx.map+'</h3><span>'+rows.length+' '+tx.shown+'</span></div><div class="history-map" role="region" aria-label="'+esc(tx.map)+'"></div><p>'+tx.mapNote+'</p></article></div>'+(!rows.length?'<p class="history-empty">'+tx.noData+'</p>':rec&&!result.pair_count?'<p class="history-empty">'+tx.noPairs+'</p>':'')+(rec?'<article class="history-pairs-card"><h3>'+tx.pairsTable+'</h3>'+pairTable()+'</article><details class="history-records"><summary>'+tx.more+' ('+rows.length+')</summary>'+tableRows(rows)+'</details>':tableRows(rows,true))+'<div class="history-downloads"><button data-history-download="csv">↓ '+tx.csv+'</button><button data-history-download="json">↓ '+tx.json+'</button><p>'+tx.sourceRows+'</p></div><details class="history-evidence"><summary>'+tx.evidence+'</summary><p>'+tx.landLimit+'</p>'+(rec?'<p>'+tx.directOnly+'</p>'+(applied.includeOffshore?'<p>'+tx.coastNote+'</p>':''):'')+'<p>'+tx.notComplete+'</p><pre>'+esc(JSON.stringify({filters:result.filters,input:result.input,rule:result.rule,selection:result.selection,limits:result.limits},null,2))+'</pre></details>';
      for(const button of element.querySelectorAll('[data-open-record]'))button.addEventListener('click',()=>{const e=data.events.find(e=>rowKey(e)===button.dataset.openRecord);if(e)options.onOpenRecord?.(e,data.catalog.id);});
      for(const button of element.querySelectorAll('[data-history-download]'))button.addEventListener('click',()=>download(button.dataset.historyDownload));
      const fit=document.createElement('button');fit.className='history-fit';fit.textContent=lang()==='es'?'Ajustar registros':'Fit records';fit.addEventListener('click',fitMapRows);q('.history-map-card>div').append(fit);
      renderMap(rows);
    }
    function pairTable(){
      if(!result.pairs.length)return '<p class="small">'+t().noPairs+'</p>';
      const lookup=new Map(result.records.map(e=>[e.record_key,e]));
      return '<div class="history-table-scroll" tabindex="0"><table><thead><tr><th>#</th><th>'+t().pairA+'</th><th>'+t().pairB+'</th><th>'+t().distance+'</th></tr></thead><tbody>'+result.pairs.map(p=>{const a=lookup.get(p.record_a),b=lookup.get(p.record_b);return '<tr><td>'+p.pair_no+'</td><td><b>'+esc(a.time?.slice(0,10))+' · M '+n(a.reported_magnitude)+'</b><small>'+esc(recordPlace(a))+'</small><button class="history-record-link" data-open-record="'+esc(a.record_key)+'">'+esc(a.record_key)+'</button></td><td><b>'+esc(b.time?.slice(0,10))+' · M '+n(b.reported_magnitude)+'</b><small>'+esc(recordPlace(b))+'</small><button class="history-record-link" data-open-record="'+esc(b.record_key)+'">'+esc(b.record_key)+'</button></td><td><strong>'+n(p.distance_km,2)+' km</strong></td></tr>';}).join('')+'</tbody></table></div>';
    }
    function renderMap(rows){
      const L=typeof window!=='undefined'?window.L:null;if(!L){q('.history-map').textContent=t().noMap;return;}
      const container=q('.history-map');if(!container.clientWidth)return;try{
        const transform=window.SeismicMapGeometry,styles=window.getComputedStyle(document.documentElement),color=(name,fallback)=>styles.getPropertyValue(name).trim()||fallback;
        const accent=color('--green','#176d99'),boundary=color('--map-boundary','#6b8992'),land=color('--map-land','#dce8e7'),focus=color('--map-focus-land','#f1e8ce'),halo=color('--selection-halo','#fff'),muted=color('--point-unknown','#82939e');
        container.style.backgroundColor=color('--map-ocean','#dcece9');
        map=L.map(container,{scrollWheelZoom:false,worldCopyJump:true,zoomControl:true,attributionControl:true}).setView([38,-105],3);layers=L.layerGroup().addTo(map);
        if(data.geometry)L.geoJSON(displayGeometry(data.geometry,transform),{style:f=>({color:boundary,weight:1,fillColor:(result.filters.scope==='NA'?NA:[result.filters.scope]).includes(f.properties?.ISO_A3)?focus:land,fillOpacity:.9}),interactive:false}).addTo(map);
        if(data.admin1Geometry&&NA.includes(result.filters.scope))L.geoJSON(displayGeometry(data.admin1Geometry,transform),{filter:f=>f.properties?.country_id===result.filters.scope,style:f=>({color:f.properties?.admin1_id===result.filters.admin1?accent:boundary,weight:f.properties?.admin1_id===result.filters.admin1?2:1,fillOpacity:0}),interactive:false}).addTo(map);
        map.attributionControl.addAttribution('Natural Earth · public domain');L.control.scale({imperial:false,maxWidth:140}).addTo(map);
        const coordinates=[],location=new Map();for(const e of rows){if(!validPoint(e))continue;const longitude=transform?.displayLongitude?transform.displayLongitude(e.longitude):(e.longitude>0?e.longitude-360:e.longitude),xy=[e.latitude,longitude];coordinates.push(xy);location.set(e.record_key,xy);
          const selected=mode==='top'||e.in_proximity_pair,pointColor=selected?accent:muted;
          const marker=(mode==='top'?L.marker(xy,{icon:L.divIcon({className:'history-rank-marker',html:'<span>'+e.rank+'</span>',iconSize:[28,28],iconAnchor:[14,14]})}):L.circleMarker(xy,{radius:5+e.reported_magnitude*.6,color:halo,weight:1.5,fillColor:pointColor,fillOpacity:selected?.9:.55})).addTo(layers);
          marker.bindTooltip('<b>'+(e.rank?'#'+e.rank+' · ':'')+'M '+n(e.reported_magnitude)+' '+esc(e.magnitude_type||t().missing)+'</b><br>'+esc(String(e.time||'').slice(0,10))+'<br>'+esc(recordPlace(e))+'<br>'+esc(e.record_key));
          marker.on('click',()=>{const original=data.events.find(row=>rowKey(row)===e.record_key);if(original)options.onOpenRecord?.(original,data.catalog.id);});
        }
        if(mode==='recurrence'){
          for(const p of result.pairs){const a=location.get(p.record_a),b=location.get(p.record_b);if(a&&b)L.polyline([a,b],{color:accent,weight:2,opacity:.75}).bindTooltip(n(p.distance_km,2)+' km').addTo(layers);}
          // Circles are query radii around paired rows, never risk boundaries.
          for(const e of rows.filter(e=>e.in_proximity_pair)){const xy=location.get(e.record_key);if(xy)L.circle(xy,{radius:result.filters.radiusKm*1000,color:accent,weight:1,dashArray:'4 5',fillOpacity:.025,interactive:false}).addTo(layers);}
        }
        if(coordinates.length)map.fitBounds(L.latLngBounds(coordinates).pad(.18),{maxZoom:7,animate:false});
        requestAnimationFrame(()=>{if(map)map.invalidateSize({pan:false,animate:false});});
      }catch(error){destroyMap();container.textContent=t().noMap;}
    }
    function destroyMap(){if(map){map.remove();map=null;layers=null;}}
    function fitMapRows(){if(!map||!result)return;const rows=result.ranked_records||result.records,transform=window.SeismicMapGeometry,coordinates=rows.filter(validPoint).map(e=>[e.latitude,transform?.displayLongitude?transform.displayLongitude(e.longitude):(e.longitude>0?e.longitude-360:e.longitude)]);if(coordinates.length)map.fitBounds(window.L.latLngBounds(coordinates).pad(.18),{maxZoom:7,animate:false});else map.setView([38,-105],3,{animate:false});}
    function download(kind){if(!result||pending)return;const name=mode==='top'?'historical-top10':'historical-proximity',value=kind==='csv'?csv(result):JSON.stringify({...result,created_utc:new Date().toISOString()},null,2),blob=new Blob([value],{type:kind==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'-'+data.catalog.id+'.'+kind;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    async function load(id){
      const own=++request;pending=true;result=null;data=null;filters=null;writeMarkup();q('[data-history="catalogueId"]').value=id;q('.history-status').textContent=t().loading;
      for(const b of element.querySelectorAll('input,select,button'))b.disabled=true;
      try{const loaded=await options.loadData(id);if(disposed||own!==request)return;data=loaded;filters=defaults(data,mode);writeMarkup();run();}catch(error){if(disposed||own!==request)return;q('.history-status').textContent=t().geometry+' '+(String(error?.message||'').startsWith('HISTORY_')?'':String(error?.message||''));for(const b of element.querySelectorAll('input,select,button'))b.disabled=true;q('[data-history="catalogueId"]').disabled=false;q('.history-run').disabled=false;q('.history-run').textContent=t().retry;q('.history-run').onclick=()=>load(id);}
    }
    writeMarkup();
    return {activate(){if(data){if(!map&&result)renderMap(result.ranked_records||result.records);if(map)requestAnimationFrame(()=>map?.invalidateSize({pan:false,animate:false}));return Promise.resolve(result);}const cs=catalogs();return load(cs.find(c=>c.id===(mode==='recurrence'?'ssn-mx-historical':'usgs-na-2020-2025'))?.id||cs[0]?.id);},refreshLanguage(){if(data)filters=read();writeMarkup();if(pending&&data){q('.history-status').textContent=t().resultStale;for(const b of element.querySelectorAll('[data-history-download]'))b.disabled=true;}},refreshAppearance(){if(result)renderMapAfterAppearance();},dispose(){disposed=true;request++;destroyMap();element.innerHTML='';},getResult:()=>pending?null:copy(result)};
    function renderMapAfterAppearance(){destroyMap();renderMap(result.ranked_records||result.records);}
  }
  return Object.freeze({mount,computeTop,computeRecurrence,csv,haversine,boundaryDistance,displayGeometry,defaults,types,usefulType,EARTH_RADIUS_KM,DISTANCE_TOLERANCE_KM,MISSING});
});
