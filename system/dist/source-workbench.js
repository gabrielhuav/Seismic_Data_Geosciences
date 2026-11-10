(function(root){
  'use strict';
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Catalogue identities, not provider identities: the two USGS packages retain
  // distinct symbols even though they share a distributor and some event IDs.
  const identities=Object.freeze({
    'usgs-na-2020-2025':Object.freeze({catalogue_id:'usgs-na-2020-2025',code:'01',label:'USGS · NA',color:'#2563eb',shape:'circle'}),
    'usgs-mx-historical':Object.freeze({catalogue_id:'usgs-mx-historical',code:'02',label:'USGS · MX',color:'#7c3aed',shape:'square'}),
    'nrcan-ca-historical':Object.freeze({catalogue_id:'nrcan-ca-historical',code:'03',label:'NRCan · CA',color:'#c28112',shape:'triangle'}),
    'ssn-mx-historical':Object.freeze({catalogue_id:'ssn-mx-historical',code:'04',label:'SSN · MX',color:'#0d9471',shape:'diamond'})
  });
  function identity(catalogue){const id=typeof catalogue==='string'?catalogue:catalogue?.id;return identities[id]||{catalogue_id:id||null,code:'?',label:id||'Unknown catalogue',color:'#64748b',shape:'circle'};}
  function markerPath(ctx,x,y,r,shape='circle'){
    if(shape==='square'){ctx.rect(x-r*.88,y-r*.88,r*1.76,r*1.76);return;}
    if(shape==='triangle'){ctx.moveTo(x,y-r);ctx.lineTo(x+r*.95,y+r*.8);ctx.lineTo(x-r*.95,y+r*.8);ctx.closePath();return;}
    if(shape==='diamond'){ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();return;}
    ctx.arc(x,y,r,0,Math.PI*2);
  }
  const swatch=s=>`<i class="source-swatch shape-${escape(s.shape)}" aria-hidden="true"></i>`;
  function profile(c,lang='en'){
    const es=lang==='es',pair=(en,sp)=>es?sp:en;
    if(c.id==='usgs-na-2020-2025')return {
      tag:pair('COMMON COMPARISON WINDOW','VENTANA COMÚN DE COMPARACIÓN'),
      purpose:pair('Compare countries within one distributor and the same 2020–2025 window.','Compara países con un distribuidor y la misma ventana 2020–2025.'),
      science:pair('Reported magnitude types and documented depth in km support separate descriptive groups.','Los tipos de magnitud reportados y la profundidad documentada en km permiten grupos descriptivos separados.'),
      adapter:pair('ComCat ID → source identity · ISO UTC → time · literal magType retained','ID ComCat → identidad de origen · UTC ISO → tiempo · magType literal conservado'),
      limit:pair('A shared window does not establish completeness or equal detection across countries.','Una ventana común no acredita completitud ni detección equivalente entre países.'),abbr:'USGS · NA'};
    if(c.id==='usgs-mx-historical')return {
      tag:pair('HISTORICAL CONTEXT + REVISION PILOT','CONTEXTO HISTÓRICO + PILOTO DE REVISIONES'),
      purpose:pair('Explore the Mexico-region snapshot and inspect retained product revisions separately.','Explora la instantánea regional de México y consulta por separado las revisiones conservadas.'),
      science:pair('Reported origins, magnitude types and uncertainties retain their source semantics.','Orígenes, tipos de magnitud e incertidumbres mantienen su significado de origen.'),
      adapter:pair('ComCat ID retained · exact ID overlap flagged against USGS North America','ID ComCat conservado · coincidencia exacta marcada frente a USGS Norteamérica'),
      limit:pair('The two USGS packages can share events; overlap flags retain both source rows.','Los dos paquetes USGS pueden compartir eventos; las marcas conservan ambas filas.'),abbr:'USGS · MX'};
    if(c.provider==='ssn')return {
      tag:pair('DIRECT NATIONAL OBSERVATIONS','OBSERVACIONES NACIONALES DIRECTAS'),
      purpose:pair('Examine SSN/UNAM records through 6 November 2026, including offshore observations.','Examina registros SSN/UNAM hasta el 6 de noviembre de 2026, incluidos los de mar adentro.'),
      science:pair('Native reported magnitudes and depth in km; annual coverage is also available for the full CSV.','Magnitudes nativas reportadas y profundidad en km; también hay cobertura anual del CSV completo.'),
      adapter:pair('Source date + UTC time → ISO time · derived row key · raw source text retained','Fecha + hora UTC → tiempo ISO · clave de fila derivada · texto crudo conservado'),
      limit:pair('Magnitude type is unreported. No conversion to Mw; 2026 is partial.','Tipo de magnitud no reportado. Sin conversión a Mw; 2026 es parcial.'),abbr:'SSN · MX'};
    return {
      tag:pair('CANADIAN HISTORICAL CONTEXT','CONTEXTO HISTÓRICO CANADIENSE'),
      purpose:pair('Study preserved Canadian and surrounding observations from 1985–2019.','Estudia observaciones conservadas de Canadá y alrededores de 1985–2019.'),
      science:pair('Historical distributions retain reported magnitude values and their literal types.','Las distribuciones históricas conservan magnitudes reportadas y tipos literales.'),
      adapter:pair('CSV columns → common fields · derived row key · raw depth preserved','Columnas CSV → campos comunes · clave de fila derivada · profundidad cruda conservada'),
      limit:pair('Source depth unit is undocumented: excluded from km summaries and depth filters.','Unidad de profundidad no documentada: se excluye de resúmenes y filtros en km.'),abbr:'NRCan · CA'};
  }
  function cards(catalogs,{lang='en',verified=()=>false,active=''}={}){
    const es=lang==='es',text=(en,sp)=>es?sp:en,n=x=>new Intl.NumberFormat(lang).format(x),e=escape;
    return catalogs.map((c,i)=>{const p=profile(c,lang),label=c.label?.[lang]||c.label?.en||c.id,s=identity(c),selected=active===c.id||active==='all-catalogs';
      const left=(c.years[0]-1900)/126*100,width=Math.max(1,(c.years[1]-c.years[0])/126*100);
      const distributor=c.provider==='usgs'?'USGS ComCat':c.provider==='ssn'?'SSN / UNAM':'NRCan / GSC';
      return `<article class="source-card source-contract${selected?' is-active':''}" data-source-card="${e(c.id)}" style="--catalogue-color:${s.color}"><header><span class="source-number">${swatch(s)}${e(s.code)}</span><div><span class="source-provider">${e(distributor)}</span><h3><button type="button" class="source-select-title" data-source-catalog="${e(c.id)}">${e(p.abbr)} ↗</button></h3></div><span class="source-record-total">${n(c.event_count)}<small>${text('source rows','filas de origen')}</small></span></header><p class="source-map-identity">${swatch(s)}${text('Map symbol','Símbolo en el mapa')} · ${e(s.code)}${selected?' · '+text('Active selection','Selección activa'):''}</p><p class="source-role">${e(p.tag)}</p><p class="source-purpose">${e(p.purpose)}</p><div class="source-times"><b>${c.years[0]}–${c.years[1]}</b><span>M ≥ ${c.minimum_magnitude}</span></div><div class="source-timeline" aria-label="${e(label)}"><i style="left:${left}%;width:${width}%"></i></div><div class="source-time-axis"><span>1900</span><span>2026</span></div><dl><div><dt>${text('Seismological use','Uso sismológico')}</dt><dd>${e(p.science)}</dd></div><div><dt>${text('Computational contract','Contrato computacional')}</dt><dd>${e(p.adapter)}</dd></div></dl><p class="source-caution">${e(p.limit)}</p><div class="source-card-controls"><button data-source-catalog="${e(c.id)}">${text('Explore records','Explorar registros')} ↗</button><a href="${e(c.events_url)}" download>JSON</a><a href="${e(c.manifest_url)}" download>${text('Manifest','Manifiesto')}</a></div><details class="source-proof"><summary>${verified(c.id)?'✓ '+text('SHA-256 verified in this session','SHA-256 verificado en esta sesión'):text('Preserved package · SHA-256','Paquete conservado · SHA-256')}</summary><code class="hash">${e(c.sha256)}</code><p>${e(label)}</p></details></article>`;
    }).join('');
  }
  function inputs(catalogs,lang='en',active=''){
    return catalogs.map(c=>{const p=profile(c,lang),s=identity(c);return `<button type="button" class="workbench-source ${active===c.id||active==='all-catalogs'?'is-active':''}" data-workbench-catalog="${escape(c.id)}" style="--catalogue-color:${s.color}"><span class="workbench-source-name">${swatch(s)}<span class="source-code">${s.code}</span>${escape(p.abbr)}</span><b>${new Intl.NumberFormat(lang).format(c.event_count)}</b><small>${c.years[0]}–${c.years[1]} · M ≥ ${c.minimum_magnitude}</small></button>`;}).join('');
  }
  function focus(catalogs,{lang='en',active='',selectedRows=0,selectionLabel='',extent=()=>null,verified=()=>false}={}){
    const es=lang==='es',t=(en,sp)=>es?sp:en,n=v=>new Intl.NumberFormat(lang).format(v),e=escape;
    const c=catalogs.find(c=>c.id===active);
    if(!c)return `<div class="source-focus-heading"><p class="eyebrow">${t('SOURCE IDENTITY','IDENTIDAD DE ORIGEN')}</p><h3>${t('Four catalogues, three distributors','Cuatro catálogos, tres distribuidores')}</h3></div><div class="source-focus-count"><strong>${n(selectedRows)}</strong><span>${t('selected source rows','filas de origen seleccionadas')}</span></div><div class="source-focus-combined">${catalogs.map(c=>{const s=identity(c);return `<span style="--catalogue-color:${s.color}">${swatch(s)}<b>${s.code} ${e(s.label)}</b><small>${n(c.event_count)}</small></span>`;}).join('')}</div><p>${t('Each package keeps its original identifiers, period, reported values and input hashes. Exact USGS ID overlaps retain both source rows.','Cada paquete conserva sus identificadores, periodo, valores reportados y hashes. Las coincidencias exactas de ID USGS retienen ambas filas de origen.')}</p><p class="source-focus-limit">${t('Overlaying records does not create independent physical earthquakes or a homogenized magnitude scale.','Superponer registros no crea sismos físicos independientes ni una escala de magnitud homogénea.')}</p>`;
    const s=identity(c),p=profile(c,lang),time=extent(c.id),dates=time?.first&&time?.last?`${time.first} → ${time.last}`:t('Select this source to inspect its observed interval.','Selecciona esta fuente para consultar su intervalo observado.');
    const idLabel=c.identifier_kind==='derived_row_key'?t('Derived row key; no official event ID supplied','Clave de fila derivada; sin ID oficial suministrado'):t('Original ComCat event identifier retained','Identificador original de evento ComCat conservado');
    const magLabel=c.magnitude_type_status==='not_provided_in_source'?t('Type unreported; not converted to Mw','Tipo no reportado; sin conversión a Mw'):t('Literal reported types retained; no conversion','Tipos reportados literales; sin conversión');
    const depthLabel=c.provider==='usgs'||c.depth_unit==='km'?t('Documented kilometres','Kilómetros documentados'):t('Raw value only; unit undocumented','Sólo valor crudo; unidad no documentada');
    return `<div class="source-focus-heading" style="--catalogue-color:${s.color}"><span class="source-focus-symbol">${swatch(s)}</span><div><p class="eyebrow">${t('ACTIVE CATALOGUE','CATÁLOGO ACTIVO')} · ${s.code}</p><h3>${e(s.label)}</h3><p>${e(c.provider_name)}</p></div></div><div class="source-focus-count"><strong>${n(selectedRows)}</strong><span>${t('selected of','seleccionadas de')} ${n(c.event_count)} ${t('source rows','filas de origen')}</span></div><p class="source-focus-selection">${e(selectionLabel)}</p><dl class="source-focus-fields"><div><dt>${t('Coverage','Cobertura')}</dt><dd>${e(c.label?.[lang]||c.label?.en||c.id)} · M ≥ ${c.minimum_magnitude}</dd></div><div><dt>${t('Record identity','Identidad de fila')}</dt><dd>${idLabel}</dd></div><div><dt>${t('Magnitude type','Tipo de magnitud')}</dt><dd>${magLabel}</dd></div><div><dt>${t('Depth','Profundidad')}</dt><dd>${depthLabel}</dd></div></dl><p class="source-focus-limit">${e(p.limit)}</p><details class="source-focus-proof"><summary>${t('UTC interval and source evidence','Intervalo UTC y evidencia de origen')}</summary><p>${e(dates)}</p><p>${verified(c.id)?'✓ '+t('Package SHA-256 verified in this session','SHA-256 del paquete verificado en esta sesión'):t('Preserved source hash','Hash de origen conservado')}</p><code>${e(c.sha256)}</code><div><a href="${e(c.events_url)}" download>JSON</a><a href="${e(c.manifest_url)}" download>${t('Manifest','Manifiesto')}</a></div></details>`;
  }
  function intervalPosition(range){
    const start=Date.UTC(1900,0,1),end=Date.UTC(2027,0,1),first=Date.parse(range?.first),last=Date.parse(range?.last);
    if(!Number.isFinite(first)||!Number.isFinite(last)||first>last)return null;
    const left=Math.max(0,Math.min(1,(first-start)/(end-start))),right=Math.max(0,Math.min(1,(last-start)/(end-start)));
    return {left:left*100,width:(right-left)*100,first:range.first,last:range.last};
  }
  function timeline(catalogs,{lang='en',active='',extent=()=>null}={}){
    const es=lang==='es',t=(en,sp)=>es?sp:en,n=v=>new Intl.NumberFormat(lang).format(v),e=escape;
    const axis=[1900,1920,1940,1960,1980,2000,2026].map(year=>`<span style="left:${(Date.UTC(year,0,1)-Date.UTC(1900,0,1))/(Date.UTC(2027,0,1)-Date.UTC(1900,0,1))*100}%">${year}</span>`).join('');
    return `<div class="source-tracks-axis">${axis}</div>`+catalogs.map(c=>{const s=identity(c),range=intervalPosition(extent(c.id)),selected=active===c.id||active==='all-catalogs';
      const actual=range?`${range.first.replace('T',' ').replace('Z',' UTC')} → ${range.last.replace('T',' ').replace('Z',' UTC')}`:t('Observed interval available after verified loading','Intervalo observado disponible tras carga verificada');
      return `<button type="button" class="source-track${selected?' is-active':''}" data-source-catalog="${e(c.id)}" style="--catalogue-color:${s.color}" aria-pressed="${selected}"><span class="source-track-heading">${swatch(s)}<b>${s.code} ${e(s.label)}</b><strong>${n(c.event_count)}</strong></span><span class="source-track-plot" aria-label="${e(actual)}"><span class="source-track-grid"></span>${range?`<i style="left:${range.left}%;width:${Math.max(.3,range.width)}%"></i>`:''}</span><span class="source-track-dates">${e(actual)}</span>${c.provider==='ssn'?`<span class="source-track-partial">${t('2026 partial through 6 November','2026 parcial hasta el 6 de noviembre')}</span>`:''}</button>`;
    }).join('')+`<p class="source-tracks-note">${t('Intervals run from the first to last selected recorded origin time, inclusive. They do not imply continuous observations or completeness. Click a track to inspect its real records on the map.','Los intervalos van de la primera a la última hora de origen seleccionada y registrada, incluidas. No implican observación continua ni completitud. Pulsa una pista para consultar sus registros reales en el mapa.')}</p>`;
  }
  const api={profile,cards,inputs,focus,timeline,intervalPosition,identity,identities,markerPath};if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicSourceWorkbench=api;
})(typeof window==='object'?window:globalThis);
