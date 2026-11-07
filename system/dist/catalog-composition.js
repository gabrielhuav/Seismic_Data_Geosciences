(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeismicCatalogComposition = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const combinedId = 'all-catalogs';
  const provenanceFields = Object.freeze(['source_event_id', 'catalog_id', 'data_provider', 'source_snapshot',
    'source_identifier_kind', 'depth_unit', 'country_id', 'shared_event_id', 'duplicate_group']);
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = reason => {throw new Error('Invalid catalogue composition: ' + reason);};

  function depthUnit(catalog, manifest) {
    if (catalog.depth_unit_status === 'not_documented_in_source' || manifest.depth_unit_status === 'not_documented_in_source') return null;
    return catalog.depth_unit === 'km' || manifest.depth_unit === 'km' || catalog.provider === 'usgs' ? 'km' : null;
  }

  function identifierKind(catalog, manifest) {
    return catalog.identifier_kind || manifest.identifier_kind || (catalog.provider === 'usgs' ? 'source_event_id' : 'unknown');
  }

  function validatePack(pack, seenCatalogs) {
    if (!pack || typeof pack !== 'object') fail('pack must be an object');
    const {catalog, fields, events, manifest, hashes} = pack;
    if (!catalog || !/^[A-Za-z0-9_-]+$/.test(catalog.id || '') || catalog.id === combinedId) fail('catalogue identifier');
    if (seenCatalogs.has(catalog.id)) fail('repeated catalogue ' + catalog.id);
    seenCatalogs.add(catalog.id);
    if (typeof catalog.provider !== 'string' || !catalog.provider || catalog.provider === 'all') fail('provider');
    if (!Array.isArray(fields) || !fields.includes('id') || fields.some(f => typeof f !== 'string' || !f) || new Set(fields).size !== fields.length) fail('fields');
    if (!Array.isArray(events) || !manifest || typeof manifest !== 'object' || !hashes || typeof hashes !== 'object') fail('events, manifest or hashes');
    if (!Array.isArray(catalog.years) || catalog.years.length !== 2 || !catalog.years.every(Number.isFinite) || catalog.years[0] > catalog.years[1]) fail('year bounds');
    if (!Number.isFinite(catalog.minimum_magnitude)) fail('minimum magnitude');
    if (!Array.isArray(catalog.bounds) || catalog.bounds.length !== 2 || catalog.bounds.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) fail('geographic bounds');
    if (catalog.bounds[0][0] > catalog.bounds[1][0] || catalog.bounds[0][1] > catalog.bounds[1][1]) fail('inverted geographic bounds');
    const seen = new Set();
    for (const event of events) {
      if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !event.id || event.id.includes('~')) fail('record identifier');
      if (seen.has(event.id)) fail('repeated record identifier within ' + catalog.id);
      seen.add(event.id);
      // Source packages must not silently override the composite provenance columns.
      for (const key of provenanceFields) {
        if (key !== 'country_id' && Object.hasOwn(event, key)) fail('reserved provenance field ' + key);
      }
    }
  }

  function combine(packs) {
    if (!Array.isArray(packs) || !packs.length) fail('at least one source package is required');
    const seenCatalogs = new Set();
    for (const pack of packs) validatePack(pack, seenCatalogs);
    const fields = [...new Set(packs.flatMap(pack => pack.fields))];
    for (const key of provenanceFields) if (!fields.includes(key)) fields.push(key);
    // Only an identical ComCat identifier in separate USGS packages is flagged.
    // Spatial/temporal proximity across distributors never establishes identity.
    const usgsIds = new Map();
    let usgsRows = 0;
    for (const {catalog, events} of packs) if (catalog.provider === 'usgs') {
      usgsRows += events.length;
      for (const event of events) {
        if (!usgsIds.has(event.id)) usgsIds.set(event.id, new Set());
        usgsIds.get(event.id).add(catalog.id);
      }
    }
    const shared = new Set([...usgsIds].filter(([, catalogs]) => catalogs.size > 1).map(([id]) => id));
    const events = [];
    for (const {catalog, fields:sourceFields, events:rows, manifest} of packs) {
      const snapshot = catalog.snapshot ?? manifest.snapshot_commit ?? null;
      const kind = identifierKind(catalog, manifest), unit = depthUnit(catalog, manifest);
      const sourceColumns = new Set(sourceFields);
      for (const row of rows) {
        const event = {};
        for (const key of fields) event[key] = sourceColumns.has(key) || key === 'country_id' ? row[key] ?? null : null;
        // Retain computed client fields (e.g. UTC year) without adding them to CSV.
        for (const [key, value] of Object.entries(row)) if (!Object.hasOwn(event, key)) event[key] = value;
        const sharedId = catalog.provider === 'usgs' && shared.has(row.id);
        Object.assign(event, {id: catalog.id + '~' + row.id, source_event_id:row.id, catalog_id:catalog.id,
          data_provider:catalog.provider, source_snapshot:snapshot, source_identifier_kind:kind,
          depth_unit:unit, shared_event_id:sharedId, duplicate_group:sharedId ? 'usgs:' + row.id : null,
          _catalog_id:catalog.id});
        events.push(event);
      }
    }
    const bounds = [[Math.min(...packs.map(p => p.catalog.bounds[0][0])), Math.min(...packs.map(p => p.catalog.bounds[0][1]))],
      [Math.max(...packs.map(p => p.catalog.bounds[1][0])), Math.max(...packs.map(p => p.catalog.bounds[1][1]))]];
    // Bounds use the same western antimeridian display convention as the map.
    // Original event coordinates are never shifted by this composition.
    bounds[0][1] = Math.max(-210, bounds[0][1]);bounds[1][1] = Math.min(180, bounds[1][1]);
    const catalog = {id:combinedId, provider:'all', provider_name:'Multiple catalogue distributors',
      label:{es:'Todos los catálogos · vista conjunta', en:'All catalogues · combined view'},
      years:[Math.min(...packs.map(p => p.catalog.years[0])), Math.max(...packs.map(p => p.catalog.years[1]))],
      minimum_magnitude:Math.min(...packs.map(p => p.catalog.minimum_magnitude)), bounds,
      role:'combined_exploration', event_count:events.length, record_count:events.length, count_unit:'records',
      identifier_kind:'catalogue_qualified_record_key', depth_unit:null,
      depth_unit_status:'per_record', events_bytes:packs.reduce((n,p) => n + (p.catalog.events_bytes || 0),0)};
    const inputs = packs.map(({catalog, fields, manifest, hashes}) => ({catalog:copy(catalog), fields:[...fields], manifest:copy(manifest), hashes:copy(hashes)}));
    const hashes = {inputs:Object.fromEntries(inputs.map(p => [p.catalog.id, copy(p.hashes)]))};
    const stats = {total_rows:events.length, usgs_rows:usgsRows, usgs_unique_event_ids:usgsIds.size,
      usgs_shared_event_ids:shared.size, usgs_extra_rows:usgsRows - usgsIds.size};
    const manifest = {schema_version:1, composition_schema:'seismic-catalogue-composition/1', files:[],
      identifier_kind:'catalogue_qualified_record_key', depth_unit:null, depth_unit_status:'per_record',
      packaged_records:events.length, inputs, stats,
      composition_rule:'Preserve every packaged row in catalogue input order; no deduplication or cross-provider event matching.',
      overlap_rule:'shared_event_id and duplicate_group flag only exact source identifiers present in more than one USGS catalogue. No cross-provider identity is inferred.',
      identifier_rule:'id qualifies the original packaged key by catalogue. source_event_id retains that packaged key; source_identifier_kind distinguishes official event IDs from derived row keys.',
      limits:['Counts describe source records, not distinct earthquakes or independent observations.',
        'Country labels, when present, describe a separate geographic overlay and are not inferred from the distributor.',
        'Unknown source fields remain null; magnitude scales, clocks and status vocabularies are not harmonized.',
        'Source rights, hashes, files, coverage and field semantics remain separate in inputs.']};
    return {events, fields, manifest, catalog, hashes, inputs, stats};
  }
  return {combinedId, provenanceFields, combine};
});
