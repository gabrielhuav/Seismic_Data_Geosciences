(function(root){
  'use strict';
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  function cards(catalogs,{lang='en',verified=()=>false}={}){
    const es=lang==='es',text=(en,sp)=>es?sp:en,n=x=>new Intl.NumberFormat(lang).format(x),e=escape;
    return catalogs.map((c,i)=>{const p=profile(c,lang),label=c.label?.[lang]||c.label?.en||c.id;
      const left=(c.years[0]-1900)/126*100,width=Math.max(1,(c.years[1]-c.years[0])/126*100);
      const distributor=c.provider==='usgs'?'USGS ComCat':c.provider==='ssn'?'SSN / UNAM':'NRCan / GSC';
      return `<article class="source-card source-contract"><header><span class="source-number">0${i+1}</span><div><span class="source-provider">${e(distributor)}</span><h3>${e(p.abbr)}</h3></div><span class="source-record-total">${n(c.event_count)}<small>${text('source rows','filas de origen')}</small></span></header><p class="source-role">${e(p.tag)}</p><p class="source-purpose">${e(p.purpose)}</p><div class="source-times"><b>${c.years[0]}–${c.years[1]}</b><span>M ≥ ${c.minimum_magnitude}</span></div><div class="source-timeline" aria-label="${e(label)}"><i style="left:${left}%;width:${width}%"></i></div><div class="source-time-axis"><span>1900</span><span>2026</span></div><dl><div><dt>${text('Seismological use','Uso sismológico')}</dt><dd>${e(p.science)}</dd></div><div><dt>${text('Computational contract','Contrato computacional')}</dt><dd>${e(p.adapter)}</dd></div></dl><p class="source-caution">${e(p.limit)}</p><div class="source-card-controls"><button data-source-catalog="${e(c.id)}">${text('Explore records','Explorar registros')} ↗</button><a href="${e(c.events_url)}" download>JSON</a><a href="${e(c.manifest_url)}" download>${text('Manifest','Manifiesto')}</a></div><details class="source-proof"><summary>${verified(c.id)?'✓ '+text('SHA-256 verified in this session','SHA-256 verificado en esta sesión'):text('Preserved package · SHA-256','Paquete conservado · SHA-256')}</summary><code class="hash">${e(c.sha256)}</code><p>${e(label)}</p></details></article>`;
    }).join('');
  }
  function inputs(catalogs,lang='en',active=''){
    return catalogs.map(c=>{const p=profile(c,lang);return `<button type="button" class="workbench-source ${active===c.id?'is-active':''}" data-workbench-catalog="${escape(c.id)}"><span>${escape(p.abbr)}</span><b>${new Intl.NumberFormat(lang).format(c.event_count)}</b><small>${c.years[0]}–${c.years[1]} · M ≥ ${c.minimum_magnitude}</small></button>`;}).join('');
  }
  const api={profile,cards,inputs};if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicSourceWorkbench=api;
})(typeof window==='object'?window:globalThis);
