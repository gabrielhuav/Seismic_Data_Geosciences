/* Shared map affordances. Coordinates and generalized containment are local.
 * Reverse lookup is an explicit, cached user action, never a mousemove request.
 * No wave propagation or felt radius is inferred from an epicentre/magnitude. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicMapTools=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function magnitudeColor(hex,magnitude){
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),hi=Math.max(...rgb),lo=Math.min(...rgb),d=hi-lo;
    let hue=0;if(d)hue=hi===rgb[0]?((rgb[1]-rgb[2])/d)%6:hi===rgb[1]?(rgb[2]-rgb[0])/d+2:(rgb[0]-rgb[1])/d+4;
    const light=magnitude<3?78:magnitude<5?59:magnitude<7?42:27;
    return `hsl(${Math.round((hue*60+360)%360)} 58% ${light}%)`;
  }
  function ringContains(ring,lon,lat){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const ax=ring[i][0]+360*Math.round((lon-ring[i][0])/360),ay=ring[i][1],bx=ring[j][0]+360*Math.round((lon-ring[j][0])/360),by=ring[j][1];
    if((ay>lat)!==(by>lat)&&lon<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside;
  }return inside;}
  function contains(feature,lon,lat){const g=feature?.geometry;if(!g)return false;const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];return polygons.some(p=>ringContains(p[0],lon,lat)&&!p.slice(1).some(r=>ringContains(r,lon,lat)));}
  function coordinateText(lat,lon){lon=((lon+180)%360+360)%360-180;return Math.abs(lat).toFixed(4)+'° '+(lat<0?'S':'N')+' · '+Math.abs(lon).toFixed(4)+'° '+(lon<0?'W':'E');}
  function shakingLinks(e,language='en'){
    if(!(Number(e.mag??e.reported_magnitude)>=6))return '';
    const en=language!=='es',id=String(e.source_event_id||e.source_id||e.id||'');
    if(!/^(us|ci|nc|ak|uw|uu|pr|at|nm|hv)[a-z0-9]+$/i.test(id)||String(e._catalog_id||'').startsWith('ssn')||String(e._catalog_id||'').startsWith('nrcan'))return '<p class="shaking-note">'+(en?'Felt extent is not supplied by this record. Magnitude alone cannot locate where shaking was felt.':'Este registro no incluye extensión sentida. La magnitud no determina dónde se sintió.')+'</p>';
    return '<div class="shaking-links"><b>'+(en?'Official shaking information':'Información oficial de sacudida')+'</b><a target="_blank" rel="noopener noreferrer" href="https://earthquake.usgs.gov/earthquakes/eventpage/'+encodeURIComponent(id)+'/shakemap/intensity">USGS ShakeMap ↗</a><a target="_blank" rel="noopener noreferrer" href="https://earthquake.usgs.gov/earthquakes/eventpage/'+encodeURIComponent(id)+'/dyfi/intensity">Did You Feel It? ↗</a><small>'+(en?'Available products only. ShakeMap estimates intensity; DYFI summarizes felt reports. Neither is an animation of measured wave travel.':'Sólo productos disponibles. ShakeMap estima intensidad; DYFI resume reportes sentidos. No son animaciones de propagación medida.')+'</small></div>';
  }
  function install(map,{picker=true,getLanguage=()=>document.documentElement.lang,geometry,getAdmin1=()=>null}={}){
    const L=window.L,en=()=>getLanguage()!=='es';let point=null,locked=false,busy=false,lastRequest=0,lookup=0;const cache=new Map();
    const control=L.control({position:'topleft'});let coords,place,button,source;
    control.onAdd=()=>{const box=L.DomUtil.create('div','map-coordinate-control');coords=document.createElement('strong');place=document.createElement('span');button=document.createElement('button');source=document.createElement('small');
      coords.textContent=en()?'Move over the map':'Mueve el puntero por el mapa';place.textContent=en()?'Coordinates · approximate land context':'Coordenadas · contexto terrestre aproximado';button.type='button';button.textContent=en()?'Find locality at this point':'Consultar localidad en este punto';button.disabled=true;
      source.textContent=en()?'Local polygons · locality on request (OSM)':'Polígonos locales · localidad bajo consulta (OSM)';box.append(coords,place,button,source);L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
      box.addEventListener('mouseenter',()=>locked=true);box.addEventListener('mouseleave',()=>locked=false);
      button.addEventListener('click',async()=>{if(!point||busy)return;const contextText=place.textContent,p={...point},key=p.lat.toFixed(5)+','+p.lng.toFixed(5),own=++lookup;let value=cache.get(key);busy=true;button.disabled=true;
        try{if(!value){if(Date.now()-lastRequest<1100)throw Error('RATE');lastRequest=Date.now();const url=new URL('https://nominatim.openstreetmap.org/reverse');url.search=new URLSearchParams({format:'jsonv2',lat:String(p.lat),lon:String(((p.lng+180)%360+360)%360-180),zoom:'10','accept-language':en()?'en':'es'});const response=await fetch(url,{signal:AbortSignal.timeout(10000),referrerPolicy:'strict-origin-when-cross-origin'});if(!response.ok)throw Error('LOOKUP');value=await response.json();if(!value.address)throw Error('EMPTY');cache.set(key,value);}
          if(own===lookup){const a=value.address;place.textContent=[a.city||a.town||a.village||a.hamlet||a.municipality,a.state||a.region,a.country].filter(Boolean).join(' · ');source.textContent=(en()?'Approximate OSM locality for ':'Localidad OSM aproximada de ')+coordinateText(p.lat,p.lng)+' · © OpenStreetMap contributors';}
        }catch(_){if(own===lookup)place.textContent=contextText+(en()?' · Locality service unavailable.':' · Servicio de localidad no disponible.');}finally{busy=false;button.disabled=false;}
      });return box;};control.addTo(map);
    function update(event){if(locked||!event.latlng||event.originalEvent?.target?.closest('.leaflet-control'))return;point={lat:event.latlng.lat,lng:event.latlng.lng};lookup++;coords.textContent=coordinateText(point.lat,point.lng);button.disabled=busy;
      const country=geometry?.features?.find(f=>contains(f,point.lng,point.lat)),admin=getAdmin1()?.features?.find(f=>contains(f,point.lng,point.lat));
      place.textContent=[admin?.properties?.[en()?'label_en':'label_es']||admin?.properties?.source_name,country?.properties?.NAME_EN||country?.properties?.ADMIN].filter(Boolean).join(' · ')||(en()?'Offshore / no local land match':'Mar / sin correspondencia terrestre local');source.textContent=en()?'Approximate Natural Earth context · locality on request':'Contexto Natural Earth aproximado · localidad bajo consulta';
    }
    map.on('mousemove click',update);map.on('unload',()=>lookup++);
    if(picker){let tile=null,active='local';const originals=new WeakMap(),base=L.control({position:'topright'});base.onAdd=()=>{const box=L.DomUtil.create('div','map-base-control'),label=document.createElement('label'),span=document.createElement('span'),select=document.createElement('select');span.textContent=en()?'Map background':'Fondo del mapa';select.setAttribute('aria-label',span.textContent);
      const labels={local:'Natural Earth · offline',osm:'OpenStreetMap','osm-hot':'OpenStreetMap · Humanitarian','usgs-topo':'USGS Topo','nasa-blue-marble':'NASA Blue Marble'};
      for(const id of Object.keys(window.SeismicBasemaps)){const o=document.createElement('option');o.value=id;o.textContent=labels[id];select.append(o);}
      function choose(id){if(tile){map.removeLayer(tile);tile=null;}active=id;select.value=id;map.eachLayer(layer=>{if(layer.feature?.geometry&&['Polygon','MultiPolygon'].includes(layer.feature.geometry.type)&&layer.setStyle){if(!originals.has(layer))originals.set(layer,layer.options.fillOpacity??.9);layer.setStyle({fillOpacity:id==='local'?originals.get(layer):.015});}});
        if(id!=='local'){const s=window.SeismicBasemaps[id];let errors=0;tile=L.tileLayer(s.url,{attribution:s.attribution,maxZoom:12,maxNativeZoom:s.maxNativeZoom??12,...(s.subdomains?{subdomains:s.subdomains}:{}),updateWhenIdle:true,keepBuffer:0}).addTo(map);tile.on('tileerror',()=>{if(++errors>=3&&active===id)choose('local');});}}
      select.addEventListener('change',()=>choose(select.value));label.append(span,select);box.append(label);L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);return box;};base.addTo(map);
    }
    return {control};
  }
  // Displace only rank labels in screen pixels. Leader lines terminate at the
  // original epicentres; observations, filters and exported coordinates stay intact.
  function declutterRanks(map,entries){
    const L=window.L,leaders=L.layerGroup().addTo(map);
    function draw(){leaders.clearLayers();const placed=[];
      for(const {marker,point,html} of entries){const p=map.latLngToLayerPoint(point);let offset=[0,0];
        const free=(dx,dy)=>placed.every(q=>Math.hypot(q[0]-p.x-dx,q[1]-p.y-dy)>=43);
        if(!free(0,0)){outer:for(let r=48;r<=240;r+=35)for(let i=0;i<16;i++){const angle=i*Math.PI/8,dx=Math.cos(angle)*r,dy=Math.sin(angle)*r;if(free(dx,dy)){offset=[dx,dy];break outer;}}}
        const [dx,dy]=offset;placed.push([p.x+dx,p.y+dy]);marker.setIcon(L.divIcon({className:'history-top-rank-marker',html,iconSize:[34,34],iconAnchor:[17-dx,17-dy]}));
        if(dx||dy){L.polyline([point,map.layerPointToLatLng([p.x+dx,p.y+dy])],{color:'#486675',weight:1.3,opacity:.85,interactive:false}).addTo(leaders);L.circleMarker(point,{radius:2.5,color:'#486675',weight:1,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(leaders);}
      }
    }map.on('zoomend moveend resize',draw);draw();
    return {dispose(){map.off('zoomend moveend resize',draw);map.removeLayer(leaders);}};
  }
  return Object.freeze({magnitudeColor,contains,coordinateText,shakingLinks,install,declutterRanks});
});
