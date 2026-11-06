'use strict';
const $ = id => document.getElementById(id);
const I = window.SeismicI18n, V = window.SeismicViewState;
const t = (key, values) => I.t(key, values);
const state = {events: [], filtered: [], manifest: null, page: 0, size: 40, revisions: null,
  applied: {...V.defaults}, tab: 'catalog', selectedEvent: '', ready: false, restoring: false,
  formValid: true, invalidLink: [], hashes: {}, action: '', loadError: null};
const fmt = n => new Intl.NumberFormat(I.language).format(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value = (n, dec = 2) => n === null || n === undefined || n === '' ? t('notReported') : Number(n).toLocaleString(I.language, {maximumFractionDigits: dec});
const date = s => s ? s.replace('T', ' ').replace(/Z$/, ' UTC') : t('notReported');
const unm = e => [e.locationSource, e.magSource].some(x => /^(?:unm|us_unm)$/i.test(x));
const controls = Object.keys(V.defaults);
let debounce;

function choices() {
  return {magTypes: [...new Set(state.events.map(e => e.magType).filter(Boolean)), '__missing__'],
    originSources: [...new Set(state.events.map(e => e.locationSource))].filter(Boolean),
    revisions: (state.revisions?.events || []).map(e => e.id), events: state.events.map(e => e.id),
    snapshot: state.manifest?.snapshot_commit};
}
function readFilters() {return Object.fromEntries(controls.map(k => [k, k === 'missingOnly' ? $(k).checked : $(k).value]));}
function writeFilters(filters) {for (const k of controls) if (k === 'missingOnly') $(k).checked = filters[k]; else $(k).value = filters[k];}
function currentView() {
  return {filters: {...state.applied}, sort: $('sort').value, lang: I.language, tab: state.tab,
    revision: $('revisionEvent').value || '', event: state.selectedEvent, map: state.map?.getView() || null,
    snapshot: state.manifest.snapshot_commit};
}
function syncURL() {
  if (!state.ready || state.restoring || !state.formValid) return;
  const url = V.serialize(currentView(), location.href);
  history.replaceState(null, '', url);
  if (!$('viewLink').hidden) $('viewLink').value = url;
}
function setTab(name, persist = true) {
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
function actionStatus(key) {state.action = key;$('actionStatus').textContent = key ? t(key) : '';}
function showWarnings() {
  $('linkWarning').hidden = !state.invalidLink.length;
  $('linkWarning').textContent = state.invalidLink.length ? t('invalidLink', {fields: state.invalidLink.join(', ')}) : '';
}
function buttons() {for (const id of ['share', 'query', 'download']) $(id).disabled = !state.ready || !state.formValid;}
function applyFilters(persist = true) {
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
  drawMap();drawHistogram();renderTable();
}
function renderTable() {
  const start = state.page * state.size, rows = state.filtered.slice(start, start + state.size);
  $('records').innerHTML = rows.length ? rows.map(e => `<tr><td>${esc(date(e.time))}</td><td><span class="mag">${value(e.mag, 1)}</span><span class="type">${esc(e.magType || '?')}</span></td><td>${value(e.depth, 1)}</td><td>${esc(e.place)}<small>${esc(e.id)}</small></td><td>${esc(e.locationSource || t('unknown'))}</td><td><button data-event="${esc(e.id)}" aria-label="${esc(t('inspectId', {id: e.id}))}">${esc(t('inspect'))}</button></td></tr>`).join('') : `<tr><td colspan="6">${esc(t('noRecords'))}</td></tr>`;
  $('pageLabel').textContent = rows.length ? t('page', {first: fmt(start + 1), last: fmt(start + rows.length), total: fmt(state.filtered.length)}) : t('zeroRecords');
  $('prev').disabled = state.page === 0;$('next').disabled = start + state.size >= state.filtered.length;
}
function drawMap() {if (!$('catalogPanel').hidden && state.map) state.map.setRecords(state.filtered);}
function drawHistogram() {
  const counts = new Map();for (const e of state.filtered) counts.set(e.year, (counts.get(e.year) || 0) + 1);
  const a = state.applied.yearFrom, b = state.applied.yearTo, n = Math.max(1, b - a + 1), max = Math.max(1, ...counts.values()), bw = 940 / n;
  let svg = `<line x1="45" y1="145" x2="985" y2="145" stroke="#ccd9d5"/><text x="4" y="22" font-size="10" fill="#546a76">${fmt(max)}</text><text x="22" y="148" font-size="10" fill="#546a76">0</text>`;
  for (let year = a; year <= b; year++) {const count = counts.get(year) || 0, height = count / max * 120;svg += `<rect x="${45 + (year - a) * bw}" y="${145 - height}" width="${Math.max(.5, bw * .78)}" height="${height}" fill="#438d7c"><title>${year}: ${esc(t('recordsN', {n: fmt(count)}))}</title></rect>`;}
  const ticks = new Set([a, b, ...Array.from({length: Math.max(0, Math.floor((b - a) / 20))}, (_, i) => a + (i + 1) * 20)]);
  for (const year of ticks) svg += `<text x="${45 + (year - a + .4) * bw}" y="169" text-anchor="middle" font-size="10" fill="#546a76">${year}</text>`;
  $('histogram').innerHTML = svg;
}
function detail(id, persist = true) {
  const e = state.events.find(e => e.id === id);if (!e) return;
  const spec = state.manifest.files.find(f => f.path === e.file);state.selectedEvent = id;$('detailTitle').textContent = e.place;
  const fields = [['eventId',e.id],['originTime',date(e.time)],['reportedMagnitude',value(e.mag,2) + ' ' + (e.magType || t('unknownType'))],['latLon',value(e.latitude,4) + ' / ' + value(e.longitude,4)],['depthKm',value(e.depth,3)],['network',e.net],['originAuthor',e.locationSource],['magAuthor',e.magSource],['horizontalError',value(e.horizontalError)],['depthError',value(e.depthError)],['magnitudeError',value(e.magError)],['reviewStatus',e.status],['summaryUpdated',date(e.updated)],['sourceFile',e.file],['rawHash',spec?.sha256 || t('notReported')]];
  $('detailContent').innerHTML = '<dl>' + fields.map(([k,v]) => `<dt>${esc(t(k))}</dt><dd class="${k === 'rawHash' ? 'hash' : ''}">${esc(v || t('notReported'))}</dd>`).join('') + '</dl>' + `<p><a target="_blank" rel="noopener" href="https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(e.id)}">${esc(t('currentEvent'))}</a>${spec ? ` · <a target="_blank" rel="noopener" href="${esc(spec.url)}">${esc(t('rawCsv'))}</a>` : ''}</p><p class="small">${esc(t('detailNote'))}</p>`;
  if (!$('detail').open) $('detail').showModal();if (persist) syncURL();
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = name;
  document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv() {
  if (!state.ready || !state.formValid) return;
  const columns = Object.keys(state.events[0]).filter(k => k !== 'year');
  const csv = [columns.join(','), ...state.filtered.map(e => columns.map(k => '"' + String(e[k] ?? '').replace(/"/g, '""') + '"').join(','))].join('\r\n');
  download(new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'}), 'comcat_filtered_snapshot.csv');
}
function exportQuery() {
  if (!state.ready || !state.formValid) return;
  try {
    const view = currentView(), query = V.queryDocument({view, manifest: state.manifest, assetHashes: state.hashes,
      rows: state.filtered, pageURL: V.serialize(view, location.href), createdUTC: new Date().toISOString()});
    download(new Blob([JSON.stringify(query, null, 2) + '\n'], {type:'application/json;charset=utf-8'}), 'comcat_local_query.json');actionStatus('querySaved');
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
  $('loadStatus').textContent = t('loaded', {n: fmt(state.events.length), commit: state.manifest.snapshot_commit.slice(0,12)});
  $('datasetDescription').textContent = t('datasetText', {n: fmt(state.events.length), files: fmt(state.manifest.files.length), latest: state.latest});
}
function changeLanguage(lang, persist = true) {
  I.apply(lang);const missing = $('magType').querySelector('option[value="__missing__"]');if (missing) missing.textContent = t('notReported');
  if (!state.ready) {if (state.loadError) $('loadStatus').textContent = t('loadFailed') + ' ' + state.loadError;return;}
  describeDataset();showWarnings();render();renderRevision();state.map?.languageChanged();
  if (state.selectedEvent && $('detail').open) detail(state.selectedEvent, false);
  $('filterError').textContent = state.formValid ? '' : t('invalidFilters');
  if (state.action) $('actionStatus').textContent = t(state.action);if (persist) syncURL();
}
function restoreFromURL() {
  if (!state.ready) return;state.restoring = true;
  const parsed = V.parseURL(location.href, choices()), view = parsed.view;state.invalidLink = parsed.invalid;
  I.apply(view.lang);writeFilters(view.filters);$('sort').value = view.sort;
  if (view.revision) $('revisionEvent').value = view.revision;
  applyFilters(false);renderRevision();describeDataset();showWarnings();actionStatus('');
  state.selectedEvent = '';if ($('detail').open) $('detail').close();
  if (view.map) state.map.setView(view.map);else state.map.reset();state.map.languageChanged();
  setTab(view.tab, false);if (view.event) detail(view.event, false);
  const missing = $('magType').querySelector('option[value="__missing__"]');if (missing) missing.textContent = t('notReported');
  state.restoring = false;syncURL();
}
for (const tab of ['catalog','revisions','methods']) $(tab + 'Tab').addEventListener('click', () => setTab(tab));
for (const id of controls) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {clearTimeout(debounce);state.formValid = false;buttons();debounce = setTimeout(() => applyFilters(), id === 'search' ? 180 : 0);});
$('reset').addEventListener('click', () => {writeFilters(V.defaults);applyFilters();});
$('sort').addEventListener('change', () => applyFilters());
$('prev').addEventListener('click', () => {state.page--;renderTable();});$('next').addEventListener('click', () => {state.page++;renderTable();});
$('records').addEventListener('click', e => {const button = e.target.closest('[data-event]');if (button) detail(button.dataset.event);});
$('closeDetail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => {if (!state.restoring && !$('detail').open) {state.selectedEvent = '';syncURL();}});
$('download').addEventListener('click', exportCsv);$('query').addEventListener('click', exportQuery);$('share').addEventListener('click', shareView);
$('revisionEvent').addEventListener('change', () => {renderRevision();syncURL();});
$('language').addEventListener('change', () => changeLanguage($('language').value));
$('fitMap').addEventListener('click', () => state.map?.fitRecords());$('resetMap').addEventListener('click', () => state.map?.reset());
window.addEventListener('resize', () => state.map?.resize());window.addEventListener('popstate', restoreFromURL);
I.apply(V.parseURL(location.href).view.lang);
(async () => {
  try {
    async function fetchAsset(url) {
      const response = await fetch(url);if (!response.ok) throw Error(url + ': ' + response.status);
      const bytes = await response.arrayBuffer();const data = JSON.parse(new TextDecoder().decode(bytes));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return {data, hash: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')};
    }
    const [packaged, manifest, revisions, basemap] = await Promise.all(['data/events.json','data/manifest.json','data/revisions.json','data/basemap.geojson'].map(fetchAsset));
    if (manifest.data.derived_asset_sha256 !== packaged.hash) throw Error(t('hashMismatch'));
    state.manifest = manifest.data;state.revisions = revisions.data;state.hashes = {events: packaged.hash, manifest: manifest.hash};
    state.events = packaged.data.rows.map(row => Object.assign(Object.fromEntries(packaged.data.fields.map((key,i) => [key,row[i]])), {year: Number(row[packaged.data.fields.indexOf('time')].slice(0,4))}));
    state.latest = state.events.reduce((latest,e) => e.time > latest ? e.time : latest, '').slice(0,10);
    populate('magType', state.events.map(e => e.magType).filter(Boolean));
    if (state.events.some(e => !e.magType)) {const option = document.createElement('option');option.value = '__missing__';option.textContent = t('notReported');$('magType').append(option);}
    populate('originSource', state.events.map(e => e.locationSource).filter(Boolean));showRevisions();
    state.map = createSeismicMap({element: $('map'), basemap: basemap.data, onSelect: detail, onViewChange: syncURL, translate: t, formatNumber: fmt});
    state.ready = true;restoreFromURL();buttons();
  } catch (error) {state.loadError = error.message;$('loadStatus').textContent = t('loadFailed') + ' ' + state.loadError;buttons();}
})();
