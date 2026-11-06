'use strict';

// Local cartography and one canvas keep geographic context independent of tile APIs.
window.createSeismicMap = function ({element, basemap, onSelect, onViewChange = () => {}, translate = key => key, formatNumber = String}) {
  const region = L.latLngBounds([[14, -118], [33, -86]]);
  const map = L.map(element, {
    preferCanvas: true, minZoom: 3, maxZoom: 9, zoomSnap: .25,
    maxBounds: [[-5, -145], [55, -55]], maxBoundsViscosity: .8,
    attributionControl: true, keyboard: true
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
  map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/about/terms-of-use/">Made with Natural Earth</a>');
  L.control.scale({imperial: false, maxWidth: 120}).addTo(map);
  const countryRenderer = L.canvas({padding: .25});
  L.geoJSON(basemap, {
    renderer: countryRenderer, interactive: false,
    style: f => ({color: '#889e97', weight: .9, fillColor: f.properties.ADMIN === 'Mexico' ? '#f1e8ce' : '#f0f2e8', fillOpacity: 1})
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
    return {properties: p, minZoom: major ? 3 : 5, marker: L.marker([p.LABEL_Y, p.LABEL_X], {pane: 'countryLabels', interactive: false, keyboard: false, icon: countryIcon(p)})};
  });
  function labels() {labelLayer.clearLayers();for (const spec of labelSpecs) if (map.getZoom() >= spec.minZoom) {spec.marker.setIcon(countryIcon(spec.properties));labelLayer.addLayer(spec.marker);}}

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
      for (const e of this.records || []) {
        const p = this._map.latLngToContainerPoint([e.latitude, e.longitude]);
        const radius = Math.max(2, (e.mag - 2.5) * 1.25);
        if (p.x < -radius || p.x > size.x + radius || p.y < -radius || p.y > size.y + radius) continue;
        this.points.push({x: p.x, y: p.y, radius, event: e});
        ctx.beginPath();ctx.fillStyle = e.depth === null ? '#78949ba8' : e.depth > 70 ? '#d77635aa' : '#08756899';
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);ctx.fill();
      }
      document.getElementById('mapStatus').textContent = translate('visible', {visible: formatNumber(this.points.length), filtered: formatNumber((this.records || []).length)});
    },
    setRecords(records) {this.records = records;this.redraw();}
  });
  const events = new EventsLayer().addTo(map);
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
    const content = `<strong>${safe(e.place)}</strong><p class="map-popup-meta">${safe(formatNumber(e.mag))} ${safe(e.magType || translate('unknownType'))} · ${safe(e.time)}<br>${safe(e.id)}</p><button class="map-inspect" data-map-event="${safe(e.id)}">${safe(translate('inspectRecord'))}</button>`;
    L.popup({maxWidth: 290}).setLatLng([e.latitude, e.longitude]).setContent(content).openOn(map);
  });
  element.addEventListener('click', event => {
    const button = event.target.closest('[data-map-event]');if (button) {event.stopPropagation();onSelect(button.dataset.mapEvent);}
  });
  function reset() {map.closePopup();map.fitBounds(region, {padding: [20, 20], animate: false});labels();}
  function fitRecords() {
    const rows = events.records || [];if (!rows.length) return;
    const bounds = L.latLngBounds(rows.map(e => [e.latitude, e.longitude]));
    map.closePopup();map.fitBounds(bounds, {padding: [30, 30], maxZoom: 8, animate: false});
  }
  reset();
  map.on('moveend', onViewChange);
  function languageChanged() {
    map.closePopup();labels();events.redraw();
    for (const [selector, key] of [['.leaflet-control-zoom-in', 'zoomIn'], ['.leaflet-control-zoom-out', 'zoomOut']]) {
      const button = element.querySelector(selector);if (button) {button.title = translate(key);button.setAttribute('aria-label', translate(key));}
    }
  }
  languageChanged();
  return {
    setRecords(records) {map.closePopup();events.setRecords(records);},
    reset, fitRecords, languageChanged,
    getView() {const center = map.getCenter();return [center.lat, center.lng, map.getZoom()];},
    setView(view) {map.closePopup();map.setView([view[0], view[1]], view[2], {animate: false});},
    resize() {map.invalidateSize({pan: false});events.redraw();}
  };
};
