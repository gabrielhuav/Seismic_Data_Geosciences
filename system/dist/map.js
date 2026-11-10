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

// A screen-space count display, not a geographic rate or magnitude-weighted
// estimate. Raw grid counts conserve every visible source row before smoothing.
window.SeismicMapHeat = (function () {
  const spec=Object.freeze({grid_css_pixels:8,radius_css_pixels:32,sigma_css_pixels:12,
    weight_per_source_row:1,normalization:'log1p_relative_to_viewport_max'});
  const palette=Object.freeze([{at:0,color:'#24658b'},{at:.35,color:'#28b7a6'},
    {at:.7,color:'#f0cf58'},{at:1,color:'#d84a35'}].map(Object.freeze));
  const support=spec.radius_css_pixels/spec.grid_css_pixels,sigma=spec.sigma_css_pixels/spec.grid_css_pixels;
  const weights=Array.from({length:2*support+1},(_,i)=>Math.exp(-.5*((i-support)/sigma)**2));
  const total=weights.reduce((n,v)=>n+v,0),kernel=weights.map(v=>v/total);
  function create(width,height){
    const columns=Math.ceil(width/spec.grid_css_pixels),rows=Math.ceil(height/spec.grid_css_pixels);
    return {width,height,columns,rows,counts:new Uint32Array(columns*rows),visible_rows:0,occupied_cells:0};
  }
  function add(grid,x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=grid.width||y>=grid.height)return false;
    const at=Math.floor(y/spec.grid_css_pixels)*grid.columns+Math.floor(x/spec.grid_css_pixels);
    if(!grid.counts[at])grid.occupied_cells++;grid.counts[at]++;grid.visible_rows++;return true;
  }
  function smooth(grid){
    const {columns,rows,counts}=grid,horizontal=new Float64Array(counts.length),values=new Float64Array(counts.length);
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      let v=0;for(let k=-support;k<=support;k++){const xx=x+k;if(xx>=0&&xx<columns)v+=counts[y*columns+xx]*kernel[k+support];}
      horizontal[y*columns+x]=v;
    }
    let max=0;
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      let v=0;for(let k=-support;k<=support;k++){const yy=y+k;if(yy>=0&&yy<rows)v+=horizontal[yy*columns+x]*kernel[k+support];}
      values[y*columns+x]=v;if(v>max)max=v;
    }
    return {values,max};
  }
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const colors=Array.from({length:256},(_,i)=>{
    const t=i/255,upper=palette.findIndex(p=>p.at>=t),b=palette[Math.max(1,upper)],a=palette[Math.max(1,upper)-1],fraction=(t-a.at)/(b.at-a.at),from=rgb(a.color),to=rgb(b.color);
    return [...from.map((v,n)=>Math.round(v+(to[n]-v)*fraction)),Math.round(220*Math.sqrt(t))];
  });
  function rgba(smoothed){
    const bytes=new Uint8ClampedArray(smoothed.values.length*4),denominator=Math.log1p(smoothed.max);
    if(!denominator)return bytes;
    for(let i=0;i<smoothed.values.length;i++){
      if(!smoothed.values[i])continue;
      const value=Math.max(1,Math.min(255,Math.round(255*Math.log1p(smoothed.values[i])/denominator)));
      bytes.set(colors[value],i*4);
    }
    return bytes;
  }
  return Object.freeze({spec,palette,create,add,smooth,rgba});
})();

// Local cartography and one canvas keep geographic context independent of tile APIs.
window.createSeismicMap = function ({element, basemap, onSelect, onHighlight = () => {}, onViewChange = () => {}, onBaseChange = () => {}, onBaseStatus = () => {}, onCountrySelect = () => {}, onAdmin1Select = () => {}, onDisplayChange = () => {}, sourceStyle = () => null, translate = key => key, formatNumber = String, getLanguage = () => document.documentElement.lang || 'es'}) {
  let region = L.latLngBounds([[14, -190], [84, -50]]), activeBase = 'local', tiles = null, tileErrors = 0, selectedId = '', baseSelect = null, baseLabel = null;
  let selectedCountry = '', admin1Layer = null, admin1Data = null, admin1Country = '', admin1Context = false, selectedAdmin1 = '', tectonicLayer = null, tectonicData = null, overlayHover = null;
  let displayMode='points',colorMode='depth',displayEvidence={mode:'points',color_encoding:'depth',selected_rows:0,visible_rows:0};
  const heat=window.SeismicMapHeat;
  const baseSpecs=window.SeismicBasemaps;
  const color = (name, fallback) => window.getComputedStyle?.(document.documentElement).getPropertyValue(name).trim() || fallback;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const {displayLongitude, displayPolygon} = window.SeismicMapGeometry;
  const eventLatLng = event => [event.latitude, displayLongitude(event.longitude)];
  const countryId = properties => /^[A-Z]{3}$/.test(properties.ISO_A3 || '') ? properties.ISO_A3 : 'NE_' + String(properties.ADMIN || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  function visualFeature(feature) {
    const g = feature.geometry;
    return {...feature, geometry: !g ? g : g.type === 'Polygon' ? {...g, coordinates: displayPolygon(g.coordinates)}
      : g.type === 'MultiPolygon' ? {...g, coordinates: g.coordinates.map(displayPolygon)}
      : g.type === 'LineString' ? {...g, coordinates: displayPolygon([g.coordinates])[0]}
      : g.type === 'MultiLineString' ? {...g, coordinates: g.coordinates.map(line=>displayPolygon([line])[0])} : g};
  }
  const visualBasemap = {...basemap, features: basemap.features.map(visualFeature)};
  const map = L.map(element, {
    preferCanvas: true, trackResize:false, minZoom: 1.5, maxZoom: 12, zoomSnap: .25,
    maxBounds: [[-5, -210], [85, -40]], maxBoundsViscosity: .8,
    attributionControl: true, keyboard: true, zoomAnimation: !reducedMotion?.matches,
    fadeAnimation: !reducedMotion?.matches, markerZoomAnimation: !reducedMotion?.matches
  });
  reducedMotion?.addEventListener?.('change', event => {map.options.zoomAnimation = !event.matches;map.options.fadeAnimation = !event.matches;map.options.markerZoomAnimation = !event.matches;});
  map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
  const naturalAttribution = '<a href="https://www.naturalearthdata.com/about/terms-of-use/">Made with Natural Earth</a>';
  map.attributionControl.addAttribution(naturalAttribution);
  L.control.scale({imperial: false, maxWidth: 120}).addTo(map);
  const tectonicPane = map.createPane('seismicTectonics');tectonicPane.style.zIndex = 350;tectonicPane.style.pointerEvents = 'none';
  const admin1Pane = map.createPane('seismicAdmin1');admin1Pane.style.zIndex = 410;
  const contextLabelPane = map.createPane('seismicContextLabels');contextLabelPane.style.zIndex = 430;contextLabelPane.style.pointerEvents = 'none';
  const heatPane = map.createPane('seismicHeat');heatPane.style.zIndex = 405;heatPane.style.pointerEvents = 'none';
  const eventPane = map.createPane('seismicEvents');eventPane.style.zIndex = 450;eventPane.style.pointerEvents = 'none';
  const contextLabels = L.layerGroup().addTo(map);
  const countryRenderer = L.canvas({padding: .25});
  const countryStyle = f => ({color: countryId(f.properties) === selectedCountry ? color('--green','#126a5b') : color('--map-boundary', '#889e97'), weight: countryId(f.properties) === selectedCountry ? 1.8 : activeBase === 'local' ? .9 : .55,
    fillColor: countryId(f.properties) === selectedCountry || f.properties.ADMIN === 'Mexico' ? color('--map-focus-land', '#f1e8ce') : color('--map-land', '#f0f2e8'), fillOpacity: activeBase !== 'local' ? .002 : tectonicData ? .38 : 1});
  const countries = L.geoJSON(visualBasemap, {
    renderer: countryRenderer, interactive: true,
    style: countryStyle,
    onEachFeature(feature, layer) {
      layer.on('click',event=>{if(nearestRecord(event.containerPoint))return;onCountrySelect(countryId(feature.properties),feature.properties);});
      layer.on('mouseover',()=>{overlayHover={kind:'country',feature};layer.setStyle({weight:2,fillOpacity:activeBase==='local'?.6:.12});});
      layer.on('mouseout',()=>{overlayHover=null;layer.setStyle(countryStyle(feature));});
    }
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
  function labels() {labelLayer.clearLayers();if (activeBase === 'local')for (const spec of labelSpecs) if (map.getZoom() >= spec.minZoom) {spec.marker.setIcon(countryIcon(spec.properties));labelLayer.addLayer(spec.marker);}contextualLabels();}
  const spanish = () => String(getLanguage()).startsWith('es');
  function featureName(feature) {
    const p=feature.properties||{};
    if(p.admin1_id)return (spanish()?p.label_es:p.label_en)||p.source_name||p.admin1_id;
    const key='country.'+p.ADMIN,value=translate(key);return value===key?p.NAME_EN||p.ADMIN:value;
  }
  // These positions are presentation anchors for regional plate names, not event
  // membership or model geometry. All outlines come from the supplied PB2002 data.
  const plateLabels = {
    PA:{point:[19,-150],es:'Pacífica',en:'Pacific'},NA:{point:[51,-105],es:'Norteamericana',en:'North America'},
    CO:{point:[10,-98],es:'Cocos',en:'Cocos'},RI:{point:[20,-108],es:'Rivera',en:'Rivera'},
    CA:{point:[17,-75],es:'Caribe',en:'Caribbean'},JF:{point:[44,-129],es:'Juan de Fuca',en:'Juan de Fuca'},NZ:{point:[-3,-85],es:'Nazca',en:'Nazca'}
  };
  function labelIcon(text,accent=false) {
    return L.divIcon({className:'seismic-context-label',iconSize:[150,24],iconAnchor:[75,12],html:`<span style="display:inline-block;padding:3px 7px;border:1px solid ${safe(color('--map-boundary','#889e97'))};border-radius:5px;background:${safe(color('--paper','#fff'))};color:${safe(color(accent?'--green':'--ink','#183c39'))};font:600 10px/1.4 Arial,sans-serif;white-space:nowrap;box-shadow:0 1px 4px #0002">${safe(text)}</span>`});
  }
  function coordinatePoints(geometry, onlyDisplayed=false) {
    const points=[];
    function walk(value){if(!Array.isArray(value))return;if(typeof value[0]==='number'&&typeof value[1]==='number'){const [lon,lat]=value;if(Number.isFinite(lon)&&Number.isFinite(lat)&&(!onlyDisplayed||(lon>=-210&&lon<=-40&&lat>=-5&&lat<=85)))points.push([lat,lon]);}else for(const child of value)walk(child);}
    walk(geometry?.coordinates);return points;
  }
  function contextualLabels() {
    contextLabels.clearLayers();
    if(tectonicData){const codes=new Set(tectonicData.features.filter(f=>f.properties?.kind==='plate').map(f=>f.properties.plate_code));for(const [code,label] of Object.entries(plateLabels))if(codes.has(code)&&(map.getZoom()>=3||['PA','NA','CA'].includes(code)))contextLabels.addLayer(L.marker(label.point,{pane:'seismicContextLabels',interactive:false,keyboard:false,icon:labelIcon(code+' · '+label[spanish()?'es':'en'],true)}));}
    if(admin1Data&&selectedAdmin1){const f=admin1Data.features.find(f=>f.properties.admin1_id===selectedAdmin1);if(f){const points=coordinatePoints(f.geometry,true);if(points.length){let south=Infinity,north=-Infinity,west=Infinity,east=-Infinity;for(const [lat,lon] of points){south=Math.min(south,lat);north=Math.max(north,lat);west=Math.min(west,lon);east=Math.max(east,lon);}contextLabels.addLayer(L.marker([(south+north)/2,(west+east)/2],{pane:'seismicContextLabels',interactive:false,keyboard:false,icon:labelIcon(featureName(f))}));}}}
  }
  const admin1Style = f => ({pane:'seismicAdmin1',color:color('--green','#126a5b'),weight:f.properties.admin1_id===selectedAdmin1?2.5:1.1,fillColor:color('--green','#126a5b'),fillOpacity:f.properties.admin1_id===selectedAdmin1?.11:.002});
  function clearAdmin1() {
    if(admin1Layer)map.removeLayer(admin1Layer);admin1Layer=null;admin1Data=null;admin1Country='';admin1Context=false;selectedAdmin1='';overlayHover=null;contextualLabels();
  }
  function setAdmin1({geometry,countryId:country,selectedId:selection='',contextOnly=false}={}) {
    if(!geometry||!country){clearAdmin1();return;}
    if(geometry.type!=='FeatureCollection'||!Array.isArray(geometry.features))throw new Error('Invalid administrative geometry');
    const features=geometry.features.filter(f=>f.properties?.country_id===country&&f.properties?.admin1_id).map(visualFeature);
    if(admin1Layer)map.removeLayer(admin1Layer);
    admin1Data={type:'FeatureCollection',features};admin1Country=country;admin1Context=!!contextOnly;selectedAdmin1=!admin1Context&&features.some(f=>f.properties.admin1_id===selection)?selection:'';overlayHover=null;
    // One interactive renderer lets clicks outside the selected country's
    // administrative polygons reach the country shapes beneath them. A second
    // full-map canvas would otherwise intercept those pointer events.
    admin1Layer=L.geoJSON(admin1Data,{pane:'seismicAdmin1',renderer:countryRenderer,interactive:!admin1Context,style:admin1Style,onEachFeature(feature,layer){
      if(admin1Context)return;
      layer.on('click',event=>{if(nearestRecord(event.containerPoint))return;onAdmin1Select(feature.properties.admin1_id,feature.properties);});
      layer.on('mouseover',()=>{overlayHover={kind:'admin1',feature};layer.setStyle({weight:2.5,fillOpacity:.15});});
      layer.on('mouseout',()=>{overlayHover=null;layer.setStyle(admin1Style(feature));});
    }}).addTo(map);contextualLabels();
  }
  const platePalette={PA:'#6f77b8',NA:'#40938d',CO:'#d29a43',RI:'#bf6e63',CA:'#a482b5',JF:'#6f8fa9',NZ:'#a99b58'};
  function tectonicStyle(feature) {
    const p=feature.properties||{};
    if(p.kind==='boundary')return {pane:'seismicTectonics',interactive:false,color:color('--chart-alt','#b57132'),weight:1.6,opacity:.9,dashArray:'5 5',fill:false};
    return {pane:'seismicTectonics',interactive:false,color:platePalette[p.plate_code]||color('--map-boundary','#889e97'),weight:1.1,opacity:.75,fillColor:platePalette[p.plate_code]||'#7e919e',fillOpacity:.2};
  }
  const tectonicAttribution='PB2002: <a href="https://doi.org/10.1029/2001GC000252">Bird (2003)</a> · GeoJSON: Hugo Ahlenius / Nordpil / csterling · ODC-BY 1.0';
  function setTectonics(geometry) {
    if(geometry&&(geometry.type!=='FeatureCollection'||!Array.isArray(geometry.features)))throw new Error('Invalid tectonic geometry');
    if(tectonicLayer)map.removeLayer(tectonicLayer);tectonicLayer=null;tectonicData=null;map.attributionControl.removeAttribution(tectonicAttribution);
    if(geometry){tectonicData={...geometry,features:geometry.features.map(visualFeature)};tectonicLayer=L.geoJSON(tectonicData,{pane:'seismicTectonics',interactive:false,renderer:L.canvas({pane:'seismicTectonics',padding:.25}),style:tectonicStyle}).addTo(map);map.attributionControl.addAttribution(tectonicAttribution);}
    countries.setStyle(countryStyle);contextualLabels();
  }
  function fitGeometry(feature) {
    if(!feature)return false;const points=coordinatePoints(feature.geometry,true);if(!points.length)return false;
    map.closePopup();map.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:8,animate:false});return true;
  }
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
      // Transparent Natural Earth hit areas retain country selection above remote
      // backgrounds; their original attribution therefore remains applicable.
      if (!map.hasLayer(countries)) countries.addTo(map);
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
    countries.setStyle(countryStyle);labels();basePickerLabels();if (persist) onBaseChange(id);
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
      this._canvas.setAttribute('aria-hidden', 'true');eventPane.appendChild(this._canvas);
      m.on('moveend zoomend resize viewreset', this.redraw, this);this.redraw();
    },
    onRemove(m) {m.off('moveend zoomend resize viewreset', this.redraw, this);this._canvas.remove();},
    redraw() {
      if (!this._map || !this._canvas) return;
      const started=window.performance?.now?.();
      const size = this._map.getSize();if (!size.x || !size.y) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2), c = this._canvas;
      const colors={unknown:color('--point-unknown','#526f7a'),deep:color('--point-deep','#bc5b1e'),shallow:color('--point-shallow','#087568')};
      const origin=this._map.getPixelBounds?.().min,center=origin?null:this._map.getCenter();
      const pointKey=[this._map.getZoom(),size.x,size.y,ratio,origin?.x??center.lat,origin?.y??center.lng,selectedId,colorMode,colors.unknown,colors.deep,colors.shallow,color('--selection-halo','#fff'),color('--point-selected','#9b4b00')].join('|');
      // Leaflet can announce one unchanged view through resize, moveend and
      // zoomend. Retain the identical point raster; every source row and hit
      // target remains present. No aggregation or sample is introduced.
      if(displayMode==='points'&&this._pointCache&&this._pointCache.records===this.records&&this._pointCache.key===pointKey){
        document.getElementById('mapStatus').textContent=translate('visible',{visible:formatNumber(displayEvidence.visible_rows),filtered:formatNumber((this.records||[]).length)});
        if(this.records)onDisplayChange(JSON.parse(JSON.stringify(displayEvidence)));return;
      }
      if(displayMode==='heat')this._pointCache=null;
      // Keep the density below administrative outlines and geographic labels.
      const pane=displayMode==='heat'?heatPane:eventPane;if(c.parentElement!==pane)pane.appendChild(c);
      c.width = Math.round(size.x * ratio);c.height = Math.round(size.y * ratio);
      c.style.width = size.x + 'px';c.style.height = size.y + 'px';
      L.DomUtil.setPosition(c, this._map.containerPointToLayerPoint([0, 0]));
      const ctx = c.getContext('2d');ctx.setTransform(ratio, 0, 0, ratio, 0, 0);this.points = [];
      let selectedPoint,visible;
      if(displayMode==='heat'){
        // A zoom can emit viewreset/zoomend/moveend for the same pixel bounds.
        // Reuse that grid instead of projecting a large selection three times.
        const topLeft=this._map.getPixelBounds?.().min,center=topLeft?null:this._map.getCenter();
        const key=[this._map.getZoom(),size.x,size.y,topLeft?.x??center.lat,topLeft?.y??center.lng].join('|');
        if(!this._heatCache||this._heatCache.records!==this.records||this._heatCache.key!==key){
          const grid=heat.create(size.x,size.y);
          for(const e of this.records||[]){const p=this._map.latLngToContainerPoint(eventLatLng(e));heat.add(grid,p.x,p.y);}
          const smoothed=heat.smooth(grid);
          this._heatCanvas ||= document.createElement('canvas');this._heatCanvas.width=grid.columns;this._heatCanvas.height=grid.rows;
          const hc=this._heatCanvas.getContext('2d'),pixels=hc.createImageData(grid.columns,grid.rows);pixels.data.set(heat.rgba(smoothed));hc.putImageData(pixels,0,0);
          this._heatCache={key,records:this.records,visible:grid.visible_rows,occupied:grid.occupied_cells,max:smoothed.max,columns:grid.columns,rows:grid.rows};
        }
        const cached=this._heatCache;ctx.imageSmoothingEnabled=true;ctx.drawImage(this._heatCanvas,0,0,cached.columns*heat.spec.grid_css_pixels,cached.rows*heat.spec.grid_css_pixels);
        if(selectedId){const selected=(this.records||[]).find(e=>e.id===selectedId);if(selected){const p=this._map.latLngToContainerPoint(eventLatLng(selected));if(p.x>=0&&p.y>=0&&p.x<size.x&&p.y<size.y)selectedPoint={x:p.x,y:p.y,radius:4};}}
        visible=cached.visible;
        displayEvidence={mode:'heat',color_encoding:'relative_source_row_concentration',...heat.spec,selected_rows:(this.records||[]).length,visible_rows:visible,occupied_cells:cached.occupied,
          max_smoothed_cell_weight:cached.max,viewport_css_pixels:[size.x,size.y],palette:heat.palette.map(p=>({...p})),
          limits:['One equal weight per selected row whose epicentre center is inside the viewport; no sampling.',
            'Screen-space binned counts, Gaussian smoothing and log1p colors relative to the current viewport maximum; not a density per square kilometre.',
            'Radius and grid size are CSS pixels. Zoom, viewport size and panning change this visual density and its color scale; edge kernels are clipped.',
            'Reported magnitude is not a weight. This does not show magnitude energy, hazard, earthquake probability or completeness.',
            'Cells have no event identity. Country and active subdivision clicks remain geographic controls; inspect a source row in the table.']};
      }else{
      // Paint small symbols first so larger observations remain selectable and visible.
      this.paintOrder ||= [...(this.records||[])].sort((a,b)=>a.mag-b.mag);
      const visibleCatalogues=new Map();
      this.sourceStyles ||= new Map();const marker=window.SeismicSourceWorkbench?.markerPath;
      for (const e of this.paintOrder) {
        const p = this._map.latLngToContainerPoint(eventLatLng(e));
        const radius = Math.max(2, (e.mag - 2.5) * 1.25);
        if (p.x < -radius || p.x > size.x + radius || p.y < -radius || p.y > size.y + radius) continue;
        this.points.push({x: p.x, y: p.y, radius, event: e});
        const styleKey=e._catalog_id||'';
        if(colorMode==='catalogue'&&!this.sourceStyles.has(styleKey))this.sourceStyles.set(styleKey,sourceStyle(e));
        const identity=colorMode==='catalogue'?this.sourceStyles.get(styleKey):null;
        if(identity?.catalogue_id&&!visibleCatalogues.has(identity.catalogue_id))visibleCatalogues.set(identity.catalogue_id,{...identity});
        ctx.beginPath();ctx.globalAlpha = identity?.color?.length ? .88 : .7;
        ctx.fillStyle = identity?.color || (e.depth === null ? colors.unknown : e.depth > 70 ? colors.deep : colors.shallow);
        if(identity&&marker)marker(ctx,p.x,p.y,radius,identity.shape);else ctx.arc(p.x,p.y,radius,0,Math.PI*2);
        ctx.fill();
        if(radius>=3.5){ctx.globalAlpha=.85;ctx.lineWidth=.7;ctx.strokeStyle=color('--selection-halo','#fff');ctx.stroke();}
        if (e.id === selectedId) selectedPoint = {x:p.x,y:p.y,radius};
      }
      visible=this.points.length;
      displayEvidence={mode:'points',color_encoding:colorMode,catalogue_palette:[...visibleCatalogues.values()],symbol_size:'Radius max(2, (reported M - 2.5) * 1.25) CSS pixels; magnitude types are not converted.',selected_rows:(this.records||[]).length,visible_rows:visible,viewport_css_pixels:[size.x,size.y]};
      }
      if (selectedPoint) {
        ctx.globalAlpha = 1;ctx.beginPath();ctx.arc(selectedPoint.x,selectedPoint.y,Math.max(8,selectedPoint.radius+4),0,Math.PI*2);
        ctx.lineWidth=5;ctx.strokeStyle=color('--selection-halo','#fff');ctx.stroke();
        ctx.lineWidth=2.5;ctx.strokeStyle=color('--point-selected','#9b4b00');ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if(displayMode==='points')this._pointCache={records:this.records,key:pointKey};
      document.getElementById('mapStatus').textContent = translate('visible', {visible: formatNumber(visible), filtered: formatNumber((this.records || []).length)});
      if(this.records)onDisplayChange(JSON.parse(JSON.stringify(displayEvidence)));
      if(Number.isFinite(started)){
        const timing=document.getElementById('renderTiming');
        if(timing)timing.textContent=translate('canvasTiming',{ms:formatNumber(Math.round((window.performance.now()-started)*10)/10)});
      }
    },
    setRecords(records) {if(this.records!==records){this.records=records;this.paintOrder=null;this.sourceStyles=null;}this.redraw();}
  });
  const events = new EventsLayer().addTo(map);
  function nearestRecord(point) {
    if(displayMode==='heat'||!point)return null;let nearest=null,best=Infinity;
    for(const candidate of events.points||[]){const distance=Math.hypot(candidate.x-point.x,candidate.y-point.y);if(distance<=Math.max(8,candidate.radius+3)&&distance<best){best=distance;nearest=candidate.event;}}
    return nearest;
  }
  let hoverStamp=0,hoverTip=null;
  map.on('mousemove', ev=>{
    if(Date.now()-hoverStamp<50)return;hoverStamp=Date.now();
    const nearest=nearestRecord(ev.containerPoint);
    element.style.cursor=nearest||overlayHover ? 'pointer' : '';
    if(hoverTip){map.closeTooltip(hoverTip);hoverTip=null;}
    if(nearest){const identity=sourceStyle(nearest);hoverTip=L.tooltip({direction:'top',offset:[0,-10],className:'seismic-hover'})
      .setLatLng(eventLatLng(nearest)).setContent(`<strong>M ${safe(formatNumber(nearest.mag))} ${safe(nearest.magType || translate('unknownType'))}</strong>${identity?'<br>'+safe(identity.code+' · '+identity.label):''}<br>${safe(nearest.place)}<br>${safe(nearest.time)}`).openOn(map);}
    else if(overlayHover&&ev.latlng)hoverTip=L.tooltip({direction:'top',offset:[0,-8],className:'seismic-hover'}).setLatLng(ev.latlng).setContent(safe(featureName(overlayHover.feature))).openOn(map);
  });
  map.on('mouseout',()=>{overlayHover=null;element.style.cursor='';if(hoverTip){map.closeTooltip(hoverTip);hoverTip=null;}});
  map.on('zoomend', labels);
  map.on('popupopen', ({popup}) => {
    const close = popup.getElement()?.querySelector('.leaflet-popup-close-button');
    if (close) {close.setAttribute('aria-label', translate('closePopup'));close.title = translate('closePopup');}
  });
  map.on('click', ev => {
    if (ev.originalEvent?.target?.closest('.leaflet-popup')) return;
    const nearest = nearestRecord(ev.containerPoint);
    if (!nearest) {map.closePopup();return;}
    const e = nearest;
    select(e.id);
    const identity=sourceStyle(e);
    const content = `<strong>${safe(e.place)}</strong><p class="map-popup-meta">${safe(formatNumber(e.mag))} ${safe(e.magType || translate('unknownType'))} · ${safe(e.time)}${identity?'<br>'+safe(identity.code+' · '+identity.label):''}<br>${safe(e.id)}</p><button class="map-inspect" data-map-event="${safe(e.id)}">${safe(translate('inspectRecord'))}</button>`;
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
    themeChanged() {countries.setStyle(countryStyle);admin1Layer?.setStyle(admin1Style);tectonicLayer?.setStyle(tectonicStyle);labels();events.redraw();},
    reset, fitRecords, languageChanged, setBase, setAdmin1, clearAdmin1, setTectonics,
    setAdmin1Context({geometry,countryId}={}) {setAdmin1({geometry,countryId,contextOnly:true});},
    setDisplayMode(mode) {if(!['points','heat'].includes(mode))throw new Error('Unknown seismic map display mode');if(mode!==displayMode){displayMode=mode;map.closePopup();if(hoverTip){map.closeTooltip(hoverTip);hoverTip=null;}events.redraw();}return displayMode;},
    getDisplayMode() {return displayMode;},
    setColorMode(mode) {if(!['catalogue','depth'].includes(mode))throw new Error('Unknown seismic point color mode');if(mode!==colorMode){colorMode=mode;events.redraw();}return colorMode;},
    getColorMode() {return colorMode;},
    getDisplayEvidence() {return JSON.parse(JSON.stringify(displayEvidence));},
    setCountry(id) {selectedCountry=String(id||'');if(admin1Country&&admin1Country!==selectedCountry&&(!admin1Context||selectedCountry))clearAdmin1();countries.setStyle(countryStyle);},
    fitCountry(id) {return fitGeometry(visualBasemap.features.find(f=>countryId(f.properties)===id));},
    fitAdmin1(id) {return fitGeometry(admin1Data?.features.find(f=>f.properties.admin1_id===id));},
    getOverlays() {return {country:selectedCountry,admin1Country,admin1:selectedAdmin1,admin1Context,tectonics:!!tectonicData};},
    getBase() {return activeBase;},
    setRegion(bounds) {region = L.latLngBounds(bounds);},
    getView() {const center = map.getCenter();return [center.lat, center.lng, map.getZoom()];},
    setView(view) {map.closePopup();map.setView([view[0], view[1]], view[2], {animate: false});},
    resize() {
      if(!element.clientWidth || !element.clientHeight)return;
      // Leaflet must compensate the changed half-size to retain the geographic
      // center when this shared map is resized, reparented or expanded.
      map.invalidateSize({pan:true,animate:false});events.redraw();
    }
  };
};
