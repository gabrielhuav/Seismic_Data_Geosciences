(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeismicResearchCharts = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const typeOf = row => typeof row.magType === 'string' && row.magType.length ? row.magType : null;
  const documentedDepth = (row, catalog) => {
    if (catalog?.depth_unit_status === 'not_documented_in_source') return false;
    if (Object.hasOwn(row, 'depth_unit')) return row.depth_unit === 'km';
    return catalog?.depth_unit === 'km' || catalog?.provider === 'usgs';
  };
  function extent(values) {
    let min = Infinity, max = -Infinity;
    for (const value of values) {if (value < min) min = value;if (value > max) max = value;}
    return values.length ? [min, max] : null;
  }
  // Compare against the actual bin boundaries rather than rounding reported M.
  // This also corrects floating-point multiplication at a decimal bin edge.
  function magnitudeBin(value) {
    let index = Math.floor(value * 5);
    if (!Number.isSafeInteger(index)) throw new RangeError('Magnitude is outside the supported plotting range');
    while (value < index / 5) index--;
    while (value >= (index + 1) / 5) index++;
    return index;
  }
  function distribution(rows, options = {}) {
    if (!Array.isArray(rows)) throw new TypeError('Chart rows must be an array');
    if (typeof options.catalogId !== 'string' || !options.catalogId) throw new TypeError('A selected catalogue identity is required');
    const selectedType = typeof options.magType === 'string' && options.magType.length ? options.magType : null;
    const catalogs = Array.isArray(options.catalogs) ? options.catalogs : [];
    const byCatalog = new Map(catalogs.filter(c => c && typeof c.id === 'string').map(c => [c.id, c]));
    const fallback = byCatalog.size === 1 ? [...byCatalog.keys()][0] : null;
    const catalog = byCatalog.get(options.catalogId);
    const magnitudes = [], pairs = [];
    let recordCount = 0;
    for (const row of rows) {
      if (!row || typeof row !== 'object') throw new TypeError('Each chart row must be an object');
      const id = row._catalog_id || row.catalog_id || fallback;
      if (typeof id !== 'string' || !id) throw new TypeError('Catalogue identity is required for each chart row');
      if (id !== options.catalogId || typeOf(row) !== selectedType) continue;
      recordCount++;
      if (!finite(row.mag)) continue;
      magnitudes.push(row.mag);
      if (documentedDepth(row, catalog) && finite(row.depth)) pairs.push({magnitude:row.mag, depth:row.depth, count:1});
    }
    const counts = new Map();
    for (const magnitude of magnitudes) {const index = magnitudeBin(magnitude);counts.set(index, (counts.get(index) || 0) + 1);}
    const indices = [...counts.keys()], bounds = extent(indices), bins = [];
    if (bounds && bounds[1] - bounds[0] > 10000) throw new RangeError('Magnitude span exceeds the supported plotting range');
    if (bounds) for (let index = bounds[0]; index <= bounds[1]; index++) bins.push({lower:index / 5, upper:(index + 1) / 5, count:counts.get(index) || 0});
    const magnitudeExtent = extent(pairs.map(p => p.magnitude)), depthExtent = extent(pairs.map(p => p.depth));
    let points = pairs, mode = 'points', grid = null;
    if (pairs.length > 3000) {
      mode = 'density';
      const columns = magnitudeExtent[0] === magnitudeExtent[1] ? 1 : 48;
      const rows = depthExtent[0] === depthExtent[1] ? 1 : 28;
      const xStep = columns === 1 ? .2 : (magnitudeExtent[1] - magnitudeExtent[0]) / columns;
      const yStep = rows === 1 ? 1 : (depthExtent[1] - depthExtent[0]) / rows;
      const xStart = columns === 1 ? magnitudeExtent[0] - .1 : magnitudeExtent[0];
      const yStart = rows === 1 ? depthExtent[0] - .5 : depthExtent[0];
      const xEnd = columns === 1 ? xStart + xStep : magnitudeExtent[1];
      const yEnd = rows === 1 ? yStart + yStep : depthExtent[1];
      const cellIndex = (value, start, step, length) => {
        let index = Math.max(0,Math.min(length - 1,Math.floor((value - start) / step)));
        // Correct division roundoff by comparing the unrounded observation with
        // the actual boundaries. Only the outermost upper edge is inclusive.
        while (index > 0 && value < start + index * step) index--;
        while (index < length - 1 && value >= start + (index + 1) * step) index++;
        return index;
      };
      const cells = new Map();
      for (const pair of pairs) {
        const x = cellIndex(pair.magnitude,xStart,xStep,columns);
        const y = cellIndex(pair.depth,yStart,yStep,rows);
        const key = x + ':' + y;
        if (!cells.has(key)) cells.set(key, {x,y,count:0});
        cells.get(key).count++;
      }
      points = [...cells.values()].map(cell => ({magnitude:xStart + (cell.x + .5) * xStep, depth:yStart + (cell.y + .5) * yStep,
        x0:xStart + cell.x * xStep, x1:cell.x === columns - 1 ? xEnd : xStart + (cell.x + 1) * xStep,
        y0:yStart + cell.y * yStep, y1:cell.y === rows - 1 ? yEnd : yStart + (cell.y + 1) * yStep,
        x_upper_inclusive:cell.x === columns - 1, y_upper_inclusive:cell.y === rows - 1, count:cell.count}));
      grid = {columns, rows, magnitude_extent:[xStart,xEnd], depth_extent:[yStart,yEnd]};
    }
    return {schema:'seismic-chart-distribution/1', catalog_id:options.catalogId, mag_type:selectedType, count_unit:'source_records',
      record_count:recordCount, magnitude_count:magnitudes.length, missing_magnitude_count:recordCount - magnitudes.length,
      depth_pair_count:pairs.length, missing_depth_pair_count:recordCount - pairs.length,
      bin_width:.2, bins, points, scatter_mode:mode, scatter_grid:grid,
      magnitude_extent:extent(magnitudes), paired_magnitude_extent:magnitudeExtent, depth_extent:depthExtent};
  }

  // The wider axis margins accommodate the same SVG when small-screen CSS
  // increases text to 22 viewBox units (about 11 CSS px at half width).
  // Data and bin counts remain unchanged; no second mobile series is created.
  const box = {left:100, right:690, top:45, bottom:240};
  function settings(options = {}) {
    return {labels:{title:'Selected source records',x:'Reported magnitude',y:'Source records',empty:'No valid values in this group',density:'Binned source-record counts; no sampling',records:'source records',...options.labels},
      format:typeof options.format === 'function' ? options.format : (n, dec = 1) => Number(n).toLocaleString('en', {maximumFractionDigits:dec}),
      colors:{ink:'#233a4a',muted:'#607584',grid:'#dce6ea',accent:'#137f83',secondary:'#c05e31',paper:'#ffffff',...options.colors}};
  }
  const pos = n => Number(n.toFixed(4));
  const xScale = (n, min, max) => box.left + (n - min) / (max - min) * (box.right - box.left);
  const yScale = (n, min, max) => box.bottom - (n - min) / (max - min) * (box.bottom - box.top);
  function base(s, description) {
    return `<title>${esc(s.labels.title)}</title><desc>${esc(description)}</desc><g font-family="system-ui, sans-serif" font-size="11" fill="${esc(s.colors.muted)}">`;
  }
  function noValues(s) {
    return base(s, s.labels.empty) + `<text x="360" y="145" text-anchor="middle" font-size="15">${esc(s.labels.empty)}</text></g>`;
  }
  function frame(s, xMin, xMax, yMin, yMax, integerY = false) {
    let markup = '';
    const seenY = new Set();
    for (let i = 0; i <= 4; i++) {
      const raw = yMin + (yMax - yMin) * i / 4, tick = integerY ? Math.round(raw) : raw;
      if (seenY.has(tick)) continue;seenY.add(tick);
      const y = pos(yScale(tick, yMin, yMax));
      markup += `<line x1="${box.left}" x2="${box.right}" y1="${y}" y2="${y}" stroke="${esc(s.colors.grid)}" stroke-dasharray="3 5"/><text x="${box.left - 12}" y="${y + 4}" text-anchor="end">${esc(s.format(tick, integerY ? 0 : 1))}</text>`;
    }
    for (let i = 0; i <= 5; i++) {
      const tick = xMin + (xMax - xMin) * i / 5;
      markup += `<text x="${pos(xScale(tick, xMin, xMax))}" y="268" text-anchor="middle">${esc(s.format(tick, 1))}</text>`;
    }
    markup += `<line x1="${box.left}" x2="${box.right}" y1="${box.bottom}" y2="${box.bottom}" stroke="${esc(s.colors.grid)}"/><text x="${box.left}" y="24" font-size="11" fill="${esc(s.colors.ink)}">${esc(s.labels.y)}</text><text x="395" y="295" text-anchor="middle" font-size="12" fill="${esc(s.colors.ink)}">${esc(s.labels.x)}</text>`;
    return markup;
  }
  function svgHistogram(model, options = {}) {
    const s = settings(options);
    if (!model?.bins?.length) return noValues(s);
    const xMin = model.bins[0].lower, xMax = model.bins[model.bins.length - 1].upper;
    const yMax = Math.max(1, ...model.bins.map(bin => bin.count));
    let markup = base(s, `${model.magnitude_count} ${s.labels.records}; M bins [lower, upper), width 0.2.`) + frame(s, xMin, xMax, 0, yMax, true);
    for (const bin of model.bins) {
      const x = xScale(bin.lower, xMin, xMax), next = xScale(bin.upper, xMin, xMax);
      const y = yScale(bin.count, 0, yMax);
      markup += `<rect x="${pos(x + 1)}" y="${pos(y)}" width="${pos(Math.max(.1,next - x - 2))}" height="${pos(box.bottom - y)}" rx="2" fill="${esc(s.colors.accent)}" opacity=".88"><title>[${esc(s.format(bin.lower, 1))}, ${esc(s.format(bin.upper, 1))}): ${esc(s.format(bin.count, 0))} ${esc(s.labels.records)}</title></rect>`;
    }
    return markup + '</g>';
  }
  function padded(bounds, fallback) {
    const [min,max] = bounds;
    const pad = max === min ? fallback : (max - min) * .05;
    return [min - pad,max + pad];
  }
  function svgScatter(model, options = {}) {
    const s = settings(options);
    if (!model?.points?.length || !model.depth_extent) return noValues(s);
    const xExtent = model.scatter_grid?.magnitude_extent || model.paired_magnitude_extent;
    const yExtent = model.scatter_grid?.depth_extent || model.depth_extent;
    const [xMin,xMax] = padded(xExtent,.1), [yMin,yMax] = padded(yExtent,1);
    const density = model.scatter_mode === 'density';
    let markup = base(s, `${model.depth_pair_count} ${s.labels.records}. ${density ? s.labels.density : 'Every valid reported pair is plotted.'}`) + frame(s, xMin, xMax, yMin, yMax);
    const maxCount = Math.max(1, ...model.points.map(point => point.count));
    for (const point of model.points) {
      if (density) {
        const x = xScale(point.x0, xMin, xMax), right = xScale(point.x1, xMin, xMax);
        const y = yScale(point.y1, yMin, yMax), bottom = yScale(point.y0, yMin, yMax);
        const opacity = .22 + .78 * Math.sqrt(point.count / maxCount);
        const decimals = span => Math.max(3,Math.min(12,Math.ceil(-Math.log10(span)) + 1));
        const xDecimals = decimals(point.x1 - point.x0), yDecimals = decimals(point.y1 - point.y0);
        markup += `<rect x="${pos(x)}" y="${pos(y)}" width="${pos(right - x)}" height="${pos(bottom - y)}" rx="1" fill="${esc(s.colors.accent)}" opacity="${pos(opacity)}"><title>M [${esc(s.format(point.x0, xDecimals))}, ${esc(s.format(point.x1, xDecimals))}${point.x_upper_inclusive ? ']' : ')'}; km [${esc(s.format(point.y0, yDecimals))}, ${esc(s.format(point.y1, yDecimals))}${point.y_upper_inclusive ? ']' : ')'}: ${esc(s.format(point.count, 0))} ${esc(s.labels.records)}</title></rect>`;
      } else {
        markup += `<circle cx="${pos(xScale(point.magnitude,xMin,xMax))}" cy="${pos(yScale(point.depth,yMin,yMax))}" r="3.1" fill="${esc(s.colors.accent)}" fill-opacity=".55" stroke="${esc(s.colors.paper)}" stroke-width=".5"><title>M ${esc(s.format(point.magnitude, 3))} · ${esc(s.format(point.depth, 3))} km</title></circle>`;
      }
    }
    if (density) markup += `<text class="chart-density-note" x="${box.right}" y="24" text-anchor="end" font-size="10">${esc(s.labels.density)}</text>`;
    return markup + '</g>';
  }
  function svgAnnual(annual, options = {}) {
    const s = settings(options);
    if (!Array.isArray(annual) || !annual.length) return noValues(s);
    if (annual.some(row => !Number.isInteger(row.year) || !Number.isInteger(row.record_count) || row.record_count < 0)) throw new TypeError('Annual chart requires integer UTC years and nonnegative record counts');
    const from = Math.min(...annual.map(row => row.year)), to = Math.max(...annual.map(row => row.year));
    const xMin = from - .5, xMax = to + .5, yMax = Math.max(1,...annual.map(row => row.record_count));
    let markup = base(s, annual.map(row => `${row.year}: ${row.record_count}`).join('; ') + ` ${s.labels.records}.`) + frame(s,xMin,xMax,0,yMax,true);
    // Use exact year labels instead of fractional ticks from the generic frame.
    markup = markup.replace(/<text x="[\d.]+" y="268"[^>]*>[^<]*<\/text>/g, '');
    const tickStep = Math.max(1,Math.ceil(annual.length / 7)), ticks = new Set([from,to]);
    for (let year = from; year <= to; year += tickStep) ticks.add(year);
    const width = Math.max(.4,(box.right - box.left) / (to - from + 1) * .72);
    for (const row of annual) {
      const x = xScale(row.year,xMin,xMax), y = yScale(row.record_count,0,yMax);
      markup += `<rect x="${pos(x - width / 2)}" y="${pos(y)}" width="${pos(width)}" height="${pos(box.bottom - y)}" rx="2" fill="${esc(s.colors.accent)}" opacity=".86"><title>${row.year}: ${esc(s.format(row.record_count,0))} ${esc(s.labels.records)}</title></rect>`;
    }
    for (const year of ticks) markup += `<text x="${pos(xScale(year,xMin,xMax))}" y="268" text-anchor="middle">${year}</text>`;
    return markup + '</g>';
  }
  return Object.freeze({distribution,svgHistogram,svgScatter,svgAnnual});
});
