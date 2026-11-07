(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeismicViewState = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({search: '', yearFrom: 1900, yearTo: 2026, magMin: 3.5, magMax: 10,
    magType: '', originSource: '', depthMax: 1000, missingOnly: false, unmOnly: false, country: ''});
  const keys = Object.keys(defaults);
  const tabs = ['home', 'catalog', 'sources', 'analysis', 'revisions', 'methods'];
  const sorts = ['recent', 'oldest', 'mag'];
  const defaultCatalog = 'usgs-na-2020-2025', legacyCatalog = 'usgs-mx-historical';
  const bases = ['local', 'osm', 'osm-hot', 'usgs-topo', 'nasa-blue-marble'];
  const unmSourceCodes = Object.freeze(['unm', 'us_unm']);
  const isUnmAttributed = event => unmSourceCodes.includes(event.locationSource) || unmSourceCodes.includes(event.magSource);
  const urlKeys = {search: 'q', yearFrom: 'from', yearTo: 'to', magMin: 'min', magMax: 'max',
    magType: 'mt', originSource: 'src', depthMax: 'depth', missingOnly: 'missing', unmOnly: 'unmOnly', country: 'country'};

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
    f.country = String(f.country ?? '');
    if (f.country && (!/^[A-Za-z0-9_-]{1,80}$/.test(f.country) || (options.countries && !options.countries.includes(f.country)))) errors.push('country');
    if (f.search.length > 200) errors.push('search');
    for (const [k, allowed] of [['magType', options.magTypes], ['originSource', options.originSources]]) {
      if (f[k].length > 80 || (allowed && f[k] && !allowed.includes(f[k]))) errors.push(k);
    }
    for (const key of ['missingOnly', 'unmOnly']) if (typeof f[key] !== 'boolean') errors.push(key);
    if (f.unmOnly && options.catalog && options.catalog.id !== legacyCatalog) errors.push('unmOnly');
    return {valid: !errors.length, filters: Object.fromEntries(keys.map(k => [k, f[k]])), errors: [...new Set(errors)]};
  }

  function validMap(value) {
    return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
      && value[0] >= -5 && value[0] <= 85 && value[1] >= -210 && value[1] <= -40 && value[2] >= 1.5 && value[2] <= 12;
  }

  function catalogDefaults(catalog) {
    return {...defaults, yearFrom: catalog?.years?.[0] ?? defaults.yearFrom,
      yearTo: catalog?.years?.[1] ?? defaults.yearTo, magMin: catalog?.minimum_magnitude ?? defaults.magMin};
  }

  function catalogFromURL(input, options = {}) {
    const p = new URL(input).searchParams;
    const fallback = p.get('v') === '1' ? legacyCatalog : options.defaultCatalog || defaultCatalog;
    const requested = p.get('v') === '1' ? legacyCatalog : p.get('catalog') || fallback;
    if (requested === 'all-catalogs' && p.get('v') === '4') return requested;
    return !options.catalogs || options.catalogs.some(c => (typeof c === 'string' ? c : c.id) === requested) ? requested : fallback;
  }

  function parseURL(input, options = {}) {
    const params = new URL(input).searchParams, invalid = [], catalog = catalogFromURL(input, options);
    const definition = options.catalogs?.find(c => c.id === catalog) || (catalog === 'all-catalogs' ? {years:[1900,2026],minimum_magnitude:3.5} : options.catalog);
    const initial = catalogDefaults(definition), raw = {...initial};
    if (params.has('catalog') && params.get('catalog') !== catalog) invalid.push('catalog');
    for (const k of keys) if (params.has(urlKeys[k])) raw[k] = params.get(urlKeys[k]);
    if (params.has('missing')) {
      if (!['0', '1'].includes(params.get('missing'))) invalid.push('missing');
      raw.missingOnly = params.get('missing') === '1';
    }
    if (params.has('unmOnly')) {
      if (!['3','4'].includes(params.get('v')) || !['0', '1'].includes(params.get('unmOnly'))) invalid.push('unmOnly');
      raw.unmOnly = ['3','4'].includes(params.get('v')) && params.get('unmOnly') === '1';
    }
    if (params.has('country') && params.get('v') !== '4') {invalid.push('country');raw.country='';}
    if (raw.unmOnly && catalog !== legacyCatalog) {invalid.push('unmOnly');raw.unmOnly = false;}
    const checked = validateFilters(raw, options);
    if (!checked.valid) invalid.push(...checked.errors);
    const view = {filters: checked.valid ? checked.filters : initial, lang: 'es', tab: 'catalog', sort: 'recent', revision: '', event: '', map: null, catalog, base: 'local'};
    if (!params.size) view.tab = 'home';
    for (const [key, allowed] of [['lang', ['es', 'en']], ['tab', tabs], ['sort', sorts]]) {
      if (params.has(key)) {
        if (allowed.includes(params.get(key))) view[key] = params.get(key); else invalid.push(key);
      }
    }
    for (const [key, allowed] of [['revision', options.revisions], ['event', options.events]]) {
      const value = params.get(key === 'revision' ? 'rev' : key);
      if (value !== null) {
        if (/^[A-Za-z0-9_~.-]{1,180}$/.test(value) && (!allowed || allowed.includes(value))) view[key] = value;
        else invalid.push(key);
      }
    }
    if (params.has('c')) {
      const pieces = params.get('c').split(',');
      const center = pieces.length === 3 && pieces.every(p => p.trim() !== '') ? pieces.map(Number) : [];
      if (validMap(center)) view.map = center; else invalid.push('c');
    }
    if (params.has('base')) {if (bases.includes(params.get('base'))) view.base = params.get('base');else invalid.push('base');}
    if (params.has('v') && !['1','2','3','4'].includes(params.get('v'))) invalid.push('v');
    if (params.has('snapshot') && params.get('snapshot') !== options.snapshot) invalid.push('snapshot');
    if (params.has('geo') && params.get('geo') !== options.geographyHash) invalid.push('geo');
    return {view, invalid: [...new Set(invalid)]};
  }

  function serialize(view, base) {
    const checked = validateFilters(view.filters);
    if (!checked.valid || !tabs.includes(view.tab) || !sorts.includes(view.sort) || !['es', 'en'].includes(view.lang)) throw Error('Invalid view');
    if (checked.filters.unmOnly && (view.catalog || legacyCatalog) !== legacyCatalog) throw Error('UNM attribution requires the Mexico catalogue');
    const url = new URL(base); url.search = ''; url.hash = '';
    const p = url.searchParams; p.set('v', checked.filters.country || view.catalog === 'all-catalogs' ? '4' : '3'); p.set('lang', view.lang);
    p.set('catalog', view.catalog || legacyCatalog);
    if (view.base && bases.includes(view.base) && view.base !== 'local') p.set('base', view.base);
    if (view.snapshot) p.set('snapshot', view.snapshot);
    if ((checked.filters.country || view.catalog==='all-catalogs') && view.geography) p.set('geo',view.geography);
    // Numeric bounds are explicit so a registry update cannot silently alter a saved selection.
    for (const k of keys) if (typeof defaults[k] === 'number' || checked.filters[k] !== defaults[k]) p.set(urlKeys[k], typeof defaults[k] === 'boolean' ? (checked.filters[k] ? '1' : '0') : String(checked.filters[k]));
    if (view.tab !== 'catalog') p.set('tab', view.tab);
    if (view.sort !== 'recent') p.set('sort', view.sort);
    if (view.revision) p.set('rev', view.revision);
    if (view.event) p.set('event', view.event);
    if (validMap(view.map)) p.set('c', view.map.map((n, i) => Number(n.toFixed(i === 2 ? 2 : 5))).join(','));
    return url.href;
  }

  function filterEvents(events, f, sort = 'recent') {
    const searchText = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = searchText(f.search);
    const rows = events.filter(e => e.year >= f.yearFrom && e.year <= f.yearTo && e.mag >= f.magMin && e.mag <= f.magMax
      && (e.depth === null ? f.depthMax === 1000 : e.depth <= f.depthMax)
      && (!f.magType || (f.magType === '__missing__' ? !e.magType : e.magType === f.magType))
      && (!f.originSource || e.locationSource === f.originSource)
      && (!f.missingOnly || e.horizontalError === null)
      && (!f.unmOnly || isUnmAttributed(e))
      && (!f.country || e.country_id === f.country)
      && (!q || searchText(e.id).includes(q) || searchText(e.source_event_id).includes(q) || searchText(e.place).includes(q)));
    rows.sort(sort === 'mag' ? (a,b) => b.mag-a.mag || b.time.localeCompare(a.time)
      : sort === 'oldest' ? (a,b) => a.time.localeCompare(b.time) : (a,b) => b.time.localeCompare(a.time));
    return rows;
  }

  function queryDocument({view, catalog, manifest, assetHashes, fields, rows, pageURL, createdUTC, inputs, geography}) {
    if (catalog?.id === 'all-catalogs') {
      if (!inputs?.length || !geography) throw Error('Combined queries require all source and geography evidence');
      return {schema:'seismic-local-query/4', created_utc:createdUTC, engine:'Seismic Data Observatory browser-local filter, version 4',
        catalog:{id:catalog.id,provider:'all',years:catalog.years,bounds:catalog.bounds},
        inputs:inputs.map(input=>queryDocument({view:{...view,catalog:input.catalog.id},...input,assetHashes:{...input.hashes,registry:assetHashes.registry},rows:[],pageURL,createdUTC}).input),
        input_catalogs:inputs.map(input=>({id:input.catalog.id,provider:input.catalog.provider,snapshot:input.catalog.snapshot,events_sha256:input.hashes.events,manifest_sha256:input.hashes.manifest})),
        registry_sha256:assetHashes.registry, geography, selection:{...view.filters},sort:view.sort,view_url:pageURL,
        result:{row_count:rows.length,ordered_event_ids:rows.map(e=>e.id),ordered_source_keys:rows.map(e=>({catalog:e._catalog_id,id:e.source_event_id}))},
        predicate_rules:{...queryDocument({view,catalog:inputs[0].catalog,manifest:inputs[0].manifest,assetHashes:inputs[0].hashes,rows:[],pageURL,createdUTC}).predicate_rules,
          composition:'All packaged rows retained in registry order. Composite key catalogId~packagedId. Exact USGS shared identifiers flagged; no cross-provider event reconciliation or deduplication.',
          country:'Exact match to the derived country_id in the hash-identified land-polygon index; offshore/outside, boundary/ambiguous and invalid remain separate.'},
        limits:['Counts are source records, not unique or independent earthquakes. Coverage windows and source semantics differ. Shared USGS IDs are flagged, not removed.',
          'Proximity across providers does not establish event identity. No cross-provider duplicate matching is inferred.',
          'Country/territory labels describe generalized land polygons, not nationality, maritime jurisdiction or authoritative coast/border membership.',
          'Map extent and presentation do not alter the exported selection. Magnitude scales remain unconverted; missing depths and uncertainties remain unknown.']};
    }
    // Preserve source-declared clocks and transformations without inventing a
    // server acquisition time or interpreting the provider's status vocabulary.
    const sourceEvidence = Object.fromEntries(['official_catalogue','rights','source_header','source_footer','query','time_basis','source_timing','raw_rows','packaged_records','selection','transformations','field_availability','field_semantics','identifier_derivation']
      .filter(key => Object.hasOwn(manifest,key)).map(key => [key,manifest[key]]));
    return {
      schema: view.filters.country ? 'seismic-local-query/4' : 'seismic-local-query/3', created_utc: createdUTC,
      engine: 'Seismic Data Observatory browser-local filter, version '+(view.filters.country ? '4' : '3'),
      catalog: {id: catalog?.id || view.catalog || legacyCatalog, provider: catalog?.provider || 'usgs',
        provider_name: catalog?.provider_name || 'U.S. Geological Survey', role: catalog?.role,
        bounds: catalog?.bounds, years: catalog?.years, minimum_magnitude: catalog?.minimum_magnitude,
        snapshot: catalog?.snapshot, provider_url: catalog?.provider_url},
      input: {events_path: catalog?.events_url || 'data/events.json', events_sha256: assetHashes.events,
        manifest_path: catalog?.manifest_url || 'data/manifest.json', manifest_sha256: assetHashes.manifest,
        registry_path: 'data/catalogs.json', registry_sha256: assetHashes.registry,
        snapshot_repository: manifest.snapshot_repository, snapshot_commit: manifest.snapshot_commit,
        source_files: manifest.files, packaged_event_type: catalog && catalog.provider !== 'usgs' ? null : 'earthquake',
        identifier_kind: catalog?.identifier_kind || manifest.identifier_kind || 'source_event_id',
        depth_unit: catalog?.depth_unit_status === 'not_documented_in_source' || manifest.depth_unit_status === 'not_documented_in_source' ? null
          : catalog?.depth_unit ?? manifest.depth_unit ?? (!catalog || catalog.provider === 'usgs' ? 'km' : null),
        raw_fields: (fields || Object.keys(rows[0] || {})).filter(key => key.startsWith('raw_')),
        ...sourceEvidence,
        coordinates: 'Original reported coordinates. Any antimeridian shift is display-only.'},
      ...(geography ? {geography} : {}), selection: {...view.filters}, sort: view.sort,
      predicate_rules: {
        year: 'Inclusive UTC origin-time year bounds.', magnitude: 'Inclusive reported values; exact magType match; no scale conversion.',
        depth: 'Inclusive maximum; null depth included only when depthMax is the default 1000.',
        missingOnly: 'When true require horizontalError === null; unknown is never zero.',
        unmOnly: {enabled: view.filters.unmOnly === true, fields: ['locationSource', 'magSource'],
          operator: 'OR', accepted_literal_codes: [...unmSourceCodes], comparison: 'Exact case-sensitive equality; no substring or inferred agency.',
          scope: 'SSN/UNAM attribution within the fixed Mexico ComCat catalogue. The distributor remains USGS; this is not an independent SSN catalogue.'},
        search: 'Trimmed case-insensitive substring of event ID or reported place; NFD combining accents removed for comparison only. Original text is retained.',
        originSource: 'Exact locationSource match; not a country assignment.',
        country:'Exact match to derived country_id from generalized Natural Earth land polygons. Offshore/outside and boundary/ambiguous remain separate; no nearest-country or place-name inference.',
        missing_magnitude_type: 'The sentinel __missing__ selects absent magnitude types.',
        sort_ties: 'mag uses descending origin time as a tiebreaker; time ties preserve packaged row order.',
        map: 'Map bounds, zoom, language, selected event and tab do not alter the filter or CSV.'
      },
      result: {row_count: rows.length, ordered_event_ids: rows.map(e => e.id)},
      view_url: pageURL,
      limits: [
        catalog && catalog.provider !== 'usgs'
          ? 'This describes a local query over the identified packaged bytes, not an equivalent remote catalogue request.'
          : 'This describes a local query over the identified packaged bytes, not an equivalent live ComCat request.',
        'Only one catalog is selected. Different provider catalogs can share observations; their counts are not additive or independent validation.',
        'UNM attribution uses only the reported unm and us_unm field values; it does not import the historical SSN SQL, restore original SSN identifiers or provide the complete current SSN catalogue.',
        'A live ComCat response can change and cannot replace this snapshot when reproducing the result.',
        'The regional rectangle includes offshore and neighbouring areas; no event nationality is inferred.',
        'Reported magnitude types are not interchangeable; missing uncertainties remain unknown.',
        'Counts and epicenters do not estimate earthquake probability, shaking or damage.',
        'The separate USGS retained-revision pilot does not reconstruct complete past catalogue states or native SSN revision histories.',
        ...(catalog?.provider === 'ssn' ? [
          'SSN status values are source-reported literals; verified is not converted to ComCat reviewed, and no status transition or revision date is inferred.',
          'The SSN CSV supplies native UTC and local-time columns, not original event IDs, magnitude types, event types, uncertainty estimates or author fields. Absent fields remain unknown.',
          'A requested time window, the latest observed record, source header generation time and filesystem modification time are distinct. Coverage does not establish completeness; no local-time offset is imputed.'
        ] : [])
      ]
    };
  }
  return {defaults, defaultCatalog, legacyCatalog, unmSourceCodes, isUnmAttributed, catalogDefaults, catalogFromURL, validateFilters, validMap, parseURL, serialize, filterEvents, queryDocument};
});
