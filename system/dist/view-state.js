(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeismicViewState = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({search: '', yearFrom: 1900, yearTo: 2026, magMin: 3.5, magMax: 10,
    magType: '', originSource: '', depthMax: 1000, missingOnly: false});
  const keys = Object.keys(defaults);
  const tabs = ['catalog', 'revisions', 'methods'];
  const sorts = ['recent', 'oldest', 'mag'];
  const urlKeys = {search: 'q', yearFrom: 'from', yearTo: 'to', magMin: 'min', magMax: 'max',
    magType: 'mt', originSource: 'src', depthMax: 'depth', missingOnly: 'missing'};

  function validateFilters(input, options = {}) {
    const f = {...defaults, ...input}, errors = [];
    for (const k of ['yearFrom', 'yearTo', 'magMin', 'magMax', 'depthMax']) {
      if (String(f[k] ?? '').trim() === '' || !Number.isFinite(Number(f[k]))) errors.push(k);
      f[k] = Number(f[k]);
    }
    if (!Number.isInteger(f.yearFrom) || f.yearFrom < 1900 || f.yearFrom > 2026) errors.push('yearFrom');
    if (!Number.isInteger(f.yearTo) || f.yearTo < 1900 || f.yearTo > 2026 || f.yearFrom > f.yearTo) errors.push('yearTo');
    if (f.magMin < -2 || f.magMin > 10) errors.push('magMin');
    if (f.magMax < -2 || f.magMax > 10 || f.magMin > f.magMax) errors.push('magMax');
    if (f.depthMax < -100 || f.depthMax > 1000) errors.push('depthMax');
    f.search = String(f.search ?? '').trim();
    f.magType = String(f.magType ?? ''); f.originSource = String(f.originSource ?? '');
    if (f.search.length > 200) errors.push('search');
    for (const [k, allowed] of [['magType', options.magTypes], ['originSource', options.originSources]]) {
      if (f[k].length > 80 || (allowed && f[k] && !allowed.includes(f[k]))) errors.push(k);
    }
    if (typeof f.missingOnly !== 'boolean') errors.push('missingOnly');
    return {valid: !errors.length, filters: Object.fromEntries(keys.map(k => [k, f[k]])), errors: [...new Set(errors)]};
  }

  function validMap(value) {
    return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
      && value[0] >= -5 && value[0] <= 55 && value[1] >= -145 && value[1] <= -55 && value[2] >= 3 && value[2] <= 9;
  }

  function parseURL(input, options = {}) {
    const params = new URL(input).searchParams, invalid = [], raw = {...defaults};
    for (const k of keys) if (params.has(urlKeys[k])) raw[k] = params.get(urlKeys[k]);
    if (params.has('missing')) {
      if (!['0', '1'].includes(params.get('missing'))) invalid.push('missing');
      raw.missingOnly = params.get('missing') === '1';
    }
    const checked = validateFilters(raw, options);
    if (!checked.valid) invalid.push(...checked.errors);
    const view = {filters: checked.valid ? checked.filters : {...defaults}, lang: 'es', tab: 'catalog', sort: 'recent', revision: '', event: '', map: null};
    for (const [key, allowed] of [['lang', ['es', 'en']], ['tab', tabs], ['sort', sorts]]) {
      if (params.has(key)) {
        if (allowed.includes(params.get(key))) view[key] = params.get(key); else invalid.push(key);
      }
    }
    for (const [key, allowed] of [['revision', options.revisions], ['event', options.events]]) {
      const value = params.get(key === 'revision' ? 'rev' : key);
      if (value !== null) {
        if (/^[A-Za-z0-9_-]{1,80}$/.test(value) && (!allowed || allowed.includes(value))) view[key] = value;
        else invalid.push(key);
      }
    }
    if (params.has('c')) {
      const pieces = params.get('c').split(',');
      const center = pieces.length === 3 && pieces.every(p => p.trim() !== '') ? pieces.map(Number) : [];
      if (validMap(center)) view.map = center; else invalid.push('c');
    }
    if (params.has('v') && params.get('v') !== '1') invalid.push('v');
    if (params.has('snapshot') && params.get('snapshot') !== options.snapshot) invalid.push('snapshot');
    return {view, invalid: [...new Set(invalid)]};
  }

  function serialize(view, base) {
    const checked = validateFilters(view.filters);
    if (!checked.valid || !tabs.includes(view.tab) || !sorts.includes(view.sort) || !['es', 'en'].includes(view.lang)) throw Error('Invalid view');
    const url = new URL(base); url.search = ''; url.hash = '';
    const p = url.searchParams; p.set('v', '1'); p.set('lang', view.lang);
    if (view.snapshot) p.set('snapshot', view.snapshot);
    for (const k of keys) if (checked.filters[k] !== defaults[k]) p.set(urlKeys[k], k === 'missingOnly' ? (checked.filters[k] ? '1' : '0') : String(checked.filters[k]));
    if (view.tab !== 'catalog') p.set('tab', view.tab);
    if (view.sort !== 'recent') p.set('sort', view.sort);
    if (view.revision) p.set('rev', view.revision);
    if (view.event) p.set('event', view.event);
    if (validMap(view.map)) p.set('c', view.map.map((n, i) => Number(n.toFixed(i === 2 ? 2 : 5))).join(','));
    return url.href;
  }

  function filterEvents(events, f, sort = 'recent') {
    const q = f.search.toLowerCase();
    const rows = events.filter(e => e.year >= f.yearFrom && e.year <= f.yearTo && e.mag >= f.magMin && e.mag <= f.magMax
      && (e.depth === null ? f.depthMax === 1000 : e.depth <= f.depthMax)
      && (!f.magType || (f.magType === '__missing__' ? !e.magType : e.magType === f.magType))
      && (!f.originSource || e.locationSource === f.originSource)
      && (!f.missingOnly || e.horizontalError === null)
      && (!q || e.id.toLowerCase().includes(q) || e.place.toLowerCase().includes(q)));
    rows.sort(sort === 'mag' ? (a,b) => b.mag-a.mag || b.time.localeCompare(a.time)
      : sort === 'oldest' ? (a,b) => a.time.localeCompare(b.time) : (a,b) => b.time.localeCompare(a.time));
    return rows;
  }

  function queryDocument({view, manifest, assetHashes, rows, pageURL, createdUTC}) {
    return {
      schema: 'seismic-local-query/1', created_utc: createdUTC,
      engine: 'Seismic Data Observatory browser-local filter, version 1',
      input: {events_path: 'data/events.json', events_sha256: assetHashes.events,
        manifest_path: 'data/manifest.json', manifest_sha256: assetHashes.manifest,
        snapshot_repository: manifest.snapshot_repository, snapshot_commit: manifest.snapshot_commit,
        source_files: manifest.files, packaged_event_type: 'earthquake'},
      selection: {...view.filters}, sort: view.sort,
      predicate_rules: {
        year: 'Inclusive UTC origin-time year bounds.', magnitude: 'Inclusive reported values; exact magType match; no scale conversion.',
        depth: 'Inclusive maximum; null depth included only when depthMax is the default 1000.',
        missingOnly: 'When true require horizontalError === null; unknown is never zero.',
        search: 'Trimmed case-insensitive substring of event ID or reported place.',
        originSource: 'Exact locationSource match; not a country assignment.',
        missing_magnitude_type: 'The sentinel __missing__ selects absent magnitude types.',
        sort_ties: 'mag uses descending origin time as a tiebreaker; time ties preserve packaged row order.',
        map: 'Map bounds, zoom, language, selected event and tab do not alter the filter or CSV.'
      },
      result: {row_count: rows.length, ordered_event_ids: rows.map(e => e.id)},
      view_url: pageURL,
      limits: [
        'This describes a local query over the identified packaged bytes, not an equivalent live ComCat request.',
        'A live ComCat response can change and cannot replace this snapshot when reproducing the result.',
        'The regional rectangle includes offshore and neighbouring areas; no event nationality is inferred.',
        'Reported magnitude types are not interchangeable; missing uncertainties remain unknown.',
        'Counts and epicenters do not estimate earthquake probability, shaking or damage.',
        'The separate retained-revision pilot does not reconstruct complete past catalogue states.'
      ]
    };
  }
  return {defaults, validateFilters, validMap, parseURL, serialize, filterEvents, queryDocument};
});
