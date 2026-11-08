'use strict';

// Cartographic services are independent of the earthquake catalogue providers.
window.SeismicBasemaps = Object.freeze({
  local: {labelKey:'baseLocal',statusKey:'baseLocalNote'},
  osm: {labelKey:'baseOsm',statusKey:'baseOsmNote',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'},
  'osm-hot': {labelKey:'baseOsmHot',statusKey:'baseOsmHotNote',url:'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',subdomains:'abc',
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> / ODbL · <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a> · <a href="https://www.openstreetmap.fr/usage/">OpenStreetMap France</a>'},
  'usgs-topo': {labelKey:'baseUsgs',statusKey:'baseUsgsNote',url:'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution:'<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">U.S. Geological Survey, National Geospatial Program</a> · USGS The National Map; USGS Global Ecosystems; U.S. Census Bureau; USFS; Natural Earth; U.S. Department of State HIU; NOAA NCEI'},
  'nasa-blue-marble': {labelKey:'baseNasa',statusKey:'baseNasaNote',maxNativeZoom:8,
    url:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=BlueMarble_ShadedRelief_Bathymetry&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_Level8&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg',
    attribution:'Imagery provided by <a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA Global Imagery Browse Services (GIBS), NASA ESDIS</a> · Blue Marble, August 2004'}
});

// Pure display transforms never replace the source coordinates used by exports.
window.SeismicMapGeometry = (function () {
  const displayLongitude = longitude => longitude > 0 ? longitude - 360 : longitude;
  // Rebuild each ring continuously, then shift the entire polygon. Raw GeoJSON and
  // event coordinates remain unchanged; shifting isolated vertices would tear Russia.
  function displayPolygon(rings) {
    let shellCenter;
    return rings.map((ring, index) => {
      const continuous = ring.map((point, i) => {
        let longitude = point[0];
        return [longitude, ...point.slice(1)];
      });
      for (let i = 1; i < continuous.length; i++) continuous[i][0] += 360 * Math.round((continuous[i - 1][0] - continuous[i][0]) / 360);
      const center = continuous.reduce((sum, p) => sum + p[0], 0) / Math.max(1, continuous.length);
      if (!index) shellCenter = center > 0 ? center - 360 : center;
      const shift = 360 * Math.round((shellCenter - center) / 360);
      return continuous.map(p => [p[0] + shift, ...p.slice(1)]);
    });
  }
  return {displayLongitude, displayPolygon};
})();

// Local cartography and one canvas keep geographic context independent of tile APIs.
window.createSeismicMap = function ({element, basemap, onSelect, onHighlight = () => {}, onViewChange = () => {}, onBaseChange = () => {}, onBaseStatus = () => {}, translate = key => key, formatNumber = String}) {
  let region = L.latLngBounds([[14, -190], [84, -50]]), activeBase = 'local', tiles = null, tileErrors = 0, selectedId = '', baseSelect = null, baseLabel = null;
  const baseSpecs=window.SeismicBasemaps;
  const color = (name, fallback) => window.getComputedStyle?.(document.documentElement).getPropertyValue(name).trim() || fallback;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const {displayLongitude, displayPolygon} = window.SeismicMapGeometry;
  const eventLatLng = event => [event.latitude, displayLongitude(event.longitude)];
  const visualBasemap = {...basemap, features: basemap.features.map(feature => {
    const g = feature.geometry;
    return {...feature, geometry: g.type === 'Polygon' ? {...g, coordinates: displayPolygon(g.coordinates)}
      : g.type === 'MultiPolygon' ? {...g, coordinates: g.coordinates.map(displayPolygon)} : g};
  })};
  const map = L.map(element, {
    preferCanvas: true, minZoom: 1.5, maxZoom: 12, zoomSnap: .25,
    maxBounds: [[-5, -210], [85, -40]], maxBoundsViscosity: .8,
    attributionControl: true, keyboard: true, zoomAnimation: !reducedMotion?.matches,
    fadeAnimation: !reducedMotion?.matches, markerZoomAnimation: !reducedMotion?.matches
  });
  reducedMotion?.addEventListener?.('change', event => {map.options.zoomAnimation = !event.matches;map.options.fadeAnimation = !event.matches;map.options.markerZoomAnimation = !event.matches;});
  map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
  const naturalAttribution = '<a href="https://www.naturalearthdata.com/about/terms-of-use/">Made with Natural Earth</a>';
  map.attributionControl.addAttribution(naturalAttribution);
  L.control.scale({imperial: false, maxWidth: 120}).addTo(map);
  const countryRenderer = L.canvas({padding: .25});
  const countryStyle = f => ({color: color('--map-boundary', '#889e97'), weight: .9,
    fillColor: f.properties.ADMIN === 'Mexico' ? color('--map-focus-land', '#f1e8ce') : color('--map-land', '#f0f2e8'), fillOpacity: 1});
  const countries = L.geoJSON(visualBasemap, {
    renderer: countryRenderer, interactive: false,
    style: countryStyle
  }).addTo(map);
  const labelPane = map.createPane('countryLabels');
  labelPane.style.zIndex = 420; labelPane.style.pointerEvents = 'none';
  const labelLayer = L.layerGroup().addTo(map);
  const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function countryIcon(properties) {
    const key = 'country.' + properties.ADMIN, translated = translate(key);
    return L.divIcon({className: 'country-label', iconSize: [130, 22], iconAnchor: [65, 11],
      html: safe(translated === key ? properties.NAME_EN || properties.ADMIN : translated)});
  }
  const labelSpecs = basemap.features.filter(f => Number.isFinite(f.properties.LABEL_X) && Number.isFinite(f.properties.LABEL_Y)).map(f => {
    const p = f.properties, major = ['Mexico', 'United States of America', 'Canada', 'Cuba'].includes(p.ADMIN);
    return {properties: p, minZoom: major ? 1.5 : 5, marker: L.marker([p.LABEL_Y, displayLongitude(p.LABEL_X)], {pane: 'countryLabels', interactive: false, keyboard: false, icon: countryIcon(p)})};
  });
  function labels() {labelLayer.clearLayers();if (activeBase !== 'local') return;for (const spec of labelSpecs) if (map.getZoom() >= spec.minZoom) {spec.marker.setIcon(countryIcon(spec.properties));labelLayer.addLayer(spec.marker);}}
  function basePickerLabels() {
    if(!baseSelect)return;
    baseLabel.textContent=translate('mapBase');baseSelect.setAttribute('aria-label',translate('mapBase'));
    for(const option of baseSelect.options)option.textContent=translate(baseSpecs[option.value].labelKey);
    baseSelect.value=activeBase;
  }
  function setBase(id, persist = true) {
    if (!Object.hasOwn(baseSpecs,id)) id = 'local';
    // Preserve Leaflet's remove observer, which clears the retired attribution.
    if (tiles) {tiles.off('tileerror');map.removeLayer(tiles);tiles = null;}
    activeBase = id;tileErrors = 0;
    if (id === 'local') {
      if (!map.hasLayer(countries)) countries.addTo(map);
      map.attributionControl.addAttribution(naturalAttribution);onBaseStatus('baseLocalNote');
    } else {
      map.removeLayer(countries);map.attributionControl.removeAttribution(naturalAttribution);
      const source=baseSpecs[id];
      // Only tiles in the user's current viewport are requested. No probes,
      // prefetch, offline downloads or periodic retries are performed.
      tiles = L.tileLayer(source.url, {attribution: source.attribution, maxZoom: 12,
        maxNativeZoom: source.maxNativeZoom ?? 12, ...(source.subdomains ? {subdomains:source.subdomains} : {}), updateWhenIdle: true, keepBuffer: 0}).addTo(map);
      tiles.on('tileerror', () => {
        tileErrors++;
        if (tileErrors >= 3 && activeBase === id) {setBase('local', false);onBaseStatus('baseFallback');onBaseChange('local');}
      });
      onBaseStatus(source.statusKey);
    }
    labels();basePickerLabels();if (persist) onBaseChange(id);
  }
  const baseControl=L.control({position:'topright'});
  baseControl.onAdd=()=>{
    const container=L.DomUtil.create('div','map-base-control'),label=document.createElement('label');
    baseLabel=document.createElement('span');baseSelect=document.createElement('select');baseSelect.id='mapBaseExpanded';
    for(const id of Object.keys(baseSpecs)){const option=document.createElement('option');option.value=id;baseSelect.append(option);}
    label.append(baseLabel,baseSelect);container.append(label);basePickerLabels();
    baseSelect.addEventListener('change',()=>setBase(baseSelect.value));
    baseSelect.addEventListener('keydown',event=>{if(!['Escape','Tab'].includes(event.key))event.stopPropagation();});
    L.DomEvent.disableClickPropagation(container);L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  baseControl.addTo(map);

  const EventsLayer = L.Layer.extend({
    onAdd(m) {
      this._map = m; this._canvas = L.DomUtil.create('canvas', 'epicenter-canvas leaflet-zoom-hide');
      this._canvas.setAttribute('aria-hidden', 'true');m.getPanes().overlayPane.appendChild(this._canvas);
      m.on('moveend zoomend resize viewreset', this.redraw, this);this.redraw();
    },
    onRemove(m) {m.off('moveend zoomend resize viewreset', this.redraw, this);this._canvas.remove();},
    redraw() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();if (!size.x || !size.y) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2), c = this._canvas;
      c.width = Math.round(size.x * ratio);c.height = Math.round(size.y * ratio);
      c.style.width = size.x + 'px';c.style.height = size.y + 'px';
      L.DomUtil.setPosition(c, this._map.containerPointToLayerPoint([0, 0]));
      const ctx = c.getContext('2d');ctx.setTransform(ratio, 0, 0, ratio, 0, 0);this.points = [];
      const colors = {unknown: color('--point-unknown', '#526f7a'), deep: color('--point-deep', '#bc5b1e'), shallow: color('--point-shallow', '#087568')};
      let selectedPoint;
      // Paint small symbols first so larger observations remain selectable and visible.
      for (const e of this.paintOrder || this.records || []) {
        const p = this._map.latLngToContainerPoint(eventLatLng(e));
        const radius = Math.max(2, (e.mag - 2.5) * 1.25);
        if (p.x < -radius || p.x > size.x + radius || p.y < -radius || p.y > size.y + radius) continue;
        this.points.push({x: p.x, y: p.y, radius, event: e});
        ctx.beginPath();ctx.globalAlpha = .7;ctx.fillStyle = e.depth === null ? colors.unknown : e.depth > 70 ? colors.deep : colors.shallow;
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);ctx.fill();
        if(radius>=3.5){ctx.globalAlpha=.85;ctx.lineWidth=.7;ctx.strokeStyle=color('--selection-halo','#fff');ctx.stroke();}
        if (e.id === selectedId) selectedPoint = {x:p.x,y:p.y,radius};
      }
      if (selectedPoint) {
        ctx.globalAlpha = 1;ctx.beginPath();ctx.arc(selectedPoint.x,selectedPoint.y,Math.max(8,selectedPoint.radius+4),0,Math.PI*2);
        ctx.lineWidth=5;ctx.strokeStyle=color('--selection-halo','#fff');ctx.stroke();
        ctx.lineWidth=2.5;ctx.strokeStyle=color('--point-selected','#9b4b00');ctx.stroke();
      }
      ctx.globalAlpha = 1;
      document.getElementById('mapStatus').textContent = translate('visible', {visible: formatNumber(this.points.length), filtered: formatNumber((this.records || []).length)});
    },
    setRecords(records) {this.records = records;this.paintOrder=[...records].sort((a,b)=>a.mag-b.mag);this.redraw();}
  });
  const events = new EventsLayer().addTo(map);
  let hoverStamp=0,hoverTip=null;
  map.on('mousemove', ev=>{
    if(Date.now()-hoverStamp<50)return;hoverStamp=Date.now();
    let nearest=null,best=Infinity;
    for(const point of events.points || []){
      const distance=Math.hypot(point.x-ev.containerPoint.x,point.y-ev.containerPoint.y);
      if(distance<=Math.max(8,point.radius+3) && distance<best){best=distance;nearest=point.event;}
    }
    element.style.cursor=nearest ? 'pointer' : '';
    if(hoverTip){map.closeTooltip(hoverTip);hoverTip=null;}
    if(nearest)hoverTip=L.tooltip({direction:'top',offset:[0,-10],className:'seismic-hover'})
      .setLatLng(eventLatLng(nearest)).setContent(`<strong>M ${safe(formatNumber(nearest.mag))} ${safe(nearest.magType || translate('unknownType'))}</strong><br>${safe(nearest.place)}<br>${safe(nearest.time)}`).openOn(map);
  });
  map.on('mouseout',()=>{element.style.cursor='';if(hoverTip){map.closeTooltip(hoverTip);hoverTip=null;}});
  map.on('zoomend', labels);
  map.on('popupopen', ({popup}) => {
    const close = popup.getElement()?.querySelector('.leaflet-popup-close-button');
    if (close) {close.setAttribute('aria-label', translate('closePopup'));close.title = translate('closePopup');}
  });
  map.on('click', ev => {
    if (ev.originalEvent?.target?.closest('.leaflet-popup')) return;
    let nearest = null, best = Infinity;
    for (const p of events.points || []) {
      const distance = Math.hypot(p.x - ev.containerPoint.x, p.y - ev.containerPoint.y);
      if (distance <= Math.max(8, p.radius + 3) && distance < best) {best = distance; nearest = p.event;}
    }
    if (!nearest) {map.closePopup();return;}
    const e = nearest;
    select(e.id);
    const content = `<strong>${safe(e.place)}</strong><p class="map-popup-meta">${safe(formatNumber(e.mag))} ${safe(e.magType || translate('unknownType'))} · ${safe(e.time)}<br>${safe(e.id)}</p><button class="map-inspect" data-map-event="${safe(e.id)}">${safe(translate('inspectRecord'))}</button>`;
    L.popup({maxWidth: 290}).setLatLng(eventLatLng(e)).setContent(content).openOn(map);
  });
  element.addEventListener('click', event => {
    const button = event.target.closest('[data-map-event]');if (button) {event.stopPropagation();onSelect(button.dataset.mapEvent);}
  });
  function reset() {map.closePopup();map.fitBounds(region, {padding: [20, 20], animate: false});labels();}
  function fitRecords() {
    const rows = events.records || [];if (!rows.length) return;
    const bounds = L.latLngBounds(rows.map(eventLatLng));
    map.closePopup();map.fitBounds(bounds, {padding: [30, 30], maxZoom: 8, animate: false});
  }
  reset();
  map.on('moveend', onViewChange);
  function languageChanged() {
    map.closePopup();labels();basePickerLabels();events.redraw();
    for (const [selector, key] of [['.leaflet-control-zoom-in', 'zoomIn'], ['.leaflet-control-zoom-out', 'zoomOut']]) {
      const button = element.querySelector(selector);if (button) {button.title = translate(key);button.setAttribute('aria-label', translate(key));}
    }
  }
  function select(id) {
    const next = (events.records || []).some(e => e.id === id) ? id : '';
    if (next !== selectedId) {selectedId = next;onHighlight(next);}
    events.redraw();
  }
  languageChanged();
  return {
    setRecords(records) {map.closePopup();events.setRecords(records);if (selectedId && !records.some(e => e.id === selectedId)) select('');},
    highlight: select,
    focusRecord(id) {
      const event = (events.records || []).find(e => e.id === id);if (!event) return false;
      select(id);map.closePopup();map.setView(eventLatLng(event),Math.max(5.5,map.getZoom()),{animate:false});return true;
    },
    themeChanged() {countries.setStyle(countryStyle);labels();events.redraw();},
    reset, fitRecords, languageChanged, setBase,
    getBase() {return activeBase;},
    setRegion(bounds) {region = L.latLngBounds(bounds);},
    getView() {const center = map.getCenter();return [center.lat, center.lng, map.getZoom()];},
    setView(view) {map.closePopup();map.setView([view[0], view[1]], view[2], {animate: false});},
    resize() {map.invalidateSize({pan: false});events.redraw();}
  };
};
