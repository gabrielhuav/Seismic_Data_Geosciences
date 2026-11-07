(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeismicAnalytics = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const csvFields = Object.freeze(['scope', 'catalog', 'mag_type', 'metric', 'value', 'n', 'unit']);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const limits = Object.freeze([
    'Counts describe selected source records, not unique or independent physical earthquakes.',
    'Magnitude summaries are separated by catalogue and exact reported type; unknown types remain a separate numerical group, not a homogenized scale.',
    'Depth summaries and magnitude-depth correlations use only documented kilometre values.',
    'Zero selected records in a calendar bin do not establish absence of physical earthquakes or catalogue completeness.',
    'Descriptive association does not establish causation, earthquake probability, hazard or a forecast.'
  ]);

  function describe(values) {
    const sorted = values.filter(finite).sort((a, b) => a - b);
    const n = sorted.length;
    if (!n) return {n:0, mean:null, median:null, min:null, max:null, sample_sd:null};
    let mean = 0, m2 = 0, count = 0;
    for (const value of sorted) {
      const delta = value - mean;
      mean += delta / ++count;
      m2 += delta * (value - mean);
    }
    const middle = Math.floor(n / 2);
    return {n, mean, median:n % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2,
      min:sorted[0], max:sorted[n - 1], sample_sd:n > 1 ? Math.sqrt(Math.max(0, m2 / (n - 1))) : null};
  }

  function correlation(pairs, knownType) {
    const n = pairs.length;
    if (!knownType) return {n, pearson_r:null, reason:'unknown_magnitude_type'};
    if (n < 3) return {n, pearson_r:null, reason:'fewer_than_three_pairs'};
    let meanX = 0, meanY = 0, sumXX = 0, sumYY = 0, sumXY = 0, count = 0;
    for (const [x, y] of pairs) {
      count++;
      const dx = x - meanX, dy = y - meanY;
      meanX += dx / count;meanY += dy / count;
      sumXX += dx * (x - meanX);sumYY += dy * (y - meanY);sumXY += dx * (y - meanY);
    }
    if (!(sumXX > 0) || !(sumYY > 0)) return {n, pearson_r:null, reason:'constant_variable'};
    return {n, pearson_r:Math.max(-1, Math.min(1, sumXY / Math.sqrt(sumXX * sumYY))), reason:null};
  }

  function yearOf(row) {
    if (typeof row.time === 'string' && /^\d{4}-\d\d-\d\dT/.test(row.time)) {
      const timestamp = Date.parse(row.time);
      if (Number.isFinite(timestamp)) return new Date(timestamp).getUTCFullYear();
    }
    return Number.isInteger(row.year) ? row.year : null;
  }

  function documentedDepth(row, catalog) {
    if (catalog?.depth_unit_status === 'not_documented_in_source') return false;
    if (Object.hasOwn(row, 'depth_unit')) return row.depth_unit === 'km';
    return catalog?.depth_unit === 'km' || catalog?.provider === 'usgs';
  }

  function summarize(rows, options = {}) {
    if (!Array.isArray(rows)) throw new TypeError('Descriptive rows must be an array');
    const catalogs = Array.isArray(options.catalogs) ? options.catalogs : [];
    const byCatalog = new Map(catalogs.filter(c => c && typeof c.id === 'string').map(c => [c.id, c]));
    const fallbackCatalog = byCatalog.size === 1 ? [...byCatalog.keys()][0] : null;
    const perCatalog = new Map([...byCatalog].map(([id, c]) => [id, {catalog_id:id, data_provider:c.provider || null, record_count:0}]));
    const groups = new Map(), years = new Map();
    let missingYearCount = 0;
    for (const row of rows) {
      if (!row || typeof row !== 'object') throw new TypeError('Each descriptive row must be an object');
      const id = row._catalog_id || row.catalog_id || fallbackCatalog;
      if (typeof id !== 'string' || !id) throw new TypeError('Catalogue identity is required for each descriptive row');
      const catalog = byCatalog.get(id);
      if (!perCatalog.has(id)) perCatalog.set(id, {catalog_id:id, data_provider:row.data_provider || catalog?.provider || null, record_count:0});
      perCatalog.get(id).record_count++;
      const type = typeof row.magType === 'string' && row.magType.length ? row.magType : null;
      const key = JSON.stringify([id, type]);
      if (!groups.has(key)) groups.set(key, {catalog_id:id, mag_type:type, n:0, magnitudes:[], depths:[], pairs:[]});
      const group = groups.get(key);group.n++;
      if (finite(row.mag)) group.magnitudes.push(row.mag);
      const depthValid = documentedDepth(row, catalog) && finite(row.depth);
      if (depthValid) group.depths.push(row.depth);
      if (finite(row.mag) && depthValid) group.pairs.push([row.mag, row.depth]);
      const year = yearOf(row);
      if (year === null) missingYearCount++;else years.set(year, (years.get(year) || 0) + 1);
    }
    const filters = options.filters || {};
    const observedYears = [...years.keys()];
    const requestedFrom = Number(filters.yearFrom), requestedTo = Number(filters.yearTo);
    let from = filters.yearFrom !== null && filters.yearFrom !== undefined && filters.yearFrom !== '' && Number.isInteger(requestedFrom) ? requestedFrom : observedYears.length ? Math.min(...observedYears) : null;
    let to = filters.yearTo !== null && filters.yearTo !== undefined && filters.yearTo !== '' && Number.isInteger(requestedTo) ? requestedTo : observedYears.length ? Math.max(...observedYears) : null;
    if (from !== null && to !== null && (from > to || to - from > 1000)) throw new RangeError('Invalid descriptive year range');
    const annual = [];
    if (from !== null && to !== null) for (let year = from; year <= to; year++) annual.push({year, record_count:years.get(year) || 0});
    const resultGroups = [...groups.values()].map(group => ({catalog_id:group.catalog_id, mag_type:group.mag_type, n:group.n,
      magnitude:describe(group.magnitudes), depth_km:describe(group.depths), magnitude_depth:correlation(group.pairs, group.mag_type !== null)}));
    return {schema:'seismic-descriptive-summary/1', count_unit:'source_records', record_count:rows.length,
      missing_year_count:missingYearCount, per_catalog:[...perCatalog.values()], annual_counts:annual,
      groups:resultGroups, filters:copy(options.filters || {}), created_utc:options.createdUTC || null,
      limits:[...limits]};
  }

  function csvRows(summary) {
    if (!summary || summary.schema !== 'seismic-descriptive-summary/1') throw new TypeError('Unsupported descriptive summary');
    const rows = [];
    function add(scope, catalog, type, metric, value, n, unit) {rows.push({scope, catalog, mag_type:type, metric, value, n, unit});}
    add('selection', null, null, 'record_count', summary.record_count, summary.record_count, 'source_records');
    add('selection', null, null, 'missing_year_count', summary.missing_year_count, summary.record_count, 'source_records');
    for (const catalog of summary.per_catalog) add('catalogue', catalog.catalog_id, null, 'record_count', catalog.record_count, catalog.record_count, 'source_records');
    for (const annual of summary.annual_counts) add('annual', null, null, String(annual.year), annual.record_count, annual.record_count, 'source_records');
    for (const group of summary.groups) {
      add('group', group.catalog_id, group.mag_type, 'record_count', group.n, group.n, 'source_records');
      for (const [field, unit] of [['magnitude', 'reported_magnitude'], ['depth_km', 'km']]) {
        for (const metric of ['mean', 'median', 'min', 'max', 'sample_sd']) add('group', group.catalog_id, group.mag_type,
          field + '_' + metric, group[field][metric], group[field].n, unit);
      }
      add('group', group.catalog_id, group.mag_type, 'magnitude_depth_pearson_r', group.magnitude_depth.pearson_r,
        group.magnitude_depth.n, 'dimensionless');
    }
    return rows;
  }

  return Object.freeze({summarize, csvRows, csvFields});
});
