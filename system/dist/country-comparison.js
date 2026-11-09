(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicCountryComparison=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const countryNames={CAN:{es:'Canadá',en:'Canada'},MEX:{es:'México',en:'Mexico'},USA:{es:'Estados Unidos',en:'United States'}};
  const countryCodes={CAN:'CA',MEX:'MX',USA:'US'};
  const defaults=Object.freeze({countryA:'CAN',countryB:'MEX',yearFrom:2020,yearTo:2025,minMag:4.5,magType:'mww'});
  const finite=v=>typeof v==='number'&&Number.isFinite(v),copy=v=>JSON.parse(JSON.stringify(v??null));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function describe(values){
    const x=values.filter(finite).sort((a,b)=>a-b);let mean=0,m2=0,n=0;
    for(const v of x){const d=v-mean;mean+=d/++n;m2+=d*(v-mean);}
    return {n,mean:n?mean:null,median:n?(n%2?x[Math.floor(n/2)]:(x[n/2-1]+x[n/2])/2):null,sample_sd:n>1?Math.sqrt(Math.max(0,m2/(n-1))):null,minimum:n?x[0]:null,maximum:n?x[n-1]:null};
  }
  function validate(data,raw){
    if(!data||data.catalog?.id!=='usgs-na-2020-2025'||data.catalog.provider!=='usgs'||!Array.isArray(data.events))throw new Error('COMPARISON_SOURCE');
    const f={...defaults,...raw};
    if(!Object.hasOwn(countryNames,f.countryA)||!Object.hasOwn(countryNames,f.countryB)||f.countryA===f.countryB)throw new Error('COMPARISON_COUNTRIES');
    const [lo,hi]=data.catalog.years;
    if(!Number.isInteger(f.yearFrom)||!Number.isInteger(f.yearTo)||f.yearFrom<lo||f.yearTo>hi||f.yearFrom>f.yearTo||!finite(f.minMag)||f.minMag<3.5||f.minMag>10)throw new Error('COMPARISON_FILTERS');
    if(typeof f.magType!=='string'||!f.magType||!data.events.some(e=>(e.magType??e.mag_type)===f.magType))throw new Error('COMPARISON_TYPE');
    return f;
  }
  function compute(data,filters={}){
    const f=validate(data,filters);
    const all=data.events.filter(e=>{const year=Number.isInteger(e.year)?e.year:Number(String(e.time).slice(0,4));return year>=f.yearFrom&&year<=f.yearTo&&finite(e.mag)&&e.mag>=f.minMag&&(e.magType??e.mag_type)===f.magType;});
    const countries=[f.countryA,f.countryB].map(id=>{
      const selected=all.filter(e=>e.country_id===id),years=[];
      for(let year=f.yearFrom;year<=f.yearTo;year++)years.push({year,record_count:selected.filter(e=>(Number.isInteger(e.year)?e.year:Number(String(e.time).slice(0,4)))===year).length});
      return {country_id:id,record_count:selected.length,magnitude:describe(selected.map(e=>e.mag)),depth_km:describe(selected.map(e=>e.depth_km??e.depth)),annual_counts:years,
        ordered_record_ids:selected.map(e=>e.id??e.record_key),records:selected.map(e=>({record_key:e.id??e.record_key,year:Number.isInteger(e.year)?e.year:Number(String(e.time).slice(0,4)),mag:e.mag,mag_type:e.magType??e.mag_type,depth_km:finite(e.depth_km??e.depth)?(e.depth_km??e.depth):null}))};
    });
    // Quarter-unit bins have exactly representable edges. The two selections use
    // one domain, one width and the same [lower,upper) rule. No density smoothing
    // or population/area normalization is performed. Even an empty case has an
    // explicitly labelled zero bin rather than an invented magnitude summary.
    const width=.25,start=Math.floor(f.minMag/width)*width;
    let maximum=start;for(const c of countries)for(const e of c.records)maximum=Math.max(maximum,e.mag);
    const count=Math.max(1,Math.floor((maximum-start)/width)+1);
    const edges=Array.from({length:count+1},(_,i)=>start+i*width);
    for(const c of countries){
      c.magnitude_bins=Array.from({length:count},(_,i)=>({lower:edges[i],upper:edges[i+1],record_count:0}));
      for(const e of c.records)c.magnitude_bins[Math.floor((e.mag-start)/width)].record_count++;
    }
    const outside=all.filter(e=>['outside','boundary','invalid'].includes(e.country_id)).length;
    return {schema:'seismic-country-comparison/1',filters:f,countries,distribution:{bin_width:width,edges,closure:'lower inclusive; upper exclusive',counting_unit:'retained source rows',normalization:'none'},input:{catalogue_id:data.catalog.id,provider:data.catalog.provider,catalogue:copy(data.catalog),hashes:copy(data.hashes),geography:copy(data.geographyEvidence)},scope:{matching_before_country:all.length,selected_country_records:countries.reduce((n,c)=>n+c.record_count,0),outside_boundary_or_invalid:outside},
      limits:['Two terrestrial classes from the same fixed USGS North America catalogue, common UTC years, reported magnitude threshold and exact magnitude type.','Counts are preserved source records, not independent earthquakes or measures normalized by area/population.','Offshore, boundary and invalid-coordinate rows are excluded from country selections.','A zero annual or magnitude bin means no selected rows in this snapshot, not no physical earthquakes.','Common magnitude bins are 0.25 units wide and lower-inclusive, upper-exclusive; no smoothing or scale conversion.','Completeness, scale homogenization, hazard, causal attribution and earthquake prediction are not established.']};
  }
  // Existing CSV columns and row types are retained. The additive JSON output
  // also contains exact shared-bin counts; every original selected row remains.
  function csv(result){
    const h=['row_type','country_id','utc_year','record_key','reported_mag','mag_type','depth_km','record_count','mean_mag','median_mag','sample_sd_mag','mean_depth_km','depth_n','catalogue_id','from_year','to_year','min_mag','exact_mag_type','source_hashes','geography_evidence'];
    const rows=[h],f=result.filters;
    const tail=[result.input.catalogue_id,f.yearFrom,f.yearTo,f.minMag,f.magType,JSON.stringify(result.input.hashes),JSON.stringify(result.input.geography)];
    for(const c of result.countries){
      rows.push(['summary',c.country_id,'','','','','',c.record_count,c.magnitude.mean,c.magnitude.median,c.magnitude.sample_sd,c.depth_km.mean,c.depth_km.n,...tail]);
      for(const y of c.annual_counts)rows.push(['annual',c.country_id,y.year,'','','','',y.record_count,'','','','','',...tail]);
      for(const e of c.records)rows.push(['record',c.country_id,e.year,e.record_key,e.mag,e.mag_type,e.depth_km,'','','','','','',...tail]);
    }
    return rows.map(row=>row.map(v=>{const s=v==null?'':String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\r\n')+'\r\n';
  }
  const text={
    es:{eyebrow:'UNA FUENTE · DOS SELECCIONES',title:'Compara dos regiones en el mismo contexto',intro:'Observa cómo se distribuyen las magnitudes y los registros anuales con criterios compartidos.',source:'USGS Norteamérica · instantánea 2020–2025',countryA:'Primer país',countryB:'Segundo país',period:'Período compartido · UTC',from:'Año inicial',to:'Año final',min:'M reportada mínima',type:'Tipo exacto de magnitud',run:'Actualizar comparación',criteria:'Criterios de magnitud',loading:'Preparando el catálogo verificado…',pending:'Tienes cambios sin aplicar. Actualiza la comparación; las vistas anteriores siguen identificadas por sus criterios.',count:'registros seleccionados',mean:'M media',median:'Mediana',sd:'DE muestral',depth:'Profundidad media',valid:'n válido',range:'Rango observado de M',records:'Registros',annual:'Conteos anuales · mismo período',distribution:'Distribución de magnitudes',distributionSub:'Los mismos intervalos para ambos países',annualSub:'Cada punto conserva el conteo de su año',annualNote:'Las líneas sólo conectan conteos anuales; no representan una tasa continua.',binsNote:'Intervalos comunes de 0.25 M: incluyen el límite inferior y excluyen el superior. Sin suavizado ni conversión de escala.',zero:'Un cero significa cero filas seleccionadas; no ausencia de terremotos físicos.',null:'NULL · desconocido o no calculable',empty:'No hay filas seleccionadas. No se estiman medias ni rangos.',unknownDepth:'profundidades sin km documentados',exact:'Consultar los conteos exactos',year:'Año UTC',bin:'Intervalo de M',downloadCsv:'Descargar CSV',downloadJson:'Descargar JSON y evidencia',evidence:'Procedencia y límites de esta comparación',notice:'País significa contención terrestre aproximada; se excluyen mar y límites. Los conteos no están normalizados por área o población ni establecen independencia. No se estima completitud, amenaza o probabilidad.',error:'Revisa que los países sean distintos, el período esté entre 2020 y 2025 y la magnitud sea válida.',scope:'Registros de origen conservados; no terremotos únicos ni una medida de amenaza.',note:'CSV: resúmenes, años y cada fila seleccionada. JSON: también los intervalos compartidos. Ambos conservan criterios, identificadores y hashes.',applied:'Criterios aplicados',same:'Un catálogo, un período y un tipo literal de magnitud',magnitudeAxis:'M reportada',countAxis:'Filas seleccionadas'},
    en:{eyebrow:'ONE SOURCE · TWO SELECTIONS',title:'Compare two regions in the same context',intro:'See the magnitude distribution and annual records under shared selection criteria.',source:'USGS North America · 2020–2025 snapshot',countryA:'First country',countryB:'Second country',period:'Shared period · UTC',from:'First year',to:'Last year',min:'Minimum reported M',type:'Exact magnitude type',run:'Update comparison',criteria:'Magnitude criteria',loading:'Preparing the verified catalogue…',pending:'You have unapplied changes. Update the comparison; previous views remain labelled with their applied criteria.',count:'selected source rows',mean:'Mean M',median:'Median',sd:'Sample SD',depth:'Mean depth',valid:'valid n',range:'Observed M range',records:'Records',annual:'Annual counts · same period',distribution:'Magnitude distribution',distributionSub:'The same intervals for both countries',annualSub:'Each point retains its annual record count',annualNote:'Lines only connect annual counts; they do not represent a continuous rate.',binsNote:'Common 0.25 M bins: lower-inclusive, upper-exclusive. No smoothing or magnitude-scale conversion.',zero:'A zero means zero selected rows, not no physical earthquakes.',null:'NULL · unknown or not calculable',empty:'No selected rows. Means and ranges are not estimated.',unknownDepth:'depths without documented km',exact:'Inspect the exact counts',year:'UTC year',bin:'M interval',downloadCsv:'Download CSV',downloadJson:'Download JSON and evidence',evidence:'Provenance and limits of this comparison',notice:'Country means approximate land containment; offshore and boundary rows are excluded. Counts are not normalized by area or population and do not establish independence. Completeness, hazard or probability is not estimated.',error:'Check that countries differ, the period is within 2020–2025 and the magnitude is valid.',scope:'Preserved source records, not unique earthquakes or a measure of hazard.',note:'CSV: summaries, years and every selected row. JSON: shared bins too. Both retain criteria, identifiers and input hashes.',applied:'Applied criteria',same:'One catalogue, one period and one literal magnitude type',magnitudeAxis:'Reported M',countAxis:'Selected rows'}
  };
  const colors=['var(--compare-a,#176d99)','var(--compare-b,#c36b32)'];
  const plotNumber=v=>Number(v).toLocaleString('en',{maximumFractionDigits:2});
  function plotStart(title,description,viewBox){return `<svg class="comparison-native-chart" viewBox="${viewBox}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><desc>${esc(description)}</desc><g font-family="Arial,Helvetica,sans-serif" fill="currentColor">`;}
  function chart(result,language='en'){
    const lang=language==='es'?'es':'en',t=text[lang],a=result.countries[0],b=result.countries[1],years=a.annual_counts;
    const maximum=Math.max(1,...result.countries.flatMap(c=>c.annual_counts.map(y=>y.record_count))),step=Math.max(1,Math.ceil(maximum/4)),ceiling=Math.ceil(maximum/step)*step;
    const left=64,right=770,top=42,bottom=280,span=right-left,x=i=>left+span*(i+.5)/years.length,y=n=>bottom-(bottom-top)*n/ceiling;
    const description=result.countries.map(c=>countryNames[c.country_id][lang]+': '+c.annual_counts.map(r=>r.year+'='+r.record_count).join(', ')).join('. ')+'. '+t.zero;
    let s=plotStart(t.annual,description,'0 0 800 370');
    for(let n=0;n<=ceiling;n+=step)s+=`<path d="M${left} ${y(n)}H${right}" stroke="currentColor" opacity="${n?.11:.3}" fill="none"/><text class="comparison-axis" x="${left-14}" y="${y(n)+8}" text-anchor="end">${n}</text>`;
    for(let i=0;i<years.length;i++)s+=`<text class="comparison-axis" x="${x(i)}" y="331" text-anchor="middle">${years[i].year}</text>`;
    for(let j=0;j<2;j++){
      const c=result.countries[j],points=c.annual_counts.map((v,i)=>[x(i),y(v.record_count)]),name=countryNames[c.country_id][lang];
      s+=`<path d="${points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')}" fill="none" stroke="${colors[j]}" stroke-width="3" opacity=".75"/>`;
      for(let i=0;i<points.length;i++){
        const [px,py]=points[i],n=c.annual_counts[i].record_count,tip=esc(name+' · '+years[i].year+': '+n);
        s+=j?`<path d="M${px} ${py-8}l8 8-8 8-8-8Z" fill="${n?colors[j]:'var(--compare-paper,#fff)'}" stroke="${colors[j]}" stroke-width="3"><title>${tip}</title></path>`:`<circle cx="${px}" cy="${py}" r="7" fill="${n?colors[j]:'var(--compare-paper,#fff)'}" stroke="${colors[j]}" stroke-width="3"><title>${tip}</title></circle>`;
        s+=`<text class="comparison-value" x="${px}" y="${py+(j?28:-14)}" text-anchor="middle" fill="${colors[j]}">${n}</text>`;
      }
    }
    s+=`<text class="comparison-axis-title" x="${left}" y="22">${esc(t.countAxis)}</text><text class="comparison-axis-title" x="417" y="366" text-anchor="middle">${esc(t.year)}</text></g></svg>`;
    return s;
  }
  function distributionChart(result,language='en'){
    const lang=language==='es'?'es':'en',t=text[lang],a=result.countries[0],b=result.countries[1],bins=a.magnitude_bins;
    const max=Math.max(1,...result.countries.flatMap(c=>c.magnitude_bins.map(x=>x.record_count)));
    const step=Math.max(1,Math.ceil(max/3)),ceiling=Math.ceil(max/step)*step,mid=400,half=260,gutter=70,top=52,row=28,height=top+bins.length*row+58;
    const description=result.countries.map(c=>countryNames[c.country_id][lang]+': '+c.magnitude_bins.map(bin=>'['+bin.lower+','+bin.upper+')='+bin.record_count).join('; ')).join('. ')+'. '+t.binsNote+' '+t.zero;
    let s=plotStart(t.distribution,description,'0 0 800 '+height);
    for(let n=0;n<=ceiling;n+=step){const dx=n/ceiling*half;for(const sign of [-1,1]){const px=mid+sign*(gutter+dx);s+=`<path d="M${px} ${top-5}V${top+bins.length*row}" stroke="currentColor" opacity=".09" fill="none"/><text class="comparison-axis" x="${px}" y="${top-19}" text-anchor="middle">${n}</text>`;}}
    for(let i=0;i<bins.length;i++){
      const cy=top+i*row+10,label=plotNumber(bins[i].lower)+'–'+plotNumber(bins[i].upper);
      s+=`<text class="comparison-bin-label" x="${mid}" y="${cy+5}" text-anchor="middle">${esc(label)}</text>`;
      for(let j=0;j<2;j++){
        const n=result.countries[j].magnitude_bins[i].record_count,w=n/ceiling*half,px=j?mid+gutter:mid-gutter-w;
        if(n)s+=`<rect x="${px}" y="${cy-8}" width="${w}" height="16" rx="4" fill="${colors[j]}"><title>${esc(countryNames[result.countries[j].country_id][lang])} · [${bins[i].lower}, ${bins[i].upper}): ${n}</title></rect>`;
        else s+=`<circle cx="${j?mid+gutter:mid-gutter}" cy="${cy}" r="3" fill="none" stroke="${colors[j]}" opacity=".55"><title>${esc(countryNames[result.countries[j].country_id][lang])}: 0</title></circle>`;
      }
    }
    s+=`<text class="comparison-axis-title" x="${mid}" y="${height-20}" text-anchor="middle">${esc(t.magnitudeAxis)} · ${esc(t.countAxis)}</text></g></svg>`;
    return s;
  }
  function rangeChart(c,result,lang){
    const t=text[lang],m=c.magnitude;if(!m.n)return `<p class="comparison-null">${esc(t.empty)}</p>`;
    const edges=result.distribution.edges,min=edges[0],max=edges[edges.length-1],x=v=>16+328*(v-min)/(max-min),label=t.range+': '+plotNumber(m.minimum)+'–'+plotNumber(m.maximum)+'; '+t.median+' '+plotNumber(m.median);
    return `<svg class="comparison-range" viewBox="0 0 360 32" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><path d="M16 16H344" stroke="currentColor" opacity=".13" stroke-width="6" stroke-linecap="round"/><path d="M${x(m.minimum)} 16H${x(m.maximum)}" stroke="currentColor" stroke-width="8" opacity=".55" stroke-linecap="round"/><circle cx="${x(m.minimum)}" cy="16" r="5" fill="currentColor"/><circle cx="${x(m.maximum)}" cy="16" r="5" fill="currentColor"/><path d="M${x(m.median)} 3V29" stroke="currentColor" stroke-width="3"/></svg>`;
  }
  function mount(element,options={}){
    let data=null,result=null,request=0,disposed=false,pending=false;
    const lang=()=>options.getLanguage?.()==='en'?'en':'es',t=()=>text[lang()],f={...defaults};
    const fmt=(v,digits=4)=>v==null?'NULL':Number(v).toLocaleString(lang(),{maximumFractionDigits:digits});
    function criteriaLabel(){return 'M ≥ '+fmt(f.minMag)+' · '+f.magType;}
    function markup(){
      const v=t(),l=lang();element.classList.add('country-comparison');
      element.innerHTML=`<header class="comparison-heading"><div><p class="comparison-eyebrow">${esc(v.eyebrow)}</p><h2>${esc(v.title)}</h2><p class="comparison-intro">${esc(v.intro)}</p></div><p class="comparison-source"><span class="comparison-verified-mark" aria-hidden="true">${data?'✓':'·'}</span>${esc(v.source)}</p></header><form class="comparison-controls"><div class="comparison-region-inputs"><label>${esc(v.countryA)}<select data-compare="countryA">${Object.keys(countryNames).map(c=>`<option value="${c}"${f.countryA===c?' selected':''}>${esc(countryNames[c][l])}</option>`).join('')}</select></label><span class="comparison-between" aria-hidden="true">↔</span><label>${esc(v.countryB)}<select data-compare="countryB">${Object.keys(countryNames).map(c=>`<option value="${c}"${f.countryB===c?' selected':''}>${esc(countryNames[c][l])}</option>`).join('')}</select></label></div><fieldset class="comparison-period"><legend>${esc(v.period)}</legend><div class="comparison-period-inputs"><label><span class="comparison-sr-only">${esc(v.from)}</span><input data-compare="yearFrom" type="number" min="2020" max="2025" required value="${f.yearFrom}"></label><span aria-hidden="true">—</span><label><span class="comparison-sr-only">${esc(v.to)}</span><input data-compare="yearTo" type="number" min="2020" max="2025" required value="${f.yearTo}"></label></div></fieldset><details class="comparison-criteria"><summary><span>${esc(v.criteria)}</span><strong data-criteria-label>${esc(criteriaLabel())}</strong></summary><div><label>${esc(v.min)}<input data-compare="minMag" type="number" min="3.5" max="10" step="0.1" required value="${f.minMag}"></label><label>${esc(v.type)}<select data-compare="magType">${(data?[...new Set(data.events.map(e=>e.magType??e.mag_type).filter(Boolean))].sort():['mww']).map(c=>`<option value="${esc(c)}"${f.magType===c?' selected':''}>${esc(c)}</option>`).join('')}</select></label></div></details><button class="primary comparison-run" type="submit"${data?'':' disabled'}>${esc(v.run)} <span aria-hidden="true">↗</span></button></form><p class="comparison-status" role="status" aria-live="polite"></p><div class="comparison-output"></div>`;
      function readControls(){for(const [name,value]of Object.entries(f)){const control=element.querySelector(`[data-compare="${name}"]`);f[name]=typeof value==='number'?Number(control.value):control.value;}element.querySelector('[data-criteria-label]').textContent=criteriaLabel();}
      for(const control of element.querySelectorAll('[data-compare]'))control.addEventListener('input',()=>{readControls();pending=true;element.classList.add('comparison-pending');element.querySelector('.comparison-status').textContent=v.pending;for(const button of element.querySelectorAll('[data-format]'))button.disabled=true;});
      element.querySelector('form').addEventListener('submit',event=>{event.preventDefault();readControls();run();});
    }
    function legend(){const l=lang();return `<div class="comparison-key">${result.countries.map((c,i)=>`<span><i class="comparison-marker comparison-marker-${i}" aria-hidden="true"></i>${esc(countryNames[c.country_id][l])}</span>`).join('')}</div>`;}
    function render(){
      if(!result)return;const v=t(),l=lang(),a=result.countries[0],b=result.countries[1],applied=result.filters;
      const metric=(label,value,note='')=>`<div><dt>${esc(label)}</dt><dd${value==='NULL'?` title="${esc(v.null)}"`:''}>${esc(value)}</dd>${note?`<small>${esc(note)}</small>`:''}</div>`;
      const focus=result.countries.map((c,i)=>`<article class="comparison-country comparison-country-${i}"><div class="comparison-country-top"><div><span class="comparison-country-code">${countryCodes[c.country_id]}</span><h3>${esc(countryNames[c.country_id][l])}</h3></div><div class="comparison-count"><strong>${fmt(c.record_count,0)}</strong><span>${esc(v.count)}</span></div></div><dl class="comparison-metrics">${metric(v.mean,fmt(c.magnitude.mean))}${metric(v.sd,fmt(c.magnitude.sample_sd))}${metric(v.depth,c.depth_km.mean==null?'NULL':fmt(c.depth_km.mean)+' km',v.valid+' = '+fmt(c.depth_km.n,0))}</dl><div class="comparison-range-block"><div class="comparison-range-label"><span>${esc(v.range)}</span><strong>${c.magnitude.n?fmt(c.magnitude.minimum)+'–'+fmt(c.magnitude.maximum):'NULL'}</strong></div>${rangeChart(c,result,l)}${c.magnitude.n?`<p>${esc(v.median)} <strong>${fmt(c.magnitude.median)}</strong></p>`:''}</div>${c.depth_km.n<c.record_count?`<p class="comparison-null">${fmt(c.record_count-c.depth_km.n,0)} ${esc(v.unknownDepth)}</p>`:''}</article>`).join('');
      element.querySelector('.comparison-output').innerHTML=`<div class="comparison-applied"><span>${esc(v.applied)}</span><strong>${esc(applied.yearFrom+'–'+applied.yearTo)} UTC</strong><strong>M ≥ ${fmt(applied.minMag)}</strong><strong>${esc(applied.magType)}</strong><p>${esc(v.same)}</p></div><div class="comparison-observatory"><div class="comparison-focus">${focus}<p class="comparison-scope">${esc(v.scope)}</p></div><div class="comparison-visuals"><article class="comparison-plot comparison-distribution"><div class="comparison-plot-heading"><span class="comparison-step" aria-hidden="true">01</span><div><h3>${esc(v.distribution)}</h3><p>${esc(v.distributionSub)}</p></div></div>${legend()}${distributionChart(result,l)}<p class="comparison-chart-note">${esc(v.binsNote)}</p></article><article class="comparison-plot comparison-annual"><div class="comparison-plot-heading"><span class="comparison-step" aria-hidden="true">02</span><div><h3>${esc(v.annual)}</h3><p>${esc(v.annualSub)}</p></div></div>${legend()}${chart(result,l)}<p class="comparison-chart-note">${esc(v.annualNote)}</p><p class="comparison-zero-note">${esc(v.zero)}</p></article></div></div><div class="comparison-bottom"><div class="comparison-downloads"><button data-format="csv">↓ ${esc(v.downloadCsv)}</button><button data-format="json">↓ ${esc(v.downloadJson)}</button></div><p>${esc(v.note)}</p></div><div class="comparison-documentation"><details class="comparison-exact"><summary>${esc(v.exact)}</summary><div class="comparison-table-scroll" tabindex="0" role="region" aria-label="${esc(v.annual)}"><table><caption>${esc(v.annual)}</caption><thead><tr><th scope="col">${esc(v.year)}</th><th scope="col">${esc(countryNames[a.country_id][l])}</th><th scope="col">${esc(countryNames[b.country_id][l])}</th></tr></thead><tbody>${a.annual_counts.map((y,i)=>`<tr><th scope="row">${y.year}</th><td>${fmt(y.record_count,0)}</td><td>${fmt(b.annual_counts[i].record_count,0)}</td></tr>`).join('')}</tbody></table></div><div class="comparison-table-scroll" tabindex="0" role="region" aria-label="${esc(v.distribution)}"><table><caption>${esc(v.distribution)}</caption><thead><tr><th scope="col">${esc(v.bin)} [a,b)</th><th scope="col">${esc(countryNames[a.country_id][l])}</th><th scope="col">${esc(countryNames[b.country_id][l])}</th></tr></thead><tbody>${a.magnitude_bins.map((bin,i)=>`<tr><th scope="row">[${fmt(bin.lower,2)}, ${fmt(bin.upper,2)})</th><td>${fmt(bin.record_count,0)}</td><td>${fmt(b.magnitude_bins[i].record_count,0)}</td></tr>`).join('')}</tbody></table></div></details><details><summary>${esc(v.evidence)}</summary><p>${esc(v.notice)}</p><pre>${esc(JSON.stringify({filters:result.filters,input:result.input,distribution:result.distribution,scope:result.scope,limits:result.limits},null,2))}</pre></details></div><p class="comparison-limit">${esc(v.notice)}</p>`;
      for(const button of element.querySelectorAll('[data-format]'))button.addEventListener('click',()=>{if(!result||pending)return;const format=button.dataset.format,body=format==='csv'?csv(result):JSON.stringify({...result,created_utc:new Date().toISOString()},null,2);if(options.download)options.download(body,'country-comparison.'+format,format==='csv'?'text/csv;charset=utf-8':'application/json');else{const url=URL.createObjectURL(new Blob([body],{type:format==='csv'?'text/csv;charset=utf-8':'application/json'})),link=document.createElement('a');link.href=url;link.download='country-comparison.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}});
      element.classList.toggle('comparison-pending',pending);for(const button of element.querySelectorAll('[data-format]'))button.disabled=pending;
    }
    function run(){try{result=compute(data,f);pending=false;element.classList.remove('comparison-pending');element.querySelector('.comparison-status').textContent='';render();}catch(exc){result=null;pending=false;element.classList.remove('comparison-pending');element.querySelector('.comparison-output').innerHTML='';element.querySelector('.comparison-status').textContent=t().error;}}
    async function refresh(){const own=++request;element.querySelector('.comparison-status').textContent=t().loading;try{const loaded=await options.loadData();if(disposed||own!==request)return;data=loaded;markup();run();}catch(exc){if(!disposed&&own===request){result=null;element.querySelector('.comparison-output').innerHTML='';element.querySelector('.comparison-status').textContent=exc.message;}}}
    markup();if(options.autoLoad!==false)refresh();
    return {refresh,activate(){return data?Promise.resolve(pending?null:result):refresh();},refreshLanguage(){markup();if(result)render();if(pending)element.querySelector('.comparison-status').textContent=t().pending;},dispose(){disposed=true;request++;element.innerHTML='';},getResult:()=>pending?null:result};
  }
  return Object.freeze({compute,validate,csv,chart,distributionChart,mount,defaults,countryNames});
});
