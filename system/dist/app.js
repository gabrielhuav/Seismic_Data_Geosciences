'use strict';
const $ = id => document.getElementById(id);
const I = window.SeismicI18n, V = window.SeismicViewState, C = window.SeismicCatalogComposition;
const t = (key, values) => I.t(key, values);
const state = {events: [], fields: [], filtered: [], manifest: null, registry: null, catalog: null, page: 0, size: 40, revisions: null,
  applied: {...V.defaults}, tab: 'catalog', selectedEvent: '', ready: false, restoring: false,
  formValid: true, invalidLink: [], hashes: {}, action: '', loadError: null, request: 0, locationRequest:0, cache: new Map(), packageLoads:new Map(), baseStatus: 'baseLocalNote', highlightedEvent:'', expanded:false,
  geography:null, geographyHash:'', activePacks:[], composition:null,filtersOpen:false,coverage:null,revisionsHash:'',coverageHash:'',sourceView:'atlas'};
const fmt = n => new Intl.NumberFormat(I.language).format(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value = (n, dec = 2) => n === null || n === undefined || n === '' ? t('notReported') : Number(n).toLocaleString(I.language, {maximumFractionDigits: dec});
const date = s => s ? s.replace('T', ' ').replace(/Z$/, ' UTC') : t('notReported');
const unm = V.isUnmAttributed;
const controls = Object.keys(V.defaults);
const catalogLabel = c => c.label?.[I.language] || c.label?.en || c.id;
const loadingText = c => c ? t('loadingCatalog', {label:catalogLabel(c)})
  + (Number.isFinite(c.events_bytes) && c.events_bytes > 0 ? ' ' + t('loadingSize', {size:value(c.events_bytes/1000000,1)}) : '') : t('loading');
const snapshot = () => String(state.manifest?.snapshot_commit || state.catalog?.snapshot || '');
const derivedKey = () => state.catalog?.identifier_kind === 'derived_row_key' || state.manifest?.identifier_kind === 'derived_row_key';
const depthKnown = () => state.catalog?.depth_unit_status !== 'not_documented_in_source' && state.manifest?.depth_unit_status !== 'not_documented_in_source'
  && (state.catalog?.depth_unit === 'km' || state.manifest?.depth_unit === 'km' || state.catalog?.provider === 'usgs' || state.catalog?.provider === 'all');
const packFor = event => state.activePacks.find(p=>p.catalog.id===(event?._catalog_id || state.catalog?.id));
const eventDepthKnown = event => {const c=packFor(event)?.catalog || state.catalog;return c?.provider==='usgs' || c?.depth_unit==='km';};
const regionLabel = id => {const r=state.geography?.regions.find(r=>r.id===id);return r?.label?.[I.language] || r?.label?.en || id || t('notReported');};
const combinedDefinition = () => ({id:'all-catalogs',provider:'all',provider_name:t('allSources'),label:{es:'Todos los catálogos disponibles',en:'All available catalogs'},years:[1900,2026],minimum_magnitude:3.5,bounds:[[3,-195],[85,-40]],events_bytes:state.registry?.catalogs.every(c=>Number.isFinite(c.events_bytes)) ? state.registry.catalogs.reduce((sum,c)=>sum+c.events_bytes,0) : null});
const geographyEvidence = () => ({index_path:'data/country-index.json',index_sha256:state.geographyHash,geometry_path:state.geography.geometry_path,geometry_sha256:state.geography.geometry_sha256,method:state.geography.method,selected_country:state.applied.country || null,...(state.admin1 ? {admin1:{index_path:'data/admin1-index.json',index_sha256:state.admin1Hash,geometry_path:'data/admin1.geojson',geometry_sha256:state.admin1.geometry_sha256,selected_admin1:state.applied.admin1||null}} : {})});
const safeURL = raw => {if (!raw) return '';try {const u = new URL(raw, location.href);return ['http:', 'https:'].includes(u.protocol) ? u.href : '';} catch (_) {return '';}};
const color = (name, fallback) => window.getComputedStyle?.(document.documentElement).getPropertyValue(name).trim() || fallback;
let debounce;

const TRANSPORT_SHA256='0ab2f5b5f1caed3ba5cd21d9919d4fe75be64fa8b168ac040f794aefb3344600';
const downloadJobs=new Map();let lastProgressPaint=0,sqlPanel=null,sqlContextCache=null,sqlSelectionVersion=0;
// Initial access is gated by actual data verification and view rendering.
const startupTargets=[...document.querySelectorAll('header,main,.tools-nav')];
startupTargets.forEach(node=>node.inert=true);
if(I.language==='es'){$('startupTitle').textContent='Preparando el sistema';$('startupPhase').textContent='Cargando los datos conservados y comprobando las fuentes…';$('startupNote').textContent='El mapa se habilita después de verificar los datos y preparar la vista.';$('startupRetry').textContent='Reintentar carga';}
function startupPhase(phase){if(!$('startupScreen')||$('startupScreen').hidden)return;const en=I.language==='en';const labels={download:en?'Loading preserved catalogue files…':'Cargando los archivos sísmicos conservados…',verify:en?'Verifying source hashes…':'Verificando hashes de las fuentes…',decompress:en?'Decompressing the verified payload…':'Descomprimiendo los datos verificados…',parse:en?'Reading source records…':'Leyendo los registros de las fuentes…',render:en?'Preparing the selected map and controls…':'Preparando el mapa y los controles seleccionados…'};$('startupPhase').textContent=labels[phase]||labels.verify;}
async function waitForPresentation(){
  await document.fonts?.ready;
  const drawing=$('architectureDrawing');
  if(state.tab==='methods' && drawing && 'contentDocument' in drawing && window.getComputedStyle(drawing).display!=='none' && drawing.contentDocument?.documentElement?.localName!=='svg')await new Promise((resolve,reject)=>{
    const finish=(error)=>{clearTimeout(timer);drawing.removeEventListener('load',loaded);drawing.removeEventListener('error',failed);error?reject(error):resolve();};
    const loaded=()=>finish(),failed=()=>finish(Error('The system design could not be loaded.'));
    const timer=setTimeout(()=>finish(Error('The system design did not finish loading.')),15000);drawing.addEventListener('load',loaded,{once:true});drawing.addEventListener('error',failed,{once:true});
  });
}
function finishStartup(){
  const failed=!!state.loadError||document.body.dataset.articleStatus==='error';
  if(failed){$('startupTitle').textContent=I.language==='en'?'The system could not finish loading':'No se pudo terminar la carga';$('startupPhase').textContent=state.loadError||$('loadStatus').textContent;$('startupRetry').hidden=false;$('startupProgress').removeAttribute('value');return;}
  $('startupProgress').value=100;$('startupScreen').hidden=true;startupTargets.forEach(node=>node.inert=false);document.body.dataset.startup='ready';
}
$('startupRetry').addEventListener('click',()=>location.reload());
function updateTransportProgress(event){
  if(event.phase==='download')downloadJobs.set(event.url,{loaded:event.loaded||0,total:event.total||0});
  startupPhase(event.phase);
  const now=Date.now();if(now-lastProgressPaint<120 && event.phase==='download')return;lastProgressPaint=now;
  const jobs=[...downloadJobs.values()],loaded=jobs.reduce((n,v)=>n+v.loaded,0),total=jobs.reduce((n,v)=>n+v.total,0);
  if($('loadingPhase'))$('loadingPhase').textContent=t(event.phase==='download'?'downloadProgress':'downloadPhase');
  if($('loadingBytes'))$('loadingBytes').textContent=t('downloadBytes',{loaded:value(loaded/1e6,1),total:total?value(total/1e6,1):'…'});
  if($('dataLoadProgress')){if(total)$('dataLoadProgress').value=Math.min(100,loaded/total*100);else $('dataLoadProgress').removeAttribute('value');}
  if(!$('startupScreen').hidden){$('startupBytes').textContent=$('loadingBytes').textContent;if(event.phase==='download'&&total)$('startupProgress').value=Math.min(100,loaded/total*100);else $('startupProgress').removeAttribute('value');}
}
function getSQLContext(){
  if(!state.ready || !state.formValid)return {ready:false,key:'unavailable',records:[],catalogs:[],evidence:null,selectionLabel:t('sqlNotReady')};
  if(sqlContextCache)return sqlContextCache;
  const view=currentView(),geography=geographyEvidence(),evidence=V.queryDocument({view,catalog:state.catalog,manifest:state.manifest,assetHashes:state.hashes,fields:state.fields,rows:state.filtered,pageURL:viewURL(view),createdUTC:new Date().toISOString(),inputs:state.activePacks,geography});
  // SQL can group by admin1_id even without an administrative filter. Retain the
  // derivation's input hashes independently of the map-query predicate version.
  if(geography.admin1)evidence.geography={...evidence.geography,admin1:geography.admin1};
  const records=state.filtered.map((e,n)=>{
    const p=packFor(e),c=p.catalog,kind=c.identifier_kind||p.manifest.identifier_kind||'source_event_id';
    const raw=Object.fromEntries(Object.entries(e).filter(([k])=>k.startsWith('raw_')||['source_record','source_row_sha256'].includes(k)));
    return {row_no:n+1,record_key:c.id+'~'+(e.source_event_id||e.id),catalogue_id:c.id,event_id:kind==='derived_row_key'?null:(e.source_event_id||e.id),time:e.time,year:e.year,latitude:e.latitude,longitude:e.longitude,mag:e.mag,mag_type:e.magType||null,depth_km:eventDepthKnown(e)?e.depth:null,country_id:e.country_id,admin1_id:e.admin1_id||null,provider:c.provider,location_source:e.locationSource??null,mag_source:e.magSource??null,place:e.place??null,identifier_kind:kind,original_fields:Object.keys(raw).length?JSON.stringify(raw):null};
  });
  const catalogs=state.activePacks.map(p=>({catalogue_id:p.catalog.id,label:catalogLabel(p.catalog),provider:p.catalog.provider,snapshot:p.catalog.snapshot||p.manifest.snapshot_commit,source_hash:p.hashes.events,manifest_hash:p.hashes.manifest,identifier_kind:p.catalog.identifier_kind||p.manifest.identifier_kind||'source_event_id',depth_unit:p.catalog.depth_unit|| (p.catalog.provider==='usgs'?'km':null)}));
  sqlContextCache={ready:true,key:'selection-'+sqlSelectionVersion,records,catalogs,evidence,selectionLabel:$('mapSelection').textContent};return sqlContextCache;
}
function ensureSQLPanel(){
  if(!sqlPanel && window.SeismicSQLPanel && $('sqlWorkspace'))sqlPanel=window.SeismicSQLPanel.mount($('sqlWorkspace'),{getContext:getSQLContext,getLanguage:()=>I.language});
  return sqlPanel;
}



let admin1Loading=null,tectonicLoading=null,pendingCountry='',comparisonPanel=null;
let topPanel=null,recurrencePanel=null,quickPanel=null,helpPanel=null;
async function loadRegionalData(id){
  if(!state.registry)throw Error(t('loading'));
  const catalog=state.registry.catalogs.find(c=>c.id===id);
  if(!catalog)throw Error(t('invalidPackage'));
  await ensureAdmin1();
  const pack=await loadPackage(catalog);
  return {...pack,hashes:{...pack.hashes,registry:state.registryHash},geography:state.geography,admin1:state.admin1,geometry:state.basemap,
    admin1Geometry:state.admin1Geometry,geographyEvidence:{...geographyEvidence(),selected_country:null,
      admin1:{index_path:'data/admin1-index.json',index_sha256:state.admin1Hash,geometry_sha256:state.admin1.geometry_sha256,selected_admin1:null}}};
}
function ensureHistoryPanel(mode){
  if(!window.SeismicHistoryExplorer)return null;
  const options={mode,getLanguage:()=>I.language,getCatalogs:()=>state.registry?.catalogs||[],loadData:loadRegionalData,
    onOpenRecord:async(event,catalogId)=>{await loadCatalog(catalogId,false);if(state.ready)detail(event.id);}};
  if(mode==='top' && !topPanel)topPanel=window.SeismicHistoryExplorer.mount($('topWorkspace'),options);
  if(mode==='recurrence' && !recurrencePanel)recurrencePanel=window.SeismicHistoryExplorer.mount($('recurrenceWorkspace'),options);
  return mode==='top'?topPanel:recurrencePanel;
}
async function applyQuickSelection(selection){
  await ensureAdmin1();
  const {catalog,country,admin1,yearFrom,yearTo,magMin,magType}=selection;
  state.quickAction=selection.action;
  await loadCatalog(catalog,false,{country,admin1,yearFrom,yearTo,magMin,magType});
  if(!state.ready||!state.formValid)throw Error(t('invalidFilters'));
  if(Object.entries({country,admin1,yearFrom,yearTo,magMin,magType}).some(([key,v])=>String(state.applied[key])!==String(v??'')))throw Error(t('invalidFilters'));
  renderAnalysis();
  if(state.tab==='quick'){
    const mount=quickPanel?.getMapMount();if(mount && $('mapCard').parentElement!==mount)mount.append($('mapCard'));
    requestAnimationFrame(()=>{state.map?.resize();drawMap();state.map?.fitRecords();});
  }
  const summary=summaryForSelection();
  const distributions=(summary.groups||[]).map(g=>({catalog_id:g.catalog_id,mag_type:g.mag_type,svg:window.SeismicResearchCharts.svgHistogram(window.SeismicResearchCharts.distribution(state.filtered,{catalogId:g.catalog_id,magType:g.mag_type,catalogs:state.activePacks.map(p=>p.catalog)}),chartOptions('magnitudeDistribution'))}));
  return {count:state.filtered.length,summary,distributions,selectionLabel:$('mapSelection').textContent,
    reportHTML:selection.action==='report'?analysisReportHtml():null};
}
function ensureQuickPanel(){
  if(!quickPanel && window.SeismicQuickStart)quickPanel=window.SeismicQuickStart.mount($('quickWorkspace'),{
    getLanguage:()=>I.language,getCatalogs:()=>state.registry?.catalogs||[],loadData:loadRegionalData,
    applySelection:applyQuickSelection,
    showMap:mount=>{if(mount && $('mapCard').parentElement!==mount)mount.append($('mapCard'));requestAnimationFrame(()=>{state.map?.resize();drawMap();});},
    onExport:async(format,selection)=>{
      await applyQuickSelection(selection);
      if(format==='csv')exportCsv();else if(format==='json')exportAnalysisJson();
      else if(format==='zip')await exportFullPackage();else if(format==='html')exportAnalysisReport();
      else previewAnalysisReport();
    },openFull:async(action,selection)=>{if(selection)await applyQuickSelection(selection);setTab(action==='statistics'?'analysis':'catalog');}
  });
  return quickPanel;
}
function ensureHelpPanel(){
  if(!helpPanel && window.SeismicQuickStart)helpPanel=window.SeismicQuickStart.mountHelp($('helpWorkspace'),{
    getLanguage:()=>I.language,version:'2026.11.11.2',onNavigate:name=>setTab(name)
  });
  return helpPanel;
}
function ensureComparisonPanel(){
  if(!comparisonPanel && window.SeismicCountryComparison)comparisonPanel=window.SeismicCountryComparison.mount($('comparisonWorkspace'),{autoLoad:false,getLanguage:()=>I.language,loadData:async()=>{const c=state.registry.catalogs.find(c=>c.id==='usgs-na-2020-2025');const p=await loadPackage(c);return {catalog:p.catalog,events:p.events,hashes:p.hashes,geographyEvidence:{...geographyEvidence(),selected_country:null}};}});
  return comparisonPanel;
}
const realCountry=id=>!!id && !['outside','boundary','invalid'].includes(id);
function admin1Label(id){const r=state.admin1?.regions.find(r=>r.id===id);return r?.label?.[I.language]||r?.label?.en||({'admin1-outside':t('admin1Outside'),'admin1-boundary':t('admin1Boundary'),'admin1-invalid':t('admin1Invalid'),'admin1-unavailable':t('admin1UnavailableLabel')})[id]||id;}
function attachAdministrativeRows(pack){
  if(!state.admin1)return;const index=state.admin1.catalogs[pack.catalog.id];
  if(!index || index.events_sha256!==pack.hashes.events || index.admin1_ids.length!==pack.events.length)throw Error(t('hashMismatch'));
  pack.events.forEach((e,n)=>{e.admin1_id=index.admin1_ids[n];});if(!pack.fields.includes('admin1_id'))pack.fields.push('admin1_id');
}
async function ensureAdmin1(){
  if(state.admin1)return state.admin1;if(admin1Loading)return admin1Loading;
  admin1Loading=(async()=>{
    const [index,geometry,manifest]=await Promise.all(['data/admin1-index.json','data/admin1.geojson','data/admin1-manifest.json'].map(fetchAsset));
    if(index.data.schema!=='seismic-admin1-index/1'||index.data.geometry_sha256!==geometry.hash||index.data.country_index_sha256!==state.geographyHash||index.data.registry_sha256!==state.registryHash)throw Error(t('hashMismatch'));
    for(const a of manifest.data.assets){const found=a.path.endsWith('admin1.geojson')?geometry:index;if(found.hash!==a.sha256)throw Error(t('hashMismatch'));}
    state.admin1=index.data;state.admin1Hash=index.hash;state.admin1Geometry=geometry.data;state.admin1Manifest=manifest.data;
    const packs=new Set([...state.cache.values(),...state.activePacks]);
    for(const pack of packs)attachAdministrativeRows(pack);
    if(state.catalog?.id==='all-catalogs'){const lookups=new Map([...packs].map(p=>[p.catalog.id,new Map(p.events.map(e=>[e.id,e.admin1_id]))]));for(const e of state.events)e.admin1_id=lookups.get(e._catalog_id)?.get(e.source_event_id)||'admin1-unavailable';}
    if(state.ready && !state.fields.includes('admin1_id'))state.fields.push('admin1_id');sqlContextCache=null;sqlSelectionVersion++;sqlPanel?.invalidate();
    return state.admin1;
  })().catch(error=>{admin1Loading=null;throw error;});return admin1Loading;
}
function populateAdmin1(filters=state.applied){
  const country=filters.country||'',show=realCountry(country);$('admin1Control').hidden=!show;
  if(!show){$('admin1').value='';state.map?.clearAdmin1?.();return;}
  const selected=filters.admin1||'';$('admin1').replaceChildren();const all=document.createElement('option');all.value='';all.textContent=t('allAdmin1');$('admin1').append(all);
  if(!state.admin1){$('admin1').disabled=true;$('admin1Status').textContent=t('admin1Loading');
    ensureAdmin1().then(()=>{if(realCountry(state.applied.country)){populateAdmin1();if(state.applied.admin1)applyFilters();}}).catch(()=>{$('admin1Status').textContent=t('geoLayerFailed');});return;}
  const regions=state.admin1.regions.filter(r=>r.country_id===country),counts=new Map();for(const e of V.filterEvents(state.events,{...state.applied,country,admin1:''}))counts.set(e.admin1_id,(counts.get(e.admin1_id)||0)+1);
  for(const r of [...regions].sort((a,b)=>admin1Label(a.id).localeCompare(admin1Label(b.id),I.language))){const o=document.createElement('option');o.value=r.id;o.textContent=admin1Label(r.id)+' · '+fmt(counts.get(r.id)||0);$('admin1').append(o);}
  for(const id of ['admin1-outside','admin1-boundary','admin1-invalid','admin1-unavailable'])if(counts.get(id)||id===selected){const o=document.createElement('option');o.value=id;o.textContent=admin1Label(id)+' · '+fmt(counts.get(id)||0);$('admin1').append(o);}
  $('admin1').value=selected;$('admin1').disabled=!state.ready;$('admin1Status').textContent=t('admin1Ready',{n:fmt(regions.length)})+' · '+t('admin1Limit');
  state.map?.setAdmin1?.({geometry:state.admin1Geometry,countryId:country,selectedId:selected});
}
function promptCountry(id){
  if(!state.ready || !realCountry(id))return;if(state.expanded)setExpanded(false);pendingCountry=id;
  const filters={...state.applied,country:id,admin1:''},n=V.filterEvents(state.events,filters).length;
  $('countryPromptText').textContent=t('countryPromptText',{country:regionLabel(id),n:fmt(n)});$('countryPrompt').showModal();
}
async function showTectonics(){
  if(!$('tectonicToggle').checked){state.map?.setTectonics?.(null);$('tectonicStatus').textContent='';return;}
  $('tectonicStatus').textContent=t('tectonicLoading');
  try{
    if(!state.tectonics){tectonicLoading ||= Promise.all(['data/tectonic-plates.geojson','data/tectonic-plates-manifest.json'].map(fetchAsset));const [geo,manifest]=await tectonicLoading;state.tectonics=geo.data;state.tectonicManifest=manifest.data;state.tectonicHash=geo.hash;}
    if($('tectonicToggle').checked){state.map?.setTectonics?.(state.tectonics);$('tectonicStatus').textContent=t('tectonicNote');}
  }catch(error){tectonicLoading=null;$('tectonicStatus').textContent=t('geoLayerFailed');$('tectonicToggle').checked=false;}
}

function choices() {
  return {magTypes: [...new Set(state.events.map(e => e.magType).filter(Boolean)), '__missing__'],
    originSources: [...new Set(state.events.map(e => e.locationSource))].filter(Boolean),
    revisions: (state.revisions?.events || []).map(e => e.id), events: state.events.map(e => e.id),
    snapshot: snapshot(), catalogs: state.registry?.catalogs, defaultCatalog: state.registry?.default_catalog_id, catalog: state.catalog,
    countries:state.geography?.regions.map(r=>r.id),geographyHash:state.geographyHash,admin1Regions:state.admin1?.regions,admin1Hash:state.admin1Hash};
}
function readFilters() {return Object.fromEntries(controls.map(k => [k, typeof V.defaults[k] === 'boolean' ? $(k).checked : $(k).value]));}
function writeFilters(filters) {for (const k of controls) if (typeof V.defaults[k] === 'boolean') $(k).checked = filters[k]; else $(k).value = filters[k];}
function currentView() {
  return {filters: {...state.applied}, sort: $('sort').value, lang: I.language, tab: state.tab,
    revision: $('revisionEvent').value || '', event: state.selectedEvent || state.highlightedEvent, map: state.map?.getView() || null,
    snapshot: snapshot(), catalog: state.catalog?.id, admin1Geography:state.admin1Hash, base: state.map?.getBase() || 'local',geography:state.geographyHash};
}
function syncURL() {
  if (!state.ready || state.restoring || !state.formValid) return;
  const url=viewURL();
  history.replaceState(null, '', url);
  if (!$('viewLink').hidden) $('viewLink').value = url;
}
function viewURL(view=currentView()){
  const url=new URL(V.serialize(view,location.href));
  if(state.map?.getDisplayMode?.()==='heat')url.searchParams.set('display','heat');else url.searchParams.delete('display');
  if(state.map?.getColorMode?.()==='depth')url.searchParams.set('pointColor','depth');else url.searchParams.delete('pointColor');
  if(state.articleFigure)url.searchParams.set('figure',state.articleFigure);
  return url.href;
}
function setTab(name, persist = true) {
  const previousTab=state.tab;
  if(state.expanded && !['catalog','home','quick','sources','methods'].includes(name))setExpanded(false);
  state.tab = name;
  for (const tab of ['home', 'catalog', 'sources', 'analysis', 'revisions', 'comparison', 'sql', 'methods','quick','top','recurrence','help']) {
    const active = tab === name; $(tab + 'Panel').hidden = !active;
    if (active) $(tab + 'Tab').setAttribute('aria-current', 'page'); else $(tab + 'Tab').removeAttribute('aria-current');
  }
  document.body.dataset.view=name;
  if(name==='quick')ensureQuickPanel()?.activate();
  const mapMount=name==='quick' ? quickPanel?.getMapMount() : name==='home' ? $('homeMapMount') : name==='sources' ? sourceMapMount() : name==='methods' ? $('architectureMapMount') : $('catalogMapMount');
  const mapMoved=mapMount && $('mapCard').parentElement!==mapMount;
  if(mapMoved){
    if(mapMount.insertBefore)mapMount.insertBefore($('mapCard'),mapMount.firstChild);
    else mapMount.append($('mapCard'));
  }
  if (['catalog','home','quick','sources','methods'].includes(name) && state.map && (mapMoved||previousTab!==name)) requestAnimationFrame(() => {state.map.resize(); drawMap();});
  if (name === 'sources' || name === 'home') renderSources();
  if (name === 'analysis'){renderAnalysis();renderCoverage();}
  if(name==='revisions')ensureRevisionStory();
  if(name==='sql')ensureSQLPanel()?.activate();
  if(name==='comparison')ensureComparisonPanel()?.activate();
  if(name==='top')ensureHistoryPanel('top')?.activate();
  if(name==='recurrence')ensureHistoryPanel('recurrence')?.activate();
  if(name==='help')ensureHelpPanel()?.activate?.();
  const sharedTools=document.querySelector('.view-tools');if(sharedTools)sharedTools.hidden=['quick','top','recurrence','help','comparison'].includes(name);
  $('loadStatus').hidden=['top','recurrence','help','comparison'].includes(name);
  if (persist) syncURL();
}
function populate(id, values) {
  for (const x of [...new Set(values)].sort()) {const option = document.createElement('option');option.value = x;option.textContent = x || t('notReported');$(id).append(option);}
}
function populateFilters() {
  for (const [id, key] of [['magType','allTypes'],['originSource','allOrigins']]) {
    $(id).replaceChildren();const option = document.createElement('option');option.value = '';option.textContent = t(key);$(id).append(option);
  }
  populate('magType', choices().magTypes);populate('originSource', choices().originSources);
  const missing = $('magType').querySelector('option[value="__missing__"]');if (missing) missing.textContent = t('notReported');
  populateCountries();
}
function populateCountries() {
  const selected=state.applied.country || $('country').value || '';
  $('country').replaceChildren();const all=document.createElement('option');all.value='';all.textContent=t('allCountries');$('country').append(all);
  const counts=new Map();for(const e of state.events)counts.set(e.country_id,(counts.get(e.country_id)||0)+1);
  const priority=['MEX','USA','CAN','outside'];
  const regions=[...(state.geography?.regions || [])].sort((a,b)=>(priority.includes(a.id) ? priority.indexOf(a.id) : 99)-(priority.includes(b.id) ? priority.indexOf(b.id) : 99) || regionLabel(a.id).localeCompare(regionLabel(b.id),I.language));
  for(const r of regions){const option=document.createElement('option');option.value=r.id;option.textContent=regionLabel(r.id)+' · '+fmt(counts.get(r.id)||0);$('country').append(option);}
  $('country').value=selected;
}
function localizeFilterOptions() {
  for(const [id,key] of [['magType','allTypes'],['originSource','allOrigins']]) {
    const empty=$(id).querySelector('option[value=""]');if(empty)empty.textContent=t(key);
  }
  const missing=$('magType').querySelector('option[value="__missing__"]');if(missing)missing.textContent=t('notReported');
  populateCountries();
}
function describeSsn(catalog) {
  $('ssnNotice').hidden = catalog.provider !== 'ssn';if (catalog.provider !== 'ssn') return;
  let text = t('ssnHelp', {min:value(catalog.minimum_magnitude,1)});
  if (state.ready && state.manifest && state.catalog?.id === catalog.id) {
    if (Number.isInteger(state.manifest.raw_rows) && Number.isInteger(state.manifest.selection?.excluded_rows?.missing_or_invalid_magnitude))
      text += ' ' + t('ssnRawScope', {raw:fmt(state.manifest.raw_rows),missing:fmt(state.manifest.selection.excluded_rows.missing_or_invalid_magnitude)});
    text += ' ' + t('ssnLatest', {latest:date(state.latestUTC)});
  }
  $('ssnNotice').textContent = text;
}
function populateCatalogControls() {
  if (!state.registry) return;
  const selected = state.catalog || state.registry.catalogs.find(c => c.id === V.catalogFromURL(location.href, choices())) || state.registry.catalogs[0];
  const append = (id, value, text) => {const option = document.createElement('option');option.value = value;option.textContent = text;$(id).append(option);};
  const ssnActive = selected.id === V.legacyCatalog && state.applied.unmOnly === true;
  $('providerSelect').replaceChildren();for (const [id, name] of new Map(state.registry.catalogs.map(c => [c.provider,c.provider_name]))) append('providerSelect', id, name);
  append('providerSelect', 'all', t('allSources'));
  append('providerSelect', 'ssn-unam', t('ssnSource'));
  $('providerSelect').value = ssnActive ? 'ssn-unam' : selected.provider;$('catalogSelect').replaceChildren();
  for (const c of state.registry.catalogs.filter(c => ssnActive ? c.id === V.legacyCatalog : c.provider === selected.provider)) append('catalogSelect', c.id, catalogLabel(c));
  if(selected.id==='all-catalogs')append('catalogSelect',selected.id,t('allCatalogs'));
  $('catalogSelect').value = selected.id;$('providerSelect').disabled = false;$('catalogSelect').disabled = false;
  $('unmNotice').hidden = !ssnActive;
  describeSsn(selected);renderSources();
}
function actionStatus(key) {state.action = key;$('actionStatus').textContent = key ? t(key) : '';}
function showWarnings() {
  $('linkWarning').hidden = !state.invalidLink.length;
  $('linkWarning').textContent = state.invalidLink.length ? t('invalidLink', {fields: state.invalidLink.join(', ')}) : '';
}
function buttons() {
  for(const id of ['sourceExplore','sourceInspect','sourceExport','sourceStageAnalysis','sourceStageExport'])$(id).disabled=!state.ready||!state.formValid;
  for(const id of ['quickTab','topTab','recurrenceTab'])$(id).disabled=!state.registry;
  if($('loadingProgress'))$('loadingProgress').hidden=state.ready || !!state.loadError;
  if(!state.ready || !state.formValid)sqlPanel?.invalidate();
  for (const id of ['share', 'query', 'download', 'analysisRecordCsv', 'analysisQueryJson', 'analysisCsv', 'analysisJson', 'analysisReport','previewAnalysisReport','exportPackage','refreshInlineReport','workbenchCsv','workbenchJson','workbenchZip','workbenchReport','workbenchStats','workbenchSql','workbenchCompare']) $(id).disabled = !state.ready || !state.formValid;
  if(!state.ready || !state.formValid){$('inlineReportFrame').srcdoc='';$('printInlineReport').disabled=true;}
  // A new package resets its filters. Do not accept input that would be silently
  // overwritten when that asynchronous load finishes; catalog choices remain live.
  for (const id of [...controls, 'searchButton', 'reset', 'sort']) $(id).disabled = !state.ready;
  if($('admin1'))$('admin1').disabled=!state.ready || !state.admin1 || !realCountry(state.applied.country);
  if (state.ready) $('depthMax').disabled = !depthKnown();
  $('unmOnly').disabled = !state.ready || state.catalog?.id !== V.legacyCatalog;
  if(state.tab==='analysis' && (!state.ready || !state.formValid))renderAnalysis();
  if(!state.ready || !state.formValid)renderExplorerInsights();
  $('integrityStatus').textContent=state.ready ? t('verifiedMemory',{n:fmt(state.activePacks.length)}) : t('integrityLoading');
  if(!state.ready || !state.formValid){$('queryFingerprint').textContent='—';$('geographyAccounting').textContent='—';fingerprintRows=null;fingerprintRequest++;}
}
function applyFilters(persist = true) {
  if (!state.ready) return;
  const incoming=readFilters();if(!state.restoring && incoming.country!==state.applied.country){incoming.admin1='';$('admin1').value='';}
  const checked = V.validateFilters(incoming, choices()); state.formValid = checked.valid;buttons();
  $('filterError').textContent = checked.valid ? '' : t('invalidFilters');
  if (!checked.valid) return;
  const countryChanged=state.applied.country!==checked.filters.country;
  if(countryChanged && !state.restoring){checked.filters.admin1='';$('admin1').value='';}
  state.applied = checked.filters;state.page = 0;
  state.filtered = V.filterEvents(state.events, state.applied, $('sort').value);sqlContextCache=null;sqlSelectionVersion++;sqlPanel?.invalidate();populateCatalogControls();render();
  if(countryChanged)state.map?.fitRecords();
  if (persist) {state.invalidLink = [];showWarnings();actionStatus('');syncURL();}
}
function render() {
  populateAdmin1();state.map?.setCountry?.(state.applied.country);syncAdminContext();
  const rows = state.filtered;
  $('eventCount').textContent = fmt(rows.length);$('unmCount').textContent = state.catalog.provider === 'ssn' ? t('notReported') : fmt(rows.filter(unm).length);
  $('missingCount').textContent = fmt(rows.filter(e => e.horizontalError === null).length);
  $('typeCount').textContent = fmt(new Set(rows.map(e => e.magType).filter(Boolean)).size);
  $('filterSummary').textContent = t('filterSummary', {n: fmt(rows.length), total: fmt(state.events.length), from: state.applied.yearFrom, to: state.applied.yearTo, min: value(state.applied.magMin,1)});
  $('mapSelection').textContent=catalogLabel(state.catalog)+' · '+(state.applied.country ? regionLabel(state.applied.country) : t('allCountries'))+(state.applied.admin1?' · '+admin1Label(state.applied.admin1):'')+' · '+state.applied.yearFrom+'–'+state.applied.yearTo+' · M ≥ '+value(state.applied.magMin,1);
  if(state.tab==='sources')renderSourceFocus();
  if($('workbenchSelection'))$('workbenchSelection').textContent=fmt(rows.length)+' '+t('sourceRows');
  renderFilterChips();drawMap();drawHistogram();renderTable();renderExplorerInsights();renderSearchSuggestions();updateMapEvidence();
  if (state.tab === 'analysis') renderAnalysis();
  $('combinedNotice').hidden=state.catalog.id!=='all-catalogs';
  if(state.catalog.id==='all-catalogs'){
    const groups=state.activePacks.map(p=>catalogLabel(p.catalog)+': '+fmt(rows.filter(e=>e._catalog_id===p.catalog.id).length)).join(' · ');
    const ids=new Map();for(const e of rows)if(e.data_provider==='usgs')ids.set(e.source_event_id,(ids.get(e.source_event_id)||0)+1);
    $('combinedNotice').textContent=t('combinedHelp',{groups,shared:fmt([...ids.values()].filter(n=>n>1).length)});
  }
}
function renderFilterChips() {
  const initial=V.catalogDefaults(state.catalog), active=controls.filter(key=>state.applied[key]!==initial[key]);
  $('activeFilters').hidden=!active.length;
  const names={admin1:'admin1Filter',search:'search',yearFrom:'from',yearTo:'to',magMin:'magMin',magMax:'magMax',magType:'magType',originSource:'originSource',depthMax:'maxDepth',missingOnly:'missingOnly',unmOnly:'unmOnly',country:'countryFilter'};
  $('activeFilters').innerHTML=active.map(key=>{
    const raw=state.applied[key], text=typeof V.defaults[key]==='boolean' ? t(names[key]) : t(names[key])+': '+(key==='country' ? regionLabel(raw) : key==='admin1' ? admin1Label(raw) : raw==='__missing__' ? t('notReported') : raw);
    return `<button type="button" data-remove-filter="${key}" aria-label="${esc(t('removeFilter',{filter:text}))}">${esc(text)}<span aria-hidden="true">×</span></button>`;
  }).join('');
}
function removeFilter(key) {
  if (!state.ready || !controls.includes(key)) return;
  const initial=V.catalogDefaults(state.catalog), filters={...state.applied,[key]:initial[key]};
  // Reset the paired bound as well if restoring one default would invert the range.
  if (filters.yearFrom>filters.yearTo) {filters.yearFrom=initial.yearFrom;filters.yearTo=initial.yearTo;}
  if (filters.magMin>filters.magMax) {filters.magMin=initial.magMin;filters.magMax=initial.magMax;}
  writeFilters(filters);applyFilters();
}
function showOnMap(id) {
  if (!state.ready || !state.filtered.some(event=>event.id===id)) return;
  state.highlightedEvent=id;if ($('detail').open) $('detail').close();setTab('catalog',false);
  const index=state.filtered.findIndex(event=>event.id===id);state.page=Math.floor(index/state.size);renderTable();
  requestAnimationFrame(()=>{state.map.resize();state.map.focusRecord?.(id);if(!state.expanded)$('map').scrollIntoView?.({block:'center',behavior:'auto'});$('map').focus?.({preventScroll:true});syncURL();});
}
let expansionFocus, inertRestores=[];
function expandedLabel() {$('expandMap').textContent=t(state.expanded ? 'collapseMap' : 'expandMap');}
function setExpanded(expanded) {
  if (state.expanded===expanded) return;
  const card=$('mapCard');state.expanded=expanded;card.classList.toggle('is-expanded',expanded);
  document.body.classList.toggle('map-expanded',expanded);$('expandMap').setAttribute('aria-expanded',String(expanded));expandedLabel();
  if (expanded) {
    expansionFocus=document.activeElement;card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');
    let current=card;
    while(current.parentElement) {
      for(const sibling of current.parentElement.children) if(sibling!==current && sibling.id!=='detail') {inertRestores.push([sibling,sibling.inert]);sibling.inert=true;}
      current=current.parentElement;if(current===document.body)break;
    }
    $('expandMap').focus({preventScroll:true});
  } else {
    card.removeAttribute('role');card.removeAttribute('aria-modal');
    for(const [element,inert] of inertRestores)element.inert=inert;inertRestores=[];
    if(expansionFocus?.isConnected!==false)expansionFocus?.focus?.({preventScroll:true});
  }
  requestAnimationFrame(()=>state.map?.resize());
}
function appearanceChanged() {
  const preferences=window.SeismicPreferences?.get();
  if(preferences){$('theme').value=preferences.theme;$('appearance').value=preferences.mode;}
  state.map?.themeChanged?.();if(state.ready){drawHistogram();renderExplorerInsights();if(state.tab==='analysis'){renderAnalysis();renderCoverage();}if(state.tab==='revisions')renderDiagnostics();}
  topPanel?.refreshAppearance?.();recurrencePanel?.refreshAppearance?.();quickPanel?.refreshAppearance?.();
}
function renderTable() {
  const start = state.page * state.size, rows = state.filtered.slice(start, start + state.size);
  $('records').innerHTML = rows.length ? rows.map(e => `<tr class="${e.id===state.highlightedEvent ? 'record-selected' : ''}"><td>${esc(date(e.time))}</td><td><span class="mag">${value(e.mag, 1)}</span><span class="type">${esc(e.magType || '?')}</span></td><td>${eventDepthKnown(e) ? value(e.depth, 1) : esc(e.raw_depth || t('notReported'))}</td><td>${esc(e.place)}<small>${esc(e.id)}</small><small>${esc(regionLabel(e.country_id))}</small></td><td>${esc(packFor(e)?.catalog.provider_name || state.catalog.provider_name)}<small>${esc(e.locationSource || t('notReported'))}</small>${e.shared_event_id ? '<small>'+esc(t('sharedUsgsId'))+'</small>' : ''}</td><td><div class="record-actions"><button data-event="${esc(e.id)}" aria-label="${esc(t('inspectId', {id: e.id}))}">${esc(t('inspect'))}</button><button data-locate-event="${esc(e.id)}" aria-label="${esc(t('locateId',{id:e.id}))}">${esc(t('seeOnMap'))}</button></div></td></tr>`).join('') : `<tr><td colspan="6">${esc(t('noRecords'))}</td></tr>`;
  $('pageLabel').textContent = rows.length ? t('page', {first: fmt(start + 1), last: fmt(start + rows.length), total: fmt(state.filtered.length)}) : t('zeroRecords');
  $('prev').disabled = state.page === 0;$('next').disabled = start + state.size >= state.filtered.length;
}
function renderSearchSuggestions() {
  if(!$('searchSuggestions'))return;
  $('searchSuggestions').replaceChildren();
  const normal=raw=>String(raw ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  const query=normal(state.applied.search).trim();if(!state.ready || query.length<2)return;
  let n=0;
  for(const event of state.filtered){
    if(!normal(event.id+' '+event.place).includes(query))continue;
    const option=document.createElement('option');option.value=event.id;
    option.label=event.place+' · M '+value(event.mag,2)+' '+(event.magType || '?')+' · '+date(event.time);
    $('searchSuggestions').append(option);if(++n===8)break;
  }
}

// Descriptive views use the existing filtered row set; navigation never rewrites
// source values, catalogue packages, or query predicates.
function renderSources() {
  if (!state.registry) return;
  $('homeCatalogCount').textContent=fmt(state.registry.catalogs.length);
  $('homeRecordCount').textContent=fmt(state.registry.catalogs.reduce((n,c)=>n+c.event_count,0));
  if($('sourceCards') && window.SeismicSourceWorkbench)$('sourceCards').innerHTML=window.SeismicSourceWorkbench.cards(state.registry.catalogs,{lang:I.language,verified:id=>state.cache.has(id),active:state.catalog?.id});
  if($('workbenchSources') && window.SeismicSourceWorkbench)$('workbenchSources').innerHTML=window.SeismicSourceWorkbench.inputs(state.registry.catalogs,I.language,state.catalog?.id);
  if(window.SeismicSourceWorkbench){
    const W=window.SeismicSourceWorkbench,options={lang:I.language,active:state.catalog?.id,
      verified:id=>state.cache.has(id),extent:id=>state.cache.get(id)?.timeExtent};
    $('sourceAtlasInputs').innerHTML=W.inputs(state.registry.catalogs,I.language,state.catalog?.id);
    $('sourceTimeTracks').innerHTML=W.timeline(state.registry.catalogs,options);
    renderSourceFocus();
    setSourceView(state.sourceView);
  }
  $('sourceInventoryRows').innerHTML=state.registry.catalogs.map(c=>{
    const known=c.provider==='usgs' || c.depth_unit==='km';
    return `<tr><td><strong>${esc(catalogLabel(c))}</strong><small>${esc(c.id)}</small></td><td>${esc(c.provider_name)}</td><td>${c.years[0]}–${c.years[1]}<small>M ≥ ${value(c.minimum_magnitude,1)}</small></td><td>${fmt(c.event_count)}</td><td>${esc(t(c.identifier_kind==='derived_row_key' ? 'derivedId' : 'officialId'))}<small>${esc(t(known ? 'documentedDepth' : 'unknownDepthUnit'))}</small></td><td><button data-source-catalog="${esc(c.id)}">${esc(t('openThisCatalog'))}</button><div class="source-links"><a href="${esc(safeURL(c.events_url))}" download>${esc(t('packagedData'))}</a><a href="${esc(safeURL(c.manifest_url))}" download>${esc(t('fieldManifest'))}</a></div><details><summary>${esc(t('sourceHash'))}</summary><code class="hash">${esc(c.sha256)}</code></details></td></tr>`;
  }).join('');
}
function renderSourceFocus(){
  if(!state.registry||!window.SeismicSourceWorkbench)return;
  const W=window.SeismicSourceWorkbench,options={lang:I.language,active:state.catalog?.id,selectedRows:state.filtered.length,selectionLabel:$('mapSelection').textContent,
    verified:id=>state.cache.has(id),extent:id=>state.cache.get(id)?.timeExtent};
  $('sourceAtlasFocus').innerHTML=W.focus(state.registry.catalogs,options);
  const s=state.catalog?.id!=='all-catalogs'?W.identity(state.catalog?.id):null;
  $('sourceTimeFocus').innerHTML=(s?`<span class="catalogue-key" style="--catalogue-color:${s.color}"><i class="source-swatch shape-${s.shape}" aria-hidden="true"></i><b>${s.code} ${esc(s.label)}</b></span> `:'')+esc($('mapSelection').textContent)+' · '+fmt(state.filtered.length)+' '+esc(t('sourceRows'));
}
function sourceMapMount(){return $(state.sourceView==='time'?'sourceTimeMapMount':'sourceAtlasMapMount');}
function setSourceView(view){
  const previousView=state.sourceView;
  state.sourceView=view==='time'?'time':'atlas';
  $('sourceAtlasPanel').hidden=state.sourceView!=='atlas';$('sourceTimePanel').hidden=state.sourceView!=='time';
  $('sourceAtlasView').setAttribute('aria-pressed',String(state.sourceView==='atlas'));
  $('sourceTimeView').setAttribute('aria-pressed',String(state.sourceView==='time'));
  if(state.tab==='sources'){
    const mount=sourceMapMount(),moved=mount && $('mapCard').parentElement!==mount;
    if(moved)mount.append($('mapCard'));
    if(moved||previousView!==state.sourceView)requestAnimationFrame(()=>{state.map?.resize();drawMap();});
  }
}
let analysisCacheRows=null,analysisCache=null,analysisGroupKey='';
let fingerprintRows=null,fingerprintRequest=0;
async function updateMapEvidence(){
  if(!state.ready || !state.formValid)return;
  const scope=state.applied.country ? V.filterEvents(state.events,{...state.applied,country:'',admin1:''},'recent') : state.filtered;
  const outside=scope.filter(e=>e.country_id==='outside').length;
  $('geographyAccounting').textContent=state.applied.country ? t('countryExcluded',{n:fmt(scope.length-state.filtered.length),outside:fmt(outside)}) : t('outsideIncluded',{n:fmt(outside)});
  if(fingerprintRows===state.filtered)return;
  fingerprintRows=state.filtered;const request=++fingerprintRequest;
  $('queryFingerprint').textContent='…';
  const descriptor={schema:'seismic-selection-fingerprint/1',inputs:state.activePacks.map(p=>[p.catalog.id,p.hashes.events,p.hashes.manifest]),geography:state.geographyHash,filters:{...state.applied},ordered_ids:state.filtered.map(e=>e.id)};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(descriptor)));
  if(request!==fingerprintRequest)return;
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  $('queryFingerprint').textContent=hash.slice(0,20)+'…';$('queryFingerprint').title=hash;
}
function summaryForSelection() {
  if (!state.ready || !state.formValid || !window.SeismicAnalytics) return null;
  if(analysisCacheRows!==state.filtered){
    analysisCache=window.SeismicAnalytics.summarize(state.filtered,{catalogs:state.activePacks.map(p=>p.catalog),filters:{...state.applied},createdUTC:new Date().toISOString()});
    analysisCacheRows=state.filtered;
  }
  return analysisCache;
}
function groupName(group){const c=state.registry?.catalogs.find(c=>c.id===group.catalog_id);return c ? catalogLabel(c) : group.catalog_id;}
function groupRows(summary) {
  return summary.groups.map(g=>`<tr><td>${esc(groupName(g))}</td><td>${esc(g.mag_type ?? t('notReported'))}</td><td>${fmt(g.n)}</td><td>${value(g.magnitude.mean,3)}</td><td>${value(g.magnitude.median,3)}</td><td>${value(g.magnitude.min,3)}</td><td>${value(g.magnitude.max,3)}</td><td>${value(g.magnitude.sample_sd,3)}</td><td>${value(g.depth_km.mean,2)} (${fmt(g.depth_km.n)})</td></tr>`).join('');
}
function correlationRows(summary) {
  return summary.groups.map(g=>`<tr><td>${esc(groupName(g))}</td><td>${esc(g.mag_type ?? t('notReported'))}</td><td>${fmt(g.magnitude_depth.n)}</td><td>${value(g.magnitude_depth.pearson_r,4)}</td><td>${esc(t(g.magnitude_depth.pearson_r===null ? 'correlationUnavailable' : 'correlationDescriptive'))}</td></tr>`).join('');
}
const groupKey = group => JSON.stringify([group.catalog_id,group.mag_type]);
function selectedAnalysisGroup(summary) {
  if(!summary?.groups.length){analysisGroupKey='';return null;}
  const chosen=summary.groups.find(group=>groupKey(group)===analysisGroupKey)
    || summary.groups.reduce((largest,group)=>group.n>largest.n ? group : largest);
  analysisGroupKey=groupKey(chosen);return chosen;
}
function groupDescription(group) {
  return groupName(group)+' · '+(group.mag_type ?? t('unknownType'))+' · n = '+fmt(group.n);
}
function chartOptions(kind) {
  return {format:(n,dec=1)=>value(n,dec),colors:{ink:color('--ink','#183c39'),muted:color('--muted','#566b61'),
    grid:color('--line','#d4dfd6'),accent:color('--green','#126a5b'),secondary:color('--point-deep','#bc5b1e'),paper:color('--paper','#fff')},
    labels:{title:t(kind),x:t(kind==='annualAnalysis' ? 'utcYear' : 'reportedM'),
      y:t(kind==='scatterPlot' ? 'depthKm' : 'sourceRows'),empty:t('noChartRecords'),density:t('densityCells'),records:t('sourceRows')}};
}
function renderExplorerInsights() {
  if(!$('miniGroupLabel'))return;
  const summary=summaryForSelection(), group=selectedAnalysisGroup(summary);
  $('miniGroupLabel').textContent=group ? groupDescription(group) : t('analysisUnavailable');
  if($('miniScope'))$('miniScope').textContent=group ? t(group.mag_type==null ? 'miniUnknownScope' : 'miniKnownScope',{n:fmt(group.depth_km.n)}) : '';
  for(const [id,n] of [['miniMean',group?.magnitude.mean],['miniMedian',group?.magnitude.median],['miniDepth',group?.depth_km.mean]])
    $(id).textContent=Number.isFinite(n) ? value(n,2)+(id==='miniDepth' ? ' km' : '') : '—';
  if($('homeSelectionSummary'))$('homeSelectionSummary').textContent=summary ? $('mapSelection').textContent+' · '+fmt(summary.record_count)+' '+t('sourceRows') : t('analysisUnavailable');
  if($('homeAnnualChart') && window.SeismicResearchCharts)
    $('homeAnnualChart').innerHTML=window.SeismicResearchCharts.svgAnnual(summary?.annual_counts || [],chartOptions('annualAnalysis'));
}
function renderResearchCharts(summary) {
  const group=selectedAnalysisGroup(summary), selector=$('analysisGroupSelect');
  if(!selector)return;
  selector.replaceChildren();
  for(const entry of summary?.groups || []){
    const option=document.createElement('option');option.value=groupKey(entry);option.textContent=groupDescription(entry);selector.append(option);
  }
  selector.value=analysisGroupKey;selector.disabled=!group;
  $('analysisGroupContext').textContent=group ? groupDescription(group) : t('noRecords');
  $('analysisGroupNote').textContent=t(group?.mag_type==null ? 'unknownGroupWarning' : 'visualGroupScope');
  const set=(id,n,dec=3)=>{$(id).textContent=Number.isFinite(n) ? value(n,dec) : '—';};
  set('statMeanValue',group?.magnitude.mean);set('statMedianValue',group?.magnitude.median);set('statSdValue',group?.magnitude.sample_sd);
  $('statRangeValue').textContent=group?.magnitude.n ? value(group.magnitude.min,3)+' – '+value(group.magnitude.max,3) : '—';
  $('statDepthValue').textContent=group?.depth_km.n ? value(group.depth_km.mean,2)+' km · n='+fmt(group.depth_km.n) : t('notReported');
  $('statPairsValue').textContent=Number.isFinite(group?.magnitude_depth.pearson_r) ? value(group.magnitude_depth.pearson_r,4)+' · n='+fmt(group.magnitude_depth.n) : t('notCalculable');
  const R=window.SeismicResearchCharts;
  if(!R)return;
  const model=R.distribution(group ? state.filtered : [],{catalogId:group?.catalog_id || '__empty__',magType:group?.mag_type,catalogs:state.activePacks.map(p=>p.catalog)});
  $('magnitudeChart').innerHTML=R.svgHistogram(model,chartOptions('magnitudeDistribution'));
  $('scatterChart').innerHTML=R.svgScatter(model,chartOptions('scatterPlot'));
  $('analysisHistogram').innerHTML=R.svgAnnual(summary?.annual_counts || [],chartOptions('annualAnalysis'));
  if($('scatterCoverage'))$('scatterCoverage').textContent=t('scatterCoverage',{n:fmt(model.depth_pair_count),missing:fmt(model.missing_depth_pair_count)})
    +' '+(model.scatter_mode==='density' ? t('densityExplanation') : t('allPairsShown'));
}
function renderAnalysis() {
  $('inlineReportFrame').srcdoc='';$('printInlineReport').disabled=true;
  const summary=summaryForSelection();
  if(!summary){
    $('analysisSelection').textContent=t('analysisUnavailable');
    for(const id of ['analysisCount','analysisCatalogCount','analysisGroupCount','analysisYears'])$(id).textContent='—';
    for(const id of ['analysisGroupRows','analysisCorrelationRows','analysisAnnualRows','analysisHistogram'])$(id).innerHTML='';
    renderResearchCharts(null);
    return;
  }
  $('analysisCount').textContent=fmt(summary.record_count);
  $('analysisCatalogCount').textContent=fmt(state.activePacks.length);
  $('analysisGroupCount').textContent=fmt(summary.groups.length);
  $('analysisYears').textContent=state.applied.yearFrom+'–'+state.applied.yearTo;
  $('analysisSelection').textContent=$('mapSelection').textContent;
  $('analysisGroupRows').innerHTML=groupRows(summary) || `<tr><td colspan="9">${esc(t('noRecords'))}</td></tr>`;
  $('analysisCorrelationRows').innerHTML=correlationRows(summary) || `<tr><td colspan="5">${esc(t('noRecords'))}</td></tr>`;
  $('analysisAnnualRows').innerHTML=summary.annual_counts.map(x=>`<tr><td>${x.year}</td><td>${fmt(x.record_count)}</td></tr>`).join('');
  renderResearchCharts(summary);
}
function analysisDocument() {
  const summary=summaryForSelection();if(!summary)return null;
  const view=currentView();
  const query=V.queryDocument({view,catalog:state.catalog,manifest:state.manifest,assetHashes:state.hashes,fields:state.fields,
    rows:state.filtered,pageURL:viewURL(view),createdUTC:new Date().toISOString(),inputs:state.activePacks,geography:geographyEvidence()});
  return {schema:'seismic-analysis-report/1',created_utc:new Date().toISOString(),count_unit:'source_records',summary,
    display_group:selectedAnalysisGroup(summary) ? {catalog_id:selectedAnalysisGroup(summary).catalog_id,mag_type:selectedAnalysisGroup(summary).mag_type} : null,
    query,cartography:currentCartography(),evidence_note:t('analysisLimit'),normalization:{schema_mapping:'source-specific adapters; original fields retained',magnitude:'reported scales and literal types; no conversions',missing:'source missing strings preserved; absent common fields null',depth:'common km only where documented; Canadian raw depth remains unknown unit',identity:'qualified catalogue row keys; exact ComCat ID overlap flags; no cross-provider event reconciliation'}};
}
function exportedAnalysisStatus(){ $('analysisExportStatus').textContent=t('analysisSaved'); }
function exportAnalysisCsv(){
  const summary=summaryForSelection();if(!summary)return;
  const A=window.SeismicAnalytics, rows=A.csvRows(summary), columns=A.csvFields;
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const text=[columns.join(','),...rows.map(row=>columns.map(k=>quote(row[k])).join(','))].join('\r\n');
  download(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}),state.catalog.id+'_descriptive_summary.csv');exportedAnalysisStatus();
}
function exportAnalysisJson(){
  const report=analysisDocument();if(!report)return;
  download(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json;charset=utf-8'}),state.catalog.id+'_descriptive_analysis.json');exportedAnalysisStatus();
}
function reportVisuals(report) {
  const R=window.SeismicResearchCharts;if(!R)return '';
  const group=report.summary.groups.find(g=>g.catalog_id===report.display_group?.catalog_id && g.mag_type===report.display_group?.mag_type);
  const model=R.distribution(group ? state.filtered : [],{catalogId:group?.catalog_id || '__empty__',magType:group?.mag_type,catalogs:state.activePacks.map(p=>p.catalog)});
  const opts=kind=>({...chartOptions(kind),colors:{ink:'#183c39',muted:'#566b61',grid:'#d4dfd6',accent:'#126a5b',secondary:'#bc5b1e',paper:'#ffffff'}});
  const figure=(title,content)=>'<figure><figcaption>'+esc(t(title))+'</figcaption><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" role="img" aria-label="'+esc(t(title))+'">'+content+'</svg></figure>';
  return '<style>.report-visuals{margin:28px 0;padding:24px;background:#f2f5f1;border:1px solid #d4dfd6;border-radius:12px}.report-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.report-visuals figure{margin:0;padding:14px;background:white;border:1px solid #d4dfd6;border-radius:8px;break-inside:avoid}.report-visuals figcaption{font-size:14px;font-weight:700}.report-visuals svg{width:100%;height:auto}.report-annual{margin-top:18px}@media(max-width:700px){.report-chart-grid{grid-template-columns:1fr}}@media print{.report-visuals{padding:10px}.report-chart-grid{display:block}.report-visuals figure{margin:10px 0}}</style><section class="report-visuals"><h2>'+esc(t('visualResults'))+'</h2><p>'+esc(group ? groupDescription(group) : t('noRecords'))+'</p><p>'+esc(t(group?.mag_type==null ? 'unknownGroupWarning' : 'visualGroupScope'))+'</p><div class="report-chart-grid">'+figure('magnitudeDistribution',R.svgHistogram(model,opts('magnitudeDistribution')))+figure('scatterPlot',R.svgScatter(model,opts('scatterPlot')))+'</div><div class="report-annual">'+figure('annualAnalysis',R.svgAnnual(report.summary.annual_counts,opts('annualAnalysis')))+'</div><p>'+esc(t('annualAnalysisNote'))+'</p></section>';
}
function analysisReportHtml(report=analysisDocument()){
  if(!report)return null;
  const summary=report.summary, heading=key=>esc(t(key));
  const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+heading(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
  const group=summary.groups.find(g=>g.catalog_id===report.display_group?.catalog_id && g.mag_type===report.display_group?.mag_type);
  const summaryCards=group ? '<section class="report-metrics">'+[['sourceRows',fmt(group.n)],['statMean',value(group.magnitude.mean,3)],['statMedian',value(group.magnitude.median,3)],['statDepthMean',group.depth_km.n?value(group.depth_km.mean,2)+' km':'—']].map(([key,v])=>'<div><small>'+heading(key)+'</small><b>'+esc(v)+'</b></div>').join('')+'</section>' : '';
  const inputs=state.activePacks.map(p=>`<tr><td>${esc(catalogLabel(p.catalog))}</td><td>${esc(p.hashes.events)}</td><td>${esc(p.hashes.manifest)}</td></tr>`).join('');
  const html='<!doctype html><html lang="'+I.language+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+heading('analysisHeading')+'</title><style>body{font:15px/1.55 system-ui,sans-serif;color:#182d3b;max-width:1100px;margin:36px auto;padding:0 20px}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;margin:20px 0;font-size:12px}th,td{border:1px solid #ccd6d9;padding:9px;text-align:left;overflow-wrap:anywhere}th{background:#eef3f4}pre,code{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}button{padding:9px 15px}@media print{button{display:none}body{max-width:none;margin:0}thead{display:table-header-group}tr{break-inside:avoid}}</style><h1>'+heading('analysisHeading')+'</h1><p>'+esc($('analysisSelection').textContent)+'</p><p>'+esc(report.created_utc)+'</p><p>'+heading('analysisScope')+'</p><h2>'+heading('magnitudeStatistics')+'</h2>'+table(['dataCatalog','magType','sourceRows','statMean','statMedian','statMin','statMax','statSD','statDepthMean'],groupRows(summary))+'<h2>'+heading('correlationHeading')+'</h2><p>'+heading('correlationNote')+'</p>'+table(['dataCatalog','magType','pairedRecords','pearsonCoefficient','interpretation'],correlationRows(summary))+'<h2>'+heading('annualAnalysis')+'</h2><p>'+heading('annualAnalysisNote')+'</p>'+table(['utcYear','sourceRows'],summary.annual_counts.map(x=>'<tr><td>'+x.year+'</td><td>'+x.record_count+'</td></tr>').join(''))+'<h2>'+heading('filtersAndEvidence')+'</h2><pre>'+esc(JSON.stringify(state.applied,null,2))+'</pre>'+table(['dataCatalog','sourceHash','recordManifest'],inputs)+'<p>'+heading('analysisLimit')+'</p><details><summary>'+heading('analysisJson')+'</summary><pre>'+esc(JSON.stringify(report,null,2))+'</pre></details></html>';
  return html.replace('<h2>',summaryCards+reportVisuals(report)+'<h2>').replace('</style>', 'body{font-family:Arial,Helvetica,sans-serif;margin:22px auto}h1{font-size:24px;margin:8px 0}body>p{font-size:12px;margin:6px 0}.report-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.report-metrics>div{padding:13px;border-top:3px solid #126a5b;background:#eef4f3}.report-metrics small{display:block;font-size:10px}.report-metrics b{display:block;font-size:24px;margin-top:5px}.report-visuals{margin:18px 0;padding:16px}.report-visuals h2{margin:0 0 10px}.report-visuals p{font-size:11px;margin:6px 0}.report-visuals figure{padding:10px}.report-visuals figcaption{font-size:12px}table{border-top:2px solid #183342;border-bottom:2px solid #183342}th,td{border:0;padding:10px}th{background:white;border-bottom:1px solid #183342}td{font-variant-numeric:tabular-nums}td:not(:first-child){text-align:right}thead{display:table-header-group}@media(max-width:700px){.report-visuals svg text{font-size:22px}.report-visuals .chart-density-note{display:none}}</style>');
}
function exportAnalysisReport(){
  const html=analysisReportHtml();if(html===null)return;
  download(new Blob([html],{type:'text/html;charset=utf-8'}),state.catalog.id+'_descriptive_report.html');exportedAnalysisStatus();
}
function previewAnalysisReport(){
  const html=analysisReportHtml();if(html===null)return;
  $('reportPreviewFrame').srcdoc=html;$('reportPreview').showModal();
}
async function exportFullPackage(){
  const report=analysisDocument();if(!report)return;
  const prefix=state.catalog.id, entries=[],Z=window.SeismicExportPackage;
  $('exportPackage').disabled=true;$('packageStatus').textContent=t('buildingPackage');
  try{
    const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    if($('includeCsv').checked){
      entries.push({name:'records.csv',data:'\uFEFF'+[state.fields.join(','),...state.filtered.map(row=>state.fields.map(k=>quote(row[k])).join(','))].join('\r\n')});
      const columns=window.SeismicAnalytics.csvFields;
      entries.push({name:'statistics.csv',data:'\uFEFF'+[columns.join(','),...window.SeismicAnalytics.csvRows(report.summary).map(row=>columns.map(k=>quote(row[k])).join(','))].join('\r\n')});
    }
    if($('includeJson').checked){entries.push({name:'query.json',data:JSON.stringify(report.query,null,2)+'\n'},{name:'analysis.json',data:JSON.stringify(report,null,2)+'\n'});}
    if($('includeHtml').checked)entries.push({name:'report.html',data:analysisReportHtml(report)});
    if(!entries.length){$('packageStatus').textContent=t('choosePackageFormat');return;}
    const manifest={schema:'seismic-export-package/1',created_utc:report.created_utc,count_unit:'source_records',record_count:report.summary.record_count,query:report.query,display_group:report.display_group,zip_method:'stored (no compression)',files:[]};
    for(const entry of entries){
      entry.data=new TextEncoder().encode(entry.data);
      const hash=await crypto.subtle.digest('SHA-256',entry.data);
      manifest.files.push({name:entry.name,bytes:entry.data.length,sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')});
    }
    entries.push({name:'manifest.json',data:JSON.stringify(manifest,null,2)+'\n'});
    download(Z.zipStored(entries),prefix+'_analysis_package.zip');$('packageStatus').textContent=t('packageSaved',{n:fmt(report.summary.record_count)});
  }catch(error){$('packageStatus').textContent=t('packageFailed')+' '+error.message;}
  finally{$('exportPackage').disabled=!state.ready||!state.formValid;}
}
for(const [id,tab] of [['welcomeExplore','catalog'],['welcomeSources','sources'],['stepSources','sources'],['stepExplore','catalog'],['stepAnalyze','analysis'],['stepExport','analysis'],['editAnalysisQuery','catalog']]) $(id).addEventListener('click',()=>{setTab(tab);if(id==='stepExport')$('deliverablesCard').scrollIntoView?.({block:'center'});});
async function activateSourceCatalogue(id,tab='sources'){
  const definition=id==='all-catalogs'?combinedDefinition():state.registry?.catalogs.find(c=>c.id===id);
  const defaults=definition?V.catalogDefaults(definition):null;
  const alreadyFull=state.ready&&state.formValid&&state.catalog?.id===id&&$('sort').value==='recent'&&defaults&&Object.keys(defaults).every(key=>state.applied[key]===defaults[key]);
  if(!alreadyFull)await loadCatalog(id,false);
  if(!state.ready||state.catalog?.id!==id)return false;
  state.map?.setColorMode?.('catalogue');state.map?.setDisplayMode?.('points');
  setTab(tab);state.map?.fitRecords();updateDisplayEvidence();syncURL();return true;
}
$('sourceInventoryRows').addEventListener('click',async event=>{const button=event.target.closest('[data-source-catalog]');if(button)await activateSourceCatalogue(button.dataset.sourceCatalog);});
if($('sourceCards'))$('sourceCards').addEventListener('click',async event=>{
  const button=event.target.closest('[data-source-catalog]');
  if(button){await activateSourceCatalogue(button.dataset.sourceCatalog);return;}
  // Clicking noninteractive card content is a convenience; the heading and
  // action button remain explicit keyboard-accessible selection controls.
  if(event.target.closest('a,button,details,summary,input,select'))return;
  const card=event.target.closest('[data-source-card]');if(card)await activateSourceCatalogue(card.dataset.sourceCard);
});
if($('exploreAnalysis'))$('exploreAnalysis').addEventListener('click',()=>setTab('analysis'));
if($('toggleFiltersMobile'))$('toggleFiltersMobile').addEventListener('click',()=>{
  state.filtersOpen=!state.filtersOpen;document.body.classList.toggle('filters-open',state.filtersOpen);
  $('toggleFiltersMobile').setAttribute('aria-expanded',String(state.filtersOpen));
});
if($('analysisGroupSelect'))$('analysisGroupSelect').addEventListener('change',()=>{analysisGroupKey=$('analysisGroupSelect').value;renderAnalysis();renderExplorerInsights();});
if($('homeCases'))$('homeCases').addEventListener('click',async event=>{
  const button=event.target.closest('[data-case]');if(!button || !state.registry)return;
  const cases={ssn:['ssn-mx-historical',{yearFrom:2026,yearTo:2026,magMin:4.5,country:''}],
    usa:['usgs-na-2020-2025',{yearFrom:2020,yearTo:2025,magMin:3.5,country:'USA'}],
    canada:['nrcan-ca-historical',{yearFrom:1985,yearTo:2019,magMin:3.5,country:'CAN'}],
    combined:['all-catalogs',{yearFrom:2010,yearTo:2025,magMin:4.5,country:''}]};
  const scenario=cases[button.dataset.case];if(!scenario)return;
  await loadCatalog(scenario[0],false,scenario[1]);if(state.ready)setTab('catalog');
});
$('analysisRecordCsv').addEventListener('click',exportCsv);$('analysisQueryJson').addEventListener('click',exportQuery);
$('analysisCsv').addEventListener('click',exportAnalysisCsv);$('analysisJson').addEventListener('click',exportAnalysisJson);$('analysisReport').addEventListener('click',exportAnalysisReport);
$('previewAnalysisReport').addEventListener('click',previewAnalysisReport);
$('closeReportPreview').addEventListener('click',()=>$('reportPreview').close());
$('exportPackage').addEventListener('click',exportFullPackage);
$('refreshInlineReport').addEventListener('click',()=>{const html=analysisReportHtml();if(html!==null){$('inlineReportFrame').srcdoc=html;$('printInlineReport').disabled=false;}});
$('printInlineReport').addEventListener('click',()=>{$('inlineReportFrame').contentWindow?.print();});

function drawMap() {if (['catalog','home','quick','sources'].includes(state.tab) && state.map && state.mapDrawnRows!==state.filtered){state.map.setRecords(state.filtered);state.mapDrawnRows=state.filtered;}}
function currentCartography(){
  if(state.tab==='quick' && state.quickAction!=='map')return null;
  const evidence=state.map?.getDisplayEvidence?.();
  return state.mapDrawnRows===state.filtered && evidence?.selected_rows===state.filtered.length ? evidence : null;
}
function drawHistogram() {
  const counts = new Map();for (const e of state.filtered) counts.set(e.year, (counts.get(e.year) || 0) + 1);
  const a = state.applied.yearFrom, b = state.applied.yearTo, n = Math.max(1, b - a + 1), max = Math.max(1, ...counts.values()), bw = 250 / n;
  const grid=esc(color('--chart-grid','#ccd9d5')), axis=esc(color('--chart-axis','#546a76')), bar=esc(color('--chart-bar','#438d7c'));
  let svg = `<title>${esc(t('annualAnalysis'))}</title><line x1="40" y1="125" x2="295" y2="125" stroke="${grid}"/><text x="2" y="17" font-size="10" fill="${axis}">${fmt(max)}</text><text x="24" y="128" font-size="10" fill="${axis}">0</text>`;
  for (let year = a; year <= b; year++) {const count = counts.get(year) || 0, height = count / max * 105;svg += `<rect x="${40 + (year - a) * bw}" y="${125 - height}" width="${Math.max(.5, bw * .78)}" height="${height}" rx="1" fill="${bar}"><title>${year}: ${esc(t('recordsN', {n: fmt(count)}))}</title></rect>`;}
  const ticks = new Set([a,b]);if(n>3)ticks.add(a+Math.floor((n-1)/2));
  for (const year of ticks) svg += `<text x="${40 + (year - a + .4) * bw}" y="148" text-anchor="${year===b && n>1 ? 'end' : 'middle'}" font-size="11" fill="${axis}">${year}</text>`;
  $('histogram').setAttribute('viewBox','0 0 300 160');
  $('histogram').innerHTML = svg;
}
function detail(id, persist = true) {
  const e = state.events.find(e => e.id === id);if (!e) return;
  const pack=packFor(e), sourceCatalog=pack?.catalog || state.catalog, sourceManifest=pack?.manifest || state.manifest;
  const sourceId=e.source_event_id || e.id;
  const sourceDerived=sourceCatalog.identifier_kind==='derived_row_key' || sourceManifest.identifier_kind==='derived_row_key';
  const sourceDepth=eventDepthKnown(e);
  const spec = sourceManifest.files.find(f => f.path === e.file);state.selectedEvent = id;$('detailTitle').textContent = e.place;
  state.highlightedEvent=id;state.map?.highlight?.(id);renderTable();
  const nativeSsn = sourceCatalog.provider === 'ssn';
  const fields = [[sourceDerived ? 'localRecordKey' : 'eventId',sourceId],...(state.catalog.id==='all-catalogs' ? [['internalRecordKey',e.id]] : []),['countryLocation',regionLabel(e.country_id)],['dataProvider',sourceCatalog.provider_name],['dataCatalog',catalogLabel(sourceCatalog)],['originTime',date(e.time)],['reportedMagnitude',value(e.mag,2) + ' ' + (e.magType || t('unknownType'))],['eventType',e.event_type || (sourceCatalog.provider === 'usgs' ? 'earthquake' : t('notReported'))],['latLon',value(e.latitude,4) + ' / ' + value(e.longitude,4)],[sourceDepth ? 'depthKm' : 'reportedDepth',sourceDepth ? value(e.depth,3) : e.raw_depth],['network',e.net],['originAuthor',e.locationSource],['magAuthor',e.magSource],['horizontalError',value(e.horizontalError)],['depthError',value(e.depthError)],['magnitudeError',value(e.magError)],[nativeSsn ? 'sourceStatus' : 'reviewStatus',e.status],['summaryUpdated',date(e.updated)],...(e.source_record !== undefined ? [['sourceRow',e.source_record]] : []),['sourceFile',e.file],['rawHash',spec?.sha256 || t('notReported')]];
  const eventURL = safeURL(e.event_url || (sourceCatalog.provider === 'usgs' ? 'https://earthquake.usgs.gov/earthquakes/eventpage/' + encodeURIComponent(sourceId) : ''));
  const rawURL = safeURL(spec?.url), sourceURL = nativeSsn ? safeURL(sourceCatalog.provider_url || sourceManifest.official_catalogue?.url) : '';
  const doi = sourceManifest.official_catalogue?.doi || '', doiURL = nativeSsn ? safeURL(/^10\.\d{4,9}\/\S+$/.test(doi) ? 'https://doi.org/'+doi : /^https?:\/\//.test(doi) ? doi : '') : '';
  const publicCopy = nativeSsn && /^research-data\/catalogs\/ssn-mx\/[A-Za-z0-9_.-]+\.csv$/.test(spec?.public_copy_path || '') ? spec.public_copy_path : '';
  const publicRawURL = publicCopy ? 'https://github.com/gabrielhuav/Seismic_Data_Geosciences/blob/main/'+publicCopy.split('/').map(encodeURIComponent).join('/') : '';
  const rawDirect = rawURL && spec?.url_kind !== 'catalogue_landing';
  const links = [eventURL ? `<a target="_blank" rel="noopener" href="${esc(eventURL)}">${esc(t(sourceDerived ? 'sourcePage' : 'currentEvent'))}</a>` : '', sourceURL ? `<a target="_blank" rel="noopener" href="${esc(sourceURL)}">${esc(t('ssnCatalogue'))}</a>` : '', doiURL ? `<a target="_blank" rel="noopener" href="${esc(doiURL)}">${esc(t('sourceDoi'))}</a>` : '', publicRawURL ? `<a target="_blank" rel="noopener" href="${esc(publicRawURL)}">${esc(t('preservedCsv'))}</a>` : '', rawDirect ? `<a target="_blank" rel="noopener" href="${esc(rawURL)}">${esc(t('rawCsv'))}</a>` : '', `<a href="${esc(safeURL(sourceCatalog.manifest_url))}" download>${esc(t('recordManifest'))}</a>`].filter(Boolean).join(' · ');
  const rawNames = {raw_utc_date:'rawUtcDate',raw_utc_time:'rawUtcTime',raw_local_date:'rawLocalDate',raw_local_time:'rawLocalTime',raw_magnitude:'rawMagnitude',raw_depth:'rawDepth',raw_status:'rawStatus'};
  const rawFields = nativeSsn ? Object.entries(e).filter(([key])=>key.startsWith('raw_')) : [];
  const rawDetails = rawFields.length ? `<details><summary>${esc(t('sourceRawFields'))}</summary><dl>${rawFields.map(([key,v])=>`<dt>${esc(rawNames[key] ? t(rawNames[key]) : key)} <small>(${esc(key)})</small></dt><dd>${esc(v ?? t('notReported'))}</dd>`).join('')}</dl></details>` : '';
  const included=state.filtered.some(row=>row.id===id);
  const feature=`<section class="record-feature"><p class="record-topline">${esc(sourceCatalog.provider_name)} · ${esc(catalogLabel(sourceCatalog))}</p><p class="record-time">${esc(date(e.time))}</p><div class="record-metrics"><div><span>${esc(t('reportedMagnitude'))}</span><strong>${value(e.mag,2)} <small>${esc(e.magType || '?')}</small></strong></div><div><span>${esc(t('depthKm'))}</span><strong>${sourceDepth ? value(e.depth,3)+' km' : '—'}</strong></div><div><span>${esc(t('latLon'))}</span><strong>${value(e.latitude,4)}<br>${value(e.longitude,4)}</strong></div></div><p class="record-key">${esc(sourceId)}</p>${!sourceDepth ? `<p class="small">${esc(t('depthUnitUnknown'))}</p>` : ''}</section>`;
  $('detailContent').innerHTML = feature + `<p class="detail-actions"><button data-locate-event="${esc(id)}" ${included ? '' : 'disabled'}>${esc(t('seeOnMap'))}</button>${links}</p>` + (!included ? `<p class="small">${esc(t('outsideFilters'))}</p>` : '') + '<details class="record-metadata"><summary>'+esc(t('recordEvidence'))+'</summary><dl>' + fields.map(([k,v]) => `<dt>${esc(t(k))}</dt><dd class="${k === 'rawHash' ? 'hash' : ''}">${esc(v || t('notReported'))}</dd>`).join('') + '</dl>' + rawDetails + '</details>' + `<p class="small">${esc(t(sourceDerived ? 'derivedKeyNote' : 'detailNote'))}</p>` + (nativeSsn ? `<p class="small">${esc(t('ssnStatusNote'))}</p>` : '');
  if (!$('detail').open) $('detail').showModal();if (persist) syncURL();
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = name;
  document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv() {
  if (!state.ready || !state.formValid) return;
  const columns = state.fields;
  const csv = [columns.join(','), ...state.filtered.map(e => columns.map(k => '"' + String(e[k] ?? '').replace(/"/g, '""') + '"').join(','))].join('\r\n');
  download(new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'}), state.catalog.id + '_filtered_snapshot.csv');
}
function exportQuery() {
  if (!state.ready || !state.formValid) return;
  try {
    const view = currentView(), query = V.queryDocument({view, catalog: state.catalog, manifest: state.manifest, assetHashes: state.hashes, fields:state.fields,
      rows: state.filtered, pageURL: viewURL(view), createdUTC: new Date().toISOString(),inputs:state.activePacks,geography:geographyEvidence()});
    query.cartography=currentCartography();
    download(new Blob([JSON.stringify(query, null, 2) + '\n'], {type:'application/json;charset=utf-8'}), state.catalog.id + '_local_query.json');actionStatus('querySaved');
  } catch (error) {actionStatus('queryFailed');}
}
async function shareView() {
  if (!state.ready || !state.formValid) return;
  const url=viewURL();history.replaceState(null, '', url);
  $('viewLink').value = url;$('viewLink').hidden = false;
  try {if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');await navigator.clipboard.writeText(url);actionStatus('copied');}
  catch (error) {actionStatus('copyFallback');$('viewLink').focus();$('viewLink').select();}
}
function showRevisions() {
  const r = state.revisions;
  if (!r || r.available === false) {$('revisionScope').textContent = t('noRevisions');return;}
  populate('revisionEvent', (r.events || []).map(e => e.id));
  if (r.events?.length) {$('revisionEvent').value = r.events.some(e=>e.id==='us2000ahv0') ? 'us2000ahv0' : r.events[0].id;renderRevision();}
}
function renderRevision() {
  if (!state.revisions || state.revisions.available === false) {$('revisionScope').textContent = t('noRevisions');return;}
  $('revisionScope').textContent = t('revisionScope');
  const e = state.revisions.events.find(e => e.id === $('revisionEvent').value);if (!e) return;
  const rows = e.versions || [];
  $('revisionEvidence').textContent = t('archivedHash') + ': ' + (e.raw_sha256 || t('notReported')) + ' · ' + t('retrieved') + ' ' + (e.retrieved_utc || t('unknown')) + ' · ' + t('liveQuery') + ': ' + (e.query_url || t('notReported'));
  $('revisionSummary').innerHTML = `<div><strong>${fmt(rows.length)}</strong><span>${esc(t('retainedVersions'))}</span></div><div><strong>${esc(e.id)}</strong><span>${esc(t('canonicalId'))}</span></div>`;
  $('revisionRows').innerHTML = rows.map(v => `<tr><td>${esc(date(v.update_time_utc || v.updateTime_utc))}</td><td>${value(v.magnitude)} ${esc(v.magnitude_type || '')}</td><td>${value(v.depth_km,3)}</td><td>${esc(v.origin_source || t('unknown'))}</td><td>${esc(v.magnitude_source || t('unknown'))}</td><td>${esc(v.status || t('unknown'))}</td></tr>`).join('');
  $('revisionNote').textContent = t('revisionNote');
  renderDiagnostics();ensureRevisionStory();
}
function diagnosticPalette(){return {ink:color('--ink','#183342'),muted:color('--muted','#506573'),grid:color('--line','#d5dfe4'),paper:color('--paper','#fff'),first:color('--diagnostic-first','#215b91'),second:color('--diagnostic-second','#aa551b')};}
function diagnosticLabels(){return {depthTitle:t('depthPairTitle'),displacementTitle:t('displacementTitle'),earliestDepth:t('earliestDepth'),latestDepth:t('latestDepth'),displacement:t('displacementKm'),cohort:t('currentCohort'),median:t('statMedian'),magnitudeTitle:t('magnitudePairTitle'),earliestM:t('earliestMagnitude'),latestM:t('latestMagnitude'),threshold:t('threshold'),updateTime:t('updateTimestamp'),reportedM:t('reportedM'),depth:t('depthKm'),year:t('utcYear'),coverageTitle:t('coverageCountTitle'),maximumTitle:t('coverageMaximumTitle'),logRows:t('logAnnualRows'),maximum:t('annualMaximum'),gap:t('rawGap')};}
function renderDiagnostics(){
  const D=window.SeismicDiagnostics;if(!D || !state.revisions?.events)return;
  const metrics=D.endpoints(state.revisions),labels=diagnosticLabels(),colors=diagnosticPalette(),depth=D.depthPlots(metrics,labels,colors);
  $('diagnosticScope').textContent=t('diagnosticCount',{n:fmt(metrics.length),versions:fmt(metrics.reduce((n,e)=>n+e.n,0))});
  $('diagnosticDepth').innerHTML=depth.depth;$('diagnosticDisplacement').innerHTML=depth.displacement;
  $('diagnosticMagnitude').innerHTML=D.magnitudePlot(metrics,labels,colors);
  const event=state.revisions.events.find(e=>e.id===$('revisionEvent').value);if(!event)return;
  const series=D.primary(event),types=[...new Set(series.map(v=>v.magnitude_type))],lineage=D.lineagePlots(event,labels,colors);
  $('lineageSelectedLabel').textContent=event.id;
  $('lineageTypeNote').textContent=types.length!==1||!types[0] ? t('lineageMixedTypes') : t('lineageKnownType',{type:types[0],n:fmt(series.length)});
  $('lineageMagnitude').innerHTML=lineage.magnitude;$('lineageDepth').innerHTML=lineage.depth;
}
function renderCoverage(){
  const D=window.SeismicDiagnostics;if(!D || !state.coverage)return;
  const from=Number($('coverageFrom').value),to=Number($('coverageTo').value);
  if(!$('coverageFrom').value || !$('coverageTo').value || !Number.isInteger(from)||!Number.isInteger(to)||from<1900||to>2026||from>to){
    $('coverageError').textContent=t('invalidCoverageYears');$('coverageCounts').innerHTML='';$('coverageMaximum').innerHTML='';$('coverageStats').textContent='—';return;
  }
  $('coverageError').textContent='';const rows=state.coverage.annual_bins.filter(row=>row.year>=from&&row.year<=to);
  $('coverageStats').textContent=t('coverageSummary',{from,to,n:fmt(rows.reduce((n,row)=>n+row.all,0)),gaps:fmt(rows.filter(row=>!row.all).length)});
  const plots=D.coveragePlots({...state.coverage,annual_bins:rows},diagnosticLabels(),diagnosticPalette());
  $('coverageCounts').innerHTML=plots.counts;$('coverageMaximum').innerHTML=plots.maximum;
  $('coverageEvidence').textContent=state.coverage.source.path+' · SHA-256 '+state.coverage.source.sha256+' · JSON SHA-256 '+state.coverageHash;
}
for(const id of ['coverageFrom','coverageTo'])$(id).addEventListener('input',renderCoverage);
function exportDiagnosticSvg(event){
  const button=event.target.closest('[data-export-svg]');if(!button)return;
  const id=button.dataset.exportSvg;if(!['diagnosticDepth','diagnosticDisplacement','diagnosticMagnitude','lineageMagnitude','lineageDepth','coverageCounts','coverageMaximum'].includes(id))return;
  const svg=$(id);if(!svg.innerHTML)return;
  const evidence={schema:'seismic-diagnostic-svg/1',chart:id,created_utc:new Date().toISOString(),revisions_sha256:state.revisionsHash,ssn_coverage_sha256:state.coverageHash,ssn_source_sha256:state.coverage?.source.sha256,lineage:$('revisionEvent').value,coverage_years:[$('coverageFrom').value,$('coverageTo').value],scope:'Independent retained-version pilot or full-download SSN summary, not the map query.'};
  const text='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="'+360+'" viewBox="'+esc(svg.getAttribute('viewBox'))+'"><metadata>'+esc(JSON.stringify(evidence))+'</metadata>'+svg.innerHTML+'</svg>';
  download(new Blob([text],{type:'image/svg+xml;charset=utf-8'}),id+'.svg');
}
$('diagnosticWorkspace').addEventListener('click',exportDiagnosticSvg);$('coverageWorkspace').addEventListener('click',exportDiagnosticSvg);
function describeDataset() {
  if (!state.catalog) return;
  const c = state.catalog, b = c.bounds.flat().map(n => value(n,2));
  $('catalogCoverage').textContent = t('catalogCoverage', {label: catalogLabel(c), from: c.years[0], to: c.years[1], min: value(c.minimum_magnitude,1), south: b[0], west: b[1], north: b[2], east: b[3]});
  if (!state.ready) return;
  $('loadStatus').textContent = t('loaded', {n: fmt(state.events.length), commit: snapshot().slice(0,12)});
  $('datasetDescription').textContent = t(c.id==='all-catalogs' ? 'combinedDataset' : 'datasetText', {n: fmt(state.events.length), files: fmt(state.activePacks.reduce((n,p)=>n+p.manifest.files.length,0)), latest: state.latest}) + ' ' + $('catalogCoverage').textContent;
  describeSsn(c);
  $('manifestLink').href = c.id==='all-catalogs' ? 'data/catalogs.json' : c.manifest_url;
  $('depthMax').disabled = !depthKnown();$('depthNotice').hidden = depthKnown();$('depthLegend').hidden = !depthKnown() || state.map?.getColorMode?.()==='catalogue';
  $('depthHeader').textContent = t(c.id==='all-catalogs' ? 'mixedDepth' : depthKnown() ? 'depthKm' : 'reportedDepthShort');
  $('placeHeader').textContent = t(derivedKey() ? 'placeLocalKey' : 'placeId');
}
function changeLanguage(lang, persist = true) {
  I.apply(lang);updateDisplayEvidence();revisionStory?.refreshLanguage?.();sqlPanel?.refreshLanguage();comparisonPanel?.refreshLanguage();topPanel?.refreshLanguage();recurrencePanel?.refreshLanguage();quickPanel?.refreshLanguage();helpPanel?.refreshLanguage();if($('tectonicToggle').checked)showTectonics();expandedLabel();populateCatalogControls();localizeFilterOptions();$('baseStatus').textContent = t(state.baseStatus);state.map?.languageChanged();
  if (!state.ready) {describeDataset();$('loadStatus').textContent = state.loadError ? t('loadFailed') + ' ' + state.loadError : loadingText(state.catalog);return;}
  describeDataset();showWarnings();render();renderRevision();renderCoverage();state.map?.languageChanged();
  $('integrityStatus').textContent=t('verifiedMemory',{n:fmt(state.activePacks.length)});
  if (state.selectedEvent && $('detail').open) detail(state.selectedEvent, false);
  $('filterError').textContent = state.formValid ? '' : t('invalidFilters');
  if (state.action) $('actionStatus').textContent = t(state.action);if (persist) syncURL();
}
function restoreFromURL() {
  if (!state.ready) return;state.restoring = true;
  const parsed = V.parseURL(location.href, choices()), view = parsed.view;state.invalidLink = parsed.invalid;
  I.apply(view.lang);populateCatalogControls();populateFilters();populateAdmin1(view.filters);writeFilters(view.filters);$('sort').value = view.sort;
  if (!depthKnown() && Number(view.filters.depthMax) !== 1000) {view.filters.depthMax = 1000;$('depthMax').value = 1000;state.invalidLink.push('depth');}
  if (view.revision) $('revisionEvent').value = view.revision;
  applyFilters(false);renderRevision();describeDataset();showWarnings();actionStatus('');
  state.selectedEvent = '';if ($('detail').open) $('detail').close();
  state.map.setRegion(state.catalog.bounds);if (view.map) state.map.setView(view.map);else state.map.reset();
  state.map.setColorMode?.(new URL(location.href).searchParams.get('pointColor')==='depth'?'depth':'catalogue');
  state.map.setDisplayMode?.(new URL(location.href).searchParams.get('display')==='heat'?'heat':'points');updateDisplayEvidence();
  $('mapBase').value = view.base;state.map.setBase(view.base, false);state.map.languageChanged();
  setTab(view.tab, false);if (view.event) detail(view.event, false);
  const missing = $('magType').querySelector('option[value="__missing__"]');if (missing) missing.textContent = t('notReported');
  state.restoring = false;syncURL();
}
for (const tab of ['home','catalog','sources','analysis','revisions','comparison','sql','methods','quick','top','recurrence','help']) $(tab + 'Tab').addEventListener('click', () => setTab(tab));
for (const id of controls) {
  const numeric=typeof V.defaults[id]==='number';
  $(id).addEventListener(id==='search' || numeric ? 'input' : 'change',()=>{
    if (!state.ready) return;
    clearTimeout(debounce);state.formValid=false;buttons();
    debounce=setTimeout(()=>applyFilters(),id==='search' ? 180 : numeric ? 120 : 0);
  });
}
$('searchForm').addEventListener('submit', event => {event.preventDefault();if (!state.ready) return;clearTimeout(debounce);applyFilters();});
$('reset').addEventListener('click', () => {if (state.ready) {clearTimeout(debounce);writeFilters(V.catalogDefaults(state.catalog));applyFilters();}});
function selectDataSource(source) {
  const preset={country:state.applied.country};
  if(source==='all')return loadCatalog('all-catalogs',false,preset);
  if (source === 'ssn-unam') return loadCatalog(V.legacyCatalog, false, {...preset,unmOnly:true});
  const c = state.catalog?.provider === source ? state.catalog : state.registry.catalogs.find(c => c.provider === source);
  if (c) return loadCatalog(c.id,false,preset);
}
$('providerSelect').addEventListener('change', () => selectDataSource($('providerSelect').value));
$('catalogSelect').addEventListener('change', () => loadCatalog($('catalogSelect').value,false,{country:state.applied.country}));
$('mapBase').addEventListener('change', () => state.map?.setBase($('mapBase').value));
$('retry').addEventListener('click', () => state.registry && state.map ? loadCatalog(state.catalog.id, state.pendingRestore, state.pendingFilters) : initialize());
$('sort').addEventListener('change', () => applyFilters());
$('prev').addEventListener('click', () => {state.page--;renderTable();});$('next').addEventListener('click', () => {state.page++;renderTable();});
$('records').addEventListener('click', e => {const locate=e.target.closest('[data-locate-event]');if(locate){showOnMap(locate.dataset.locateEvent);return;}const button = e.target.closest('[data-event]');if (button) detail(button.dataset.event);});
$('detailContent').addEventListener('click',event=>{const button=event.target.closest('[data-locate-event]');if(button)showOnMap(button.dataset.locateEvent);});
$('activeFilters').addEventListener('click',event=>{const button=event.target.closest('[data-remove-filter]');if(button)removeFilter(button.dataset.removeFilter);});
$('theme').addEventListener('change',()=>window.SeismicPreferences?.set({theme:$('theme').value}));
$('appearance').addEventListener('change',()=>window.SeismicPreferences?.set({mode:$('appearance').value}));
window.SeismicPreferences?.subscribe(appearanceChanged);appearanceChanged();
$('expandMap').addEventListener('click',()=>setExpanded(!state.expanded));
document.addEventListener('keydown',event=>{
  if(!state.expanded || $('detail').open)return;
  if(event.key==='Escape'){event.preventDefault();setExpanded(false);return;}
  if(event.key!=='Tab')return;
  const focusable=[...$('mapCard').querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element=>element.getClientRects().length);
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
});
$('tectonicToggle').addEventListener('change',showTectonics);
$('countryPromptCancel').addEventListener('click',()=>$('countryPrompt').close());
$('countryPromptConfirm').addEventListener('click',()=>{$('countryPrompt').close();$('country').value=pendingCountry;$('admin1').value='';applyFilters();setTab('catalog');state.map?.fitCountry?.(pendingCountry);});
$('closeDetail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => {if (!state.restoring && !$('detail').open) {state.selectedEvent = '';syncURL();}});
$('download').addEventListener('click', exportCsv);$('query').addEventListener('click', exportQuery);$('share').addEventListener('click', shareView);
$('revisionEvent').addEventListener('change', () => {renderRevision();syncURL();});
$('language').addEventListener('change', () => changeLanguage($('language').value));
$('fitMap').addEventListener('click', () => state.map?.fitRecords());$('resetMap').addEventListener('click', () => state.map?.reset());
window.addEventListener('resize', () => {if(['catalog','home','quick','sources'].includes(state.tab))state.map?.resize();});
window.addEventListener('popstate',()=>{restoreLocation().catch(()=>{state.invalidLink=['adm'];showWarnings();$('admin1Status').textContent=t('geoLayerFailed');});});
I.apply(V.parseURL(location.href).view.lang);
async function fetchAsset(url) {
  if(state.assetLoader)return state.assetLoader.load(url);
  const response = await fetch(url);if (!response.ok) throw Error(url + ': ' + response.status);
  const bytes = await response.arrayBuffer(), data = JSON.parse(new TextDecoder().decode(bytes));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {data, hash: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')};
}
async function loadPackage(c) {
  const cached=state.cache.get(c.id);if(cached)return cached;
  if(state.packageLoads.has(c.id))return state.packageLoads.get(c.id);
  const pending=(async()=>{
    const [events,manifest]=await Promise.all([fetchAsset(c.events_url),fetchAsset(c.manifest_url)]);
    if(events.hash!==c.sha256 || manifest.data.derived_asset_sha256!==events.hash || (c.manifest_sha256 && c.manifest_sha256!==manifest.hash))throw Error(t('hashMismatch'));
    const index=state.geography.catalogs[c.id];
    if(!Array.isArray(events.data.fields) || !Array.isArray(events.data.rows) || !index || index.events_sha256!==events.hash || index.row_count!==events.data.rows.length || index.country_ids.length!==index.row_count)throw Error(t('invalidPackage'));
    const allowed=new Set(state.geography.regions.map(r=>r.id));
    let firstOrigin='',lastOrigin='';
    const rows=events.data.rows.map((row,n)=>{const e=Object.fromEntries(events.data.fields.map((key,i)=>[key,row[i]]));e.year=Number(e.time.slice(0,4));e.country_id=index.country_ids[n];if(!firstOrigin||e.time<firstOrigin)firstOrigin=e.time;if(e.time>lastOrigin)lastOrigin=e.time;return e;});
    if(rows.some(e=>!Number.isFinite(e.latitude) || !Number.isFinite(e.longitude) || !Number.isFinite(e.mag) || !Number.isInteger(e.year) || !allowed.has(e.country_id)))throw Error(t('invalidPackage'));
    const pack={catalog:c,events:rows,fields:[...events.data.fields,'country_id'],manifest:manifest.data,hashes:{events:events.hash,manifest:manifest.hash},timeExtent:{first:firstOrigin,last:lastOrigin}};
    attachAdministrativeRows(pack);state.cache.set(c.id,pack);return pack;
  })();
  state.packageLoads.set(c.id,pending);
  try{return await pending;}finally{if(state.packageLoads.get(c.id)===pending)state.packageLoads.delete(c.id);}
}
async function loadCatalog(id, restore = false, preset = {}) {
  const c = id==='all-catalogs' ? combinedDefinition() : state.registry.catalogs.find(c => c.id === id);if (!c) return;
  downloadJobs.clear();sqlPanel?.invalidate();sqlContextCache=null;
  const request = ++state.request;clearTimeout(debounce);state.restoring = true;state.ready = false;state.loadError = null;state.catalog = c;state.pendingRestore = restore;
  const initial = {...V.catalogDefaults(c), ...preset};
  if (c.id !== V.legacyCatalog) initial.unmOnly = false;
  state.pendingFilters = {...initial};
  state.applied = restore ? V.parseURL(location.href, {catalogs:state.registry.catalogs,defaultCatalog:state.registry.default_catalog_id,catalog:c}).view.filters : {...initial};
  state.selectedEvent = '';state.highlightedEvent='';if ($('detail').open) $('detail').close();state.events = [];state.fields = [];state.filtered = [];state.manifest = null;state.activePacks=[];state.composition=null;
  $('activeFilters').replaceChildren();$('activeFilters').hidden=true;
  state.map?.setRecords([]);$('records').replaceChildren();$('histogram').replaceChildren();
  for (const id of ['eventCount','unmCount','missingCount','typeCount']) $(id).textContent = '—';
  $('mapStatus').textContent = '';$('filterSummary').textContent = '';$('loadStatus').textContent = loadingText(c);$('retry').hidden = true;
  buttons();populateCatalogControls();describeDataset();
  try {
    const active=id==='all-catalogs' ? await Promise.all(state.registry.catalogs.map(loadPackage)) : [await loadPackage(c)];
    if (request !== state.request) return;
    const pack=id==='all-catalogs' ? C.combine(active) : active[0];
    if(id==='all-catalogs'){
      const descriptor=JSON.stringify(active.map(p=>[p.catalog.id,p.hashes.events,p.hashes.manifest]));
      const bytes=new TextEncoder().encode(descriptor),hash=await crypto.subtle.digest('SHA-256',bytes);
      if(request!==state.request)return;
      c.snapshot='sha256:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      pack.manifest.snapshot_commit=c.snapshot;state.composition=pack.stats;
    }
    state.activePacks=active;
    state.events = pack.events;state.fields = pack.fields;state.manifest = pack.manifest;state.hashes = {...pack.hashes, registry: state.registryHash};
    state.latestUTC = state.events.reduce((latest,e) => e.time > latest ? e.time : latest, '');state.latest = state.latestUTC.slice(0,10);
    populateFilters();state.ready = true;state.formValid = true;state.invalidLink = [];state.restoring = false;
    if (restore) restoreFromURL();else {
      state.restoring = true;populateAdmin1(initial);writeFilters(initial);$('sort').value = 'recent';state.page = 0;
      state.map.setRegion(c.bounds);state.map.reset();applyFilters(false);if(initial.country)state.map.fitRecords();describeDataset();showWarnings();actionStatus('');
      state.restoring = false;syncURL();buttons();
    }
  } catch (error) {
    if (request !== state.request) return;
    state.restoring = false;state.loadError = error.message;$('loadStatus').textContent = t('loadFailed') + ' ' + state.loadError;$('retry').hidden = false;buttons();
  }
}
async function restoreLocation() {
  if (!state.registry) return;
  const locationRequest=++state.locationRequest,href=location.href,packageRequest=state.request;
  if(new URL(href).searchParams.get('adm')&&!state.admin1)await ensureAdmin1();
  if(locationRequest!==state.locationRequest||href!==location.href||packageRequest!==state.request)return;
  const id = V.catalogFromURL(href, choices());
  if (id !== state.catalog?.id || !state.ready) await loadCatalog(id, true);else restoreFromURL();
}
async function initialize() {
  $('retry').hidden = true;$('loadStatus').textContent = t('loading');buttons();
  try {
    if(window.SeismicAssetLoader && !state.assetLoader){
      const transport=await fetchAsset('data/transport-manifest.json');
      if(transport.hash!==TRANSPORT_SHA256)throw Error(t('hashMismatch'));
      state.assetLoader=window.SeismicAssetLoader.createLoader({transport:transport.data,onProgress:updateTransportProgress,retries:2});
    }
    const [registry,revisions,basemap,geography,coverage] = await Promise.all(['data/catalogs.json','data/revisions.json','data/basemap.geojson','data/country-index.json','data/ssn-coverage.json'].map(fetchAsset));
    if(coverage.hash!=='3c1c8bff0e40ae287a272b2456fe856939f2657d948e100d8dc559f59c341856')throw Error(t('hashMismatch'));
    state.coverage=coverage.data;state.coverageHash=coverage.hash;state.revisionsHash=revisions.hash;
    if (!Array.isArray(registry.data.catalogs) || !registry.data.catalogs.length) throw Error(t('invalidPackage'));
    if(geography.data.schema!=='seismic-country-index/1' || geography.data.geometry_sha256!==basemap.hash || geography.data.registry_sha256!==registry.hash || !Array.isArray(geography.data.regions))throw Error(t('hashMismatch'));
    state.geography=geography.data;state.geographyHash=geography.hash;state.basemap=basemap.data;
    state.registry = registry.data;state.registryHash = registry.hash;state.revisions = revisions.data;showRevisions();
    state.map = createSeismicMap({element: $('map'),basemap: basemap.data,onSelect: detail,onViewChange: syncURL,onDisplayChange:updateDisplayEvidence,translate: t,formatNumber: fmt,
      sourceStyle:event=>window.SeismicSourceWorkbench?.identity(event._catalog_id||state.catalog?.id),
      onHighlight:id=>{state.highlightedEvent=id;renderTable();},
      onCountrySelect:promptCountry,onAdmin1Select:id=>{if(realCountry(state.applied.country)){$('admin1').value=id;applyFilters();state.map?.fitAdmin1?.(id);}},
      onBaseChange: id => {$('mapBase').value = id;syncURL();},onBaseStatus: key => {state.baseStatus = key;$('baseStatus').textContent = t(key);}});
    state.map.setColorMode?.(new URL(location.href).searchParams.get('pointColor')==='depth'?'depth':'catalogue');
    state.map.setDisplayMode?.(new URL(location.href).searchParams.get('display')==='heat'?'heat':'points');updateDisplayEvidence();
    if(!new URL(location.href).searchParams.has('v')){await loadCatalog('all-catalogs',false);setTab('home');requestAnimationFrame(()=>state.map.fitRecords());}
    else {if(new URL(location.href).searchParams.get('adm'))await ensureAdmin1();await restoreLocation();}
  } catch (error) {state.loadError = error.message;$('loadStatus').textContent = t('loadFailed') + ' ' + state.loadError;$('retry').hidden = false;buttons();}
}
let revisionStory=null;
function ensureRevisionStory(){
  if(!revisionStory && window.SeismicRevisionStory && state.revisions?.events)revisionStory=window.SeismicRevisionStory.mount($('revisionStoryWorkspace'),{data:state.revisions,getLanguage:()=>I.language,onEventSelect:id=>{$('revisionEvent').value=id;renderDiagnostics();}});
  return revisionStory;
}
function syncAdminContext(){
  const context=state.ready && !state.applied.country && ['ssn-mx-historical','usgs-mx-historical'].includes(state.catalog?.id);
  if(!context)return;
  if(state.admin1){state.map?.setAdmin1Context?.({geometry:state.admin1Geometry,countryId:'MEX'});return;}
  ensureAdmin1().then(()=>{if(!state.applied.country && ['ssn-mx-historical','usgs-mx-historical'].includes(state.catalog?.id))state.map?.setAdmin1Context?.({geometry:state.admin1Geometry,countryId:'MEX'});}).catch(()=>{});
}
let catalogueLegendRows=null,catalogueLegendCounts=new Map();
function updateDisplayEvidence(evidence){
  const heat=(evidence?.mode || state.map?.getDisplayMode?.())==='heat';
  document.body.dataset.mapDisplay=heat?'heat':'points';
  $('mapDisplay').value=heat?'heat':'points';$('heatLegend').hidden=!heat;$('mapPointLegend').hidden=heat;
  const en=I.language==='en',e=evidence||state.map?.getDisplayEvidence?.();
  $('heatEvidence').textContent=en?'One weight per visible source row · 8 px cells · 32 px radius · scale relative to this viewport. Not energy, physical density or hazard.':'Un peso por fila visible · celdas de 8 px · radio de 32 px · escala relativa a este encuadre. No es energía, densidad física ni amenaza.';
  if(heat && e)$('heatEvidence').textContent+=' '+fmt(e.visible_rows||0)+(en?' visible of ':' visibles de ')+fmt(e.selected_rows||0)+(en?' selected.':' seleccionadas.');
  if(heat)$('heatEvidence').textContent+=' '+t('heatNoSourceColors');
  const sourceColors=(state.map?.getColorMode?.()||'catalogue')==='catalogue';
  $('mapPointColor').value=sourceColors?'catalogue':'depth';$('mapPointColor').disabled=heat;
  $('magnitudeToneLegend').hidden=!sourceColors;
  $('magnitudeToneLegend').innerHTML='<strong>'+(en?'Reported magnitude · lighter → darker':'Magnitud reportada · claro → oscuro')+'</strong>'+['<3','3–<5','5–<7','≥7'].map((v,i)=>`<span><i style="background:${window.SeismicMapTools.magnitudeColor(state.activePacks.length===1?window.SeismicSourceWorkbench.identity(state.activePacks[0].catalog.id).color:'#64748b',[1,4,6,8][i])}"></i>${esc(v)}</span>`).join('');
  $('depthLegend').hidden=sourceColors||!depthKnown();$('catalogueLegend').hidden=!sourceColors;
  if(sourceColors&&window.SeismicSourceWorkbench){
    if(catalogueLegendRows!==state.filtered){catalogueLegendRows=state.filtered;catalogueLegendCounts=new Map();for(const row of state.filtered){const id=row._catalog_id||state.catalog?.id;catalogueLegendCounts.set(id,(catalogueLegendCounts.get(id)||0)+1);}}
    $('catalogueLegend').innerHTML=state.activePacks.map(p=>{const s=window.SeismicSourceWorkbench.identity(p.catalog.id);return `<span class="catalogue-key" style="--catalogue-color:${s.color}"><i class="source-swatch shape-${s.shape}" aria-hidden="true"></i><b>${s.code}</b><span>${esc(s.label)}</span><small>${fmt(catalogueLegendCounts.get(p.catalog.id)||0)}</small></span>`;}).join('');
  }
}
$('mapDisplay').addEventListener('change',()=>{state.map?.setDisplayMode?.($('mapDisplay').value);updateDisplayEvidence();syncURL();});
$('mapPointColor').addEventListener('change',()=>{state.map?.setColorMode?.($('mapPointColor').value);updateDisplayEvidence();syncURL();});
$('architectureLive').addEventListener('click',async event=>{const button=event.target.closest('[data-architecture-catalog]');if(button)await activateSourceCatalogue(button.dataset.architectureCatalog,'methods');});
$('sourceAtlasView').addEventListener('click',()=>setSourceView('atlas'));
$('sourceTimeView').addEventListener('click',()=>setSourceView('time'));
$('sourceAtlasInputs').addEventListener('click',async event=>{const button=event.target.closest('[data-workbench-catalog]');if(button)await activateSourceCatalogue(button.dataset.workbenchCatalog);});
$('sourceTimeTracks').addEventListener('click',async event=>{const button=event.target.closest('[data-source-catalog]');if(button)await activateSourceCatalogue(button.dataset.sourceCatalog);});
$('sourceAll').addEventListener('click',()=>activateSourceCatalogue('all-catalogs'));
$('sourceExplore').addEventListener('click',()=>{if(state.ready&&state.formValid)setTab('catalog');});
$('sourceInspect').addEventListener('click',()=>{if(state.ready&&state.formValid){setTab('catalog');$('records')?.closest?.('.records-card')?.scrollIntoView?.({block:'start'});}});
$('sourceExport').addEventListener('click',()=>{if(state.ready&&state.formValid)exportFullPackage();});
$('sourceStageInputs').addEventListener('click',()=>{$('sourceProfiles').open=true;$('sourceProfiles').scrollIntoView?.({block:'start'});});
$('sourceStageNormalize').addEventListener('click',()=>$('sourceNormalization').scrollIntoView?.({block:'start'}));
$('sourceStageAnalysis').addEventListener('click',()=>{if(state.ready&&state.formValid)setTab('analysis');});
$('sourceStageExport').addEventListener('click',()=>{if(state.ready&&state.formValid)exportFullPackage();});
$('workbenchSources').addEventListener('click',async event=>{const button=event.target.closest('[data-workbench-catalog]');if(button)await activateSourceCatalogue(button.dataset.workbenchCatalog,'home');});
$('workbenchAll').addEventListener('click',async()=>{await activateSourceCatalogue('all-catalogs','home');});
$('workbenchSourceInfo').addEventListener('click',()=>setTab('sources'));
$('workbenchStats').addEventListener('click',()=>{if(state.ready&&state.formValid)setTab('analysis');});
$('workbenchCsv').addEventListener('click',()=>{if(state.ready&&state.formValid)exportCsv();});
$('workbenchJson').addEventListener('click',()=>{if(state.ready&&state.formValid)exportQuery();});
$('workbenchZip').addEventListener('click',()=>{if(state.ready&&state.formValid)exportFullPackage();});
$('workbenchReport').addEventListener('click',()=>{if(!state.ready||!state.formValid)return;setTab('analysis');$('inlineReportFrame').srcdoc=analysisReportHtml();$('printInlineReport').disabled=false;$('deliverablesCard').scrollIntoView?.({block:'start'});});
$('workbenchSql').addEventListener('click',()=>{if(state.ready&&state.formValid)setTab('sql');});
$('workbenchCompare').addEventListener('click',()=>{if(state.ready&&state.formValid)setTab('comparison');});

// Figure links restore the real computation and presentation, not an image viewer.
const requestedArticleView=window.SeismicArticleViews?.resolve(location.href);
if(requestedArticleView){
  state.articleFigure=requestedArticleView.profile.id;
  history.replaceState(null,'',requestedArticleView.url);
  window.SeismicPreferences?.set({theme:requestedArticleView.profile.theme,mode:requestedArticleView.profile.appearance});
}
function leaveArticlePreset(){
  if(!state.articleFigure||document.body.dataset.articleStatus!=='ready')return;
  state.articleFigure='';delete document.body.dataset.articleFigure;delete document.body.dataset.articleStatus;syncURL();
}
for(const eventName of ['input','change'])document.addEventListener(eventName,leaveArticlePreset,true);
document.addEventListener('click',event=>{
  if(event.target.closest('button[id$="Tab"],#sourceAtlasView,#sourceTimeView,[data-source-catalog],[data-workbench-catalog],[data-quick-action],[data-quick-back],[data-quick-full],#fitMap,#resetMap,#expandMap,.history-fit'))leaveArticlePreset();
},true);
document.addEventListener('pointerdown',event=>{if(event.target.closest('#map'))leaveArticlePreset();},true);
async function restoreArticleView(profile){
  if(!state.ready)throw Error('ARTICLE_DATA_NOT_READY');
  if(profile.sourceView)setSourceView(profile.sourceView);
  if(profile.quick)await ensureQuickPanel().restore(profile.quick);
  if(profile.history)await ensureHistoryPanel('recurrence').restore(profile.history);
  if(profile.tab==='top'){
    const result=await ensureHistoryPanel('top').activate();
    if(result?.eligible_records!==285773)throw Error('ARTICLE_TOP10_SELECTION');
  }
  if(profile.tab==='comparison'){
    const result=await ensureComparisonPanel().activate();
    if(!result)throw Error('ARTICLE_COMPARISON_SELECTION');
  }
  if(profile.expectedRows!==undefined && state.filtered.length!==profile.expectedRows)throw Error('ARTICLE_ROW_COUNT');
  if(profile.tectonics!==undefined){$('tectonicToggle').checked=profile.tectonics;await showTectonics();}
  if(profile.expanded)setExpanded(true);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(!profile.quick && ['catalog','home','sources','methods'].includes(profile.tab)){
    state.map.resize();const center=new URL(requestedArticleView.url).searchParams.get('c');
    if(profile.fitRecords)state.map.fitRecords();else if(center)state.map.setView(center.split(',').map(Number));
  }
  document.body.dataset.articleFigure=profile.id;
  if(profile.focus)document.querySelector(profile.focus)?.scrollIntoView?.({block:'start',behavior:'auto'});
  // This stays a normal editable application after restoration. A fresh figure
  // link reapplies its frozen preset; subsequent user edits remain ordinary views.
  syncURL();
}
initialize().then(async()=>{
  startupPhase('render');
  if(!requestedArticleView)return;
  try{await restoreArticleView(requestedArticleView.profile);document.body.dataset.articleStatus='ready';}
  catch(error){document.body.dataset.articleStatus='error';$('loadStatus').hidden=false;$('loadStatus').textContent='Article view could not be reproduced: '+error.message;}
}).then(async()=>{await waitForPresentation();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));finishStartup();}).catch(error=>{state.loadError=error.message;finishStartup();});
