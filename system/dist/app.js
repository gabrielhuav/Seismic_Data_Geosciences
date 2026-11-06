'use strict';
const $ = id => document.getElementById(id);
const I = window.SeismicI18n, V = window.SeismicViewState;
const t = (key, values) => I.t(key, values);
const state = {events: [], filtered: [], manifest: null, registry: null, catalog: null, page: 0, size: 40, revisions: null,
  applied: {...V.defaults}, tab: 'catalog', selectedEvent: '', ready: false, restoring: false,
  formValid: true, invalidLink: [], hashes: {}, action: '', loadError: null, request: 0, cache: new Map(), baseStatus: 'baseLocalNote', highlightedEvent:'', expanded:false};
const fmt = n => new Intl.NumberFormat(I.language).format(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value = (n, dec = 2) => n === null || n === undefined || n === '' ? t('notReported') : Number(n).toLocaleString(I.language, {maximumFractionDigits: dec});
const date = s => s ? s.replace('T', ' ').replace(/Z$/, ' UTC') : t('notReported');
const unm = e => [e.locationSource, e.magSource].some(x => /^(?:unm|us_unm)$/i.test(x));
const controls = Object.keys(V.defaults);
const catalogLabel = c => c.label?.[I.language] || c.label?.en || c.id;
const snapshot = () => String(state.manifest?.snapshot_commit || state.catalog?.snapshot || '');
const derivedKey = () => state.catalog?.identifier_kind === 'derived_row_key' || state.manifest?.identifier_kind === 'derived_row_key';
const depthKnown = () => state.catalog?.depth_unit_status !== 'not_documented_in_source' && state.manifest?.depth_unit_status !== 'not_documented_in_source';
const safeURL = raw => {if (!raw) return '';try {const u = new URL(raw, location.href);return ['http:', 'https:'].includes(u.protocol) ? u.href : '';} catch (_) {return '';}};
const color = (name, fallback) => window.getComputedStyle?.(document.documentElement).getPropertyValue(name).trim() || fallback;
let debounce;

function choices() {
  return {magTypes: [...new Set(state.events.map(e => e.magType).filter(Boolean)), '__missing__'],
    originSources: [...new Set(state.events.map(e => e.locationSource))].filter(Boolean),
    revisions: (state.revisions?.events || []).map(e => e.id), events: state.events.map(e => e.id),
    snapshot: snapshot(), catalogs: state.registry?.catalogs, defaultCatalog: state.registry?.default_catalog_id, catalog: state.catalog};
}
function readFilters() {return Object.fromEntries(controls.map(k => [k, k === 'missingOnly' ? $(k).checked : $(k).value]));}
function writeFilters(filters) {for (const k of controls) if (k === 'missingOnly') $(k).checked = filters[k]; else $(k).value = filters[k];}
function currentView() {
  return {filters: {...state.applied}, sort: $('sort').value, lang: I.language, tab: state.tab,
    revision: $('revisionEvent').value || '', event: state.selectedEvent || state.highlightedEvent, map: state.map?.getView() || null,
    snapshot: snapshot(), catalog: state.catalog?.id, base: state.map?.getBase() || 'local'};
}
function syncURL() {
  if (!state.ready || state.restoring || !state.formValid) return;
  const url = V.serialize(currentView(), location.href);
  history.replaceState(null, '', url);
  if (!$('viewLink').hidden) $('viewLink').value = url;
}
function setTab(name, persist = true) {
  if(state.expanded && name!=='catalog')setExpanded(false);
  state.tab = name;
  for (const tab of ['catalog', 'revisions', 'methods']) {
    const active = tab === name; $(tab + 'Panel').hidden = !active;
    if (active) $(tab + 'Tab').setAttribute('aria-current', 'page'); else $(tab + 'Tab').removeAttribute('aria-current');
  }
  if (name === 'catalog' && state.map) requestAnimationFrame(() => {state.map.resize(); drawMap();});
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
}
function localizeFilterOptions() {
  for(const [id,key] of [['magType','allTypes'],['originSource','allOrigins']]) {
    const empty=$(id).querySelector('option[value=""]');if(empty)empty.textContent=t(key);
  }
  const missing=$('magType').querySelector('option[value="__missing__"]');if(missing)missing.textContent=t('notReported');
}
function populateCatalogControls() {
  if (!state.registry) return;
  const selected = state.catalog || state.registry.catalogs.find(c => c.id === V.catalogFromURL(location.href, choices())) || state.registry.catalogs[0];
  const append = (id, value, text) => {const option = document.createElement('option');option.value = value;option.textContent = text;$(id).append(option);};
  $('providerSelect').replaceChildren();for (const [id, name] of new Map(state.registry.catalogs.map(c => [c.provider,c.provider_name]))) append('providerSelect', id, name);
  $('providerSelect').value = selected.provider;$('catalogSelect').replaceChildren();
  for (const c of state.registry.catalogs.filter(c => c.provider === selected.provider)) append('catalogSelect', c.id, catalogLabel(c));
  $('catalogSelect').value = selected.id;$('providerSelect').disabled = false;$('catalogSelect').disabled = false;
}
function actionStatus(key) {state.action = key;$('actionStatus').textContent = key ? t(key) : '';}
function showWarnings() {
  $('linkWarning').hidden = !state.invalidLink.length;
  $('linkWarning').textContent = state.invalidLink.length ? t('invalidLink', {fields: state.invalidLink.join(', ')}) : '';
}
function buttons() {
  for (const id of ['share', 'query', 'download']) $(id).disabled = !state.ready || !state.formValid;
  // A new package resets its filters. Do not accept input that would be silently
  // overwritten when that asynchronous load finishes; catalog choices remain live.
  for (const id of [...controls, 'searchButton', 'reset', 'sort']) $(id).disabled = !state.ready;
  if (state.ready) $('depthMax').disabled = !depthKnown();
}
function applyFilters(persist = true) {
  if (!state.ready) return;
  const checked = V.validateFilters(readFilters(), choices()); state.formValid = checked.valid;buttons();
  $('filterError').textContent = checked.valid ? '' : t('invalidFilters');
  if (!checked.valid) return;
  state.applied = checked.filters;state.page = 0;
  state.filtered = V.filterEvents(state.events, state.applied, $('sort').value);render();
  if (persist) {state.invalidLink = [];showWarnings();actionStatus('');syncURL();}
}
function render() {
  const rows = state.filtered;
  $('eventCount').textContent = fmt(rows.length);$('unmCount').textContent = fmt(rows.filter(unm).length);
  $('missingCount').textContent = fmt(rows.filter(e => e.horizontalError === null).length);
  $('typeCount').textContent = fmt(new Set(rows.map(e => e.magType).filter(Boolean)).size);
  $('filterSummary').textContent = t('filterSummary', {n: fmt(rows.length), total: fmt(state.events.length), from: state.applied.yearFrom, to: state.applied.yearTo, min: value(state.applied.magMin,1)});
  renderFilterChips();drawMap();drawHistogram();renderTable();
}
function renderFilterChips() {
  const initial=V.catalogDefaults(state.catalog), active=controls.filter(key=>state.applied[key]!==initial[key]);
  $('activeFilters').hidden=!active.length;
  const names={search:'search',yearFrom:'from',yearTo:'to',magMin:'magMin',magMax:'magMax',magType:'magType',originSource:'originSource',depthMax:'maxDepth',missingOnly:'missingOnly'};
  $('activeFilters').innerHTML=active.map(key=>{
    const raw=state.applied[key], text=key==='missingOnly' ? t(names[key]) : t(names[key])+': '+(raw==='__missing__' ? t('notReported') : raw);
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
  state.map?.themeChanged?.();if(state.ready)drawHistogram();
}
function renderTable() {
  const start = state.page * state.size, rows = state.filtered.slice(start, start + state.size);
  $('records').innerHTML = rows.length ? rows.map(e => `<tr class="${e.id===state.highlightedEvent ? 'record-selected' : ''}"><td>${esc(date(e.time))}</td><td><span class="mag">${value(e.mag, 1)}</span><span class="type">${esc(e.magType || '?')}</span></td><td>${depthKnown() ? value(e.depth, 1) : esc(e.raw_depth || t('notReported'))}</td><td>${esc(e.place)}<small>${esc(e.id)}</small></td><td>${esc(e.locationSource || t('notReported'))}</td><td><div class="record-actions"><button data-event="${esc(e.id)}" aria-label="${esc(t('inspectId', {id: e.id}))}">${esc(t('inspect'))}</button><button data-locate-event="${esc(e.id)}" aria-label="${esc(t('locateId',{id:e.id}))}">${esc(t('seeOnMap'))}</button></div></td></tr>`).join('') : `<tr><td colspan="6">${esc(t('noRecords'))}</td></tr>`;
  $('pageLabel').textContent = rows.length ? t('page', {first: fmt(start + 1), last: fmt(start + rows.length), total: fmt(state.filtered.length)}) : t('zeroRecords');
  $('prev').disabled = state.page === 0;$('next').disabled = start + state.size >= state.filtered.length;
}
function drawMap() {if (!$('catalogPanel').hidden && state.map) state.map.setRecords(state.filtered);}
function drawHistogram() {
  const counts = new Map();for (const e of state.filtered) counts.set(e.year, (counts.get(e.year) || 0) + 1);
  const a = state.applied.yearFrom, b = state.applied.yearTo, n = Math.max(1, b - a + 1), max = Math.max(1, ...counts.values()), bw = 940 / n;
  const grid=esc(color('--chart-grid','#ccd9d5')), axis=esc(color('--chart-axis','#546a76')), bar=esc(color('--chart-bar','#438d7c'));
  let svg = `<line x1="45" y1="145" x2="985" y2="145" stroke="${grid}"/><text x="4" y="22" font-size="10" fill="${axis}">${fmt(max)}</text><text x="22" y="148" font-size="10" fill="${axis}">0</text>`;
  for (let year = a; year <= b; year++) {const count = counts.get(year) || 0, height = count / max * 120;svg += `<rect x="${45 + (year - a) * bw}" y="${145 - height}" width="${Math.max(.5, bw * .78)}" height="${height}" fill="${bar}"><title>${year}: ${esc(t('recordsN', {n: fmt(count)}))}</title></rect>`;}
  const step = Math.max(1, Math.ceil(n / 8)), ticks = new Set([a,b]);for (let year = a + step; year < b; year += step) ticks.add(year);
  for (const year of ticks) svg += `<text x="${45 + (year - a + .4) * bw}" y="169" text-anchor="middle" font-size="10" fill="${axis}">${year}</text>`;
  $('histogram').innerHTML = svg;
}
function detail(id, persist = true) {
  const e = state.events.find(e => e.id === id);if (!e) return;
  const spec = state.manifest.files.find(f => f.path === e.file);state.selectedEvent = id;$('detailTitle').textContent = e.place;
  state.highlightedEvent=id;state.map?.highlight?.(id);renderTable();
  const fields = [[derivedKey() ? 'localRecordKey' : 'eventId',e.id],['dataProvider',state.catalog.provider_name],['dataCatalog',catalogLabel(state.catalog)],['originTime',date(e.time)],['reportedMagnitude',value(e.mag,2) + ' ' + (e.magType || t('unknownType'))],['eventType',e.event_type || (state.catalog.provider === 'usgs' ? 'earthquake' : t('notReported'))],['latLon',value(e.latitude,4) + ' / ' + value(e.longitude,4)],[depthKnown() ? 'depthKm' : 'reportedDepth',depthKnown() ? value(e.depth,3) : e.raw_depth],['network',e.net],['originAuthor',e.locationSource],['magAuthor',e.magSource],['horizontalError',value(e.horizontalError)],['depthError',value(e.depthError)],['magnitudeError',value(e.magError)],['reviewStatus',e.status],['summaryUpdated',date(e.updated)],['sourceFile',e.file],['rawHash',spec?.sha256 || t('notReported')]];
  const eventURL = safeURL(e.event_url || (state.catalog.provider === 'usgs' ? 'https://earthquake.usgs.gov/earthquakes/eventpage/' + encodeURIComponent(e.id) : ''));
  const rawURL = safeURL(spec?.url);
  const links = [eventURL ? `<a target="_blank" rel="noopener" href="${esc(eventURL)}">${esc(t(derivedKey() ? 'sourcePage' : 'currentEvent'))}</a>` : '', rawURL ? `<a target="_blank" rel="noopener" href="${esc(rawURL)}">${esc(t('rawCsv'))}</a>` : ''].filter(Boolean).join(' · ');
  const included=state.filtered.some(row=>row.id===id);
  $('detailContent').innerHTML = '<dl>' + fields.map(([k,v]) => `<dt>${esc(t(k))}</dt><dd class="${k === 'rawHash' ? 'hash' : ''}">${esc(v || t('notReported'))}</dd>`).join('') + '</dl>' + `<p class="detail-actions"><button data-locate-event="${esc(id)}" ${included ? '' : 'disabled'}>${esc(t('seeOnMap'))}</button>${links}</p>` + (!included ? `<p class="small">${esc(t('outsideFilters'))}</p>` : '') + `<p class="small">${esc(t(derivedKey() ? 'derivedKeyNote' : 'detailNote'))}</p>`;
  if (!$('detail').open) $('detail').showModal();if (persist) syncURL();
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = name;
  document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv() {
  if (!state.ready || !state.formValid) return;
  const columns = Object.keys(state.events[0] || {}).filter(k => k !== 'year');
  const csv = [columns.join(','), ...state.filtered.map(e => columns.map(k => '"' + String(e[k] ?? '').replace(/"/g, '""') + '"').join(','))].join('\r\n');
  download(new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'}), state.catalog.id + '_filtered_snapshot.csv');
}
function exportQuery() {
  if (!state.ready || !state.formValid) return;
  try {
    const view = currentView(), query = V.queryDocument({view, catalog: state.catalog, manifest: state.manifest, assetHashes: state.hashes,
      rows: state.filtered, pageURL: V.serialize(view, location.href), createdUTC: new Date().toISOString()});
    download(new Blob([JSON.stringify(query, null, 2) + '\n'], {type:'application/json;charset=utf-8'}), state.catalog.id + '_local_query.json');actionStatus('querySaved');
  } catch (error) {actionStatus('queryFailed');}
}
async function shareView() {
  if (!state.ready || !state.formValid) return;
  const url = V.serialize(currentView(), location.href);history.replaceState(null, '', url);
  $('viewLink').value = url;$('viewLink').hidden = false;
  try {if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');await navigator.clipboard.writeText(url);actionStatus('copied');}
  catch (error) {actionStatus('copyFallback');$('viewLink').focus();$('viewLink').select();}
}
function showRevisions() {
  const r = state.revisions;
  if (!r || r.available === false) {$('revisionScope').textContent = t('noRevisions');return;}
  populate('revisionEvent', (r.events || []).map(e => e.id));
  if (r.events?.length) {$('revisionEvent').value = r.events[0].id;renderRevision();}
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
}
function describeDataset() {
  if (!state.catalog) return;
  const c = state.catalog, b = c.bounds.flat().map(n => value(n,2));
  $('catalogCoverage').textContent = t('catalogCoverage', {label: catalogLabel(c), from: c.years[0], to: c.years[1], min: value(c.minimum_magnitude,1), south: b[0], west: b[1], north: b[2], east: b[3]});
  if (!state.ready) return;
  $('loadStatus').textContent = t('loaded', {n: fmt(state.events.length), commit: snapshot().slice(0,12)});
  $('datasetDescription').textContent = t('datasetText', {n: fmt(state.events.length), files: fmt(state.manifest.files.length), latest: state.latest}) + ' ' + $('catalogCoverage').textContent;
  $('manifestLink').href = c.manifest_url;
  $('depthMax').disabled = !depthKnown();$('depthNotice').hidden = depthKnown();$('depthLegend').hidden = !depthKnown();
  $('depthHeader').textContent = t(depthKnown() ? 'depthKm' : 'reportedDepthShort');
  $('placeHeader').textContent = t(derivedKey() ? 'placeLocalKey' : 'placeId');
}
function changeLanguage(lang, persist = true) {
  I.apply(lang);expandedLabel();populateCatalogControls();localizeFilterOptions();$('baseStatus').textContent = t(state.baseStatus);state.map?.languageChanged();
  if (!state.ready) {describeDataset();if (state.loadError) $('loadStatus').textContent = t('loadFailed') + ' ' + state.loadError;return;}
  describeDataset();showWarnings();render();renderRevision();state.map?.languageChanged();
  if (state.selectedEvent && $('detail').open) detail(state.selectedEvent, false);
  $('filterError').textContent = state.formValid ? '' : t('invalidFilters');
  if (state.action) $('actionStatus').textContent = t(state.action);if (persist) syncURL();
}
function restoreFromURL() {
  if (!state.ready) return;state.restoring = true;
  const parsed = V.parseURL(location.href, choices()), view = parsed.view;state.invalidLink = parsed.invalid;
  I.apply(view.lang);populateCatalogControls();populateFilters();writeFilters(view.filters);$('sort').value = view.sort;
  if (!depthKnown() && Number(view.filters.depthMax) !== 1000) {view.filters.depthMax = 1000;$('depthMax').value = 1000;state.invalidLink.push('depth');}
  if (view.revision) $('revisionEvent').value = view.revision;
  applyFilters(false);renderRevision();describeDataset();showWarnings();actionStatus('');
  state.selectedEvent = '';if ($('detail').open) $('detail').close();
  state.map.setRegion(state.catalog.bounds);if (view.map) state.map.setView(view.map);else state.map.reset();
  $('mapBase').value = view.base;state.map.setBase(view.base, false);state.map.languageChanged();
  setTab(view.tab, false);if (view.event) detail(view.event, false);
  const missing = $('magType').querySelector('option[value="__missing__"]');if (missing) missing.textContent = t('notReported');
  state.restoring = false;syncURL();
}
for (const tab of ['catalog','revisions','methods']) $(tab + 'Tab').addEventListener('click', () => setTab(tab));
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
$('providerSelect').addEventListener('change', () => {const c = state.registry.catalogs.find(c => c.provider === $('providerSelect').value);if (c) loadCatalog(c.id);});
$('catalogSelect').addEventListener('change', () => loadCatalog($('catalogSelect').value));
$('mapBase').addEventListener('change', () => state.map?.setBase($('mapBase').value));
$('retry').addEventListener('click', () => state.registry && state.map ? loadCatalog(state.catalog.id, state.pendingRestore) : initialize());
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
$('closeDetail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => {if (!state.restoring && !$('detail').open) {state.selectedEvent = '';syncURL();}});
$('download').addEventListener('click', exportCsv);$('query').addEventListener('click', exportQuery);$('share').addEventListener('click', shareView);
$('revisionEvent').addEventListener('change', () => {renderRevision();syncURL();});
$('language').addEventListener('change', () => changeLanguage($('language').value));
$('fitMap').addEventListener('click', () => state.map?.fitRecords());$('resetMap').addEventListener('click', () => state.map?.reset());
window.addEventListener('resize', () => state.map?.resize());window.addEventListener('popstate', restoreLocation);
I.apply(V.parseURL(location.href).view.lang);
async function fetchAsset(url) {
  const response = await fetch(url);if (!response.ok) throw Error(url + ': ' + response.status);
  const bytes = await response.arrayBuffer(), data = JSON.parse(new TextDecoder().decode(bytes));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {data, hash: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')};
}
async function loadCatalog(id, restore = false) {
  const c = state.registry.catalogs.find(c => c.id === id);if (!c) return;
  const request = ++state.request;clearTimeout(debounce);state.restoring = true;state.ready = false;state.loadError = null;state.catalog = c;state.pendingRestore = restore;
  state.selectedEvent = '';state.highlightedEvent='';if ($('detail').open) $('detail').close();state.events = [];state.filtered = [];state.manifest = null;
  $('activeFilters').replaceChildren();$('activeFilters').hidden=true;
  state.map?.setRecords([]);$('records').replaceChildren();$('histogram').replaceChildren();
  for (const id of ['eventCount','unmCount','missingCount','typeCount']) $(id).textContent = '—';
  $('mapStatus').textContent = '';$('filterSummary').textContent = '';$('loadStatus').textContent = t('loading');$('retry').hidden = true;
  buttons();populateCatalogControls();describeDataset();
  try {
    let pack = state.cache.get(c.id);
    if (!pack) {
      const [events, manifest] = await Promise.all([fetchAsset(c.events_url),fetchAsset(c.manifest_url)]);
      if (events.hash !== c.sha256 || manifest.data.derived_asset_sha256 !== events.hash || (c.manifest_sha256 && c.manifest_sha256 !== manifest.hash)) throw Error(t('hashMismatch'));
      if (!Array.isArray(events.data.fields) || !Array.isArray(events.data.rows)) throw Error(t('invalidPackage'));
      const rows = events.data.rows.map(row => {const e = Object.fromEntries(events.data.fields.map((key,i) => [key,row[i]]));e.year = Number(e.time.slice(0,4));return e;});
      if (rows.some(e => !Number.isFinite(e.latitude) || !Number.isFinite(e.longitude) || !Number.isFinite(e.mag) || !Number.isInteger(e.year))) throw Error(t('invalidPackage'));
      pack = {events: rows, manifest: manifest.data, hashes: {events: events.hash, manifest: manifest.hash}};state.cache.set(c.id, pack);
    }
    if (request !== state.request) return;
    state.events = pack.events;state.manifest = pack.manifest;state.hashes = {...pack.hashes, registry: state.registryHash};
    state.latest = state.events.reduce((latest,e) => e.time > latest ? e.time : latest, '').slice(0,10);
    populateFilters();state.ready = true;state.formValid = true;state.invalidLink = [];state.restoring = false;
    if (restore) restoreFromURL();else {
      state.restoring = true;writeFilters(V.catalogDefaults(c));$('sort').value = 'recent';state.page = 0;
      state.map.setRegion(c.bounds);state.map.reset();applyFilters(false);describeDataset();showWarnings();actionStatus('');
      state.restoring = false;syncURL();buttons();
    }
  } catch (error) {
    if (request !== state.request) return;
    state.restoring = false;state.loadError = error.message;$('loadStatus').textContent = t('loadFailed') + ' ' + state.loadError;$('retry').hidden = false;buttons();
  }
}
async function restoreLocation() {
  if (!state.registry) return;const id = V.catalogFromURL(location.href, choices());
  if (id !== state.catalog?.id || !state.ready) await loadCatalog(id, true);else restoreFromURL();
}
async function initialize() {
  $('retry').hidden = true;$('loadStatus').textContent = t('loading');buttons();
  try {
    const [registry,revisions,basemap] = await Promise.all(['data/catalogs.json','data/revisions.json','data/basemap.geojson'].map(fetchAsset));
    if (!Array.isArray(registry.data.catalogs) || !registry.data.catalogs.length) throw Error(t('invalidPackage'));
    state.registry = registry.data;state.registryHash = registry.hash;state.revisions = revisions.data;showRevisions();
    state.map = createSeismicMap({element: $('map'),basemap: basemap.data,onSelect: detail,onViewChange: syncURL,translate: t,formatNumber: fmt,
      onHighlight:id=>{state.highlightedEvent=id;renderTable();},
      onBaseChange: id => {$('mapBase').value = id;syncURL();},onBaseStatus: key => {state.baseStatus = key;$('baseStatus').textContent = t(key);}});
    await restoreLocation();
  } catch (error) {state.loadError = error.message;$('loadStatus').textContent = t('loadFailed') + ' ' + state.loadError;$('retry').hidden = false;buttons();}
}
initialize();
