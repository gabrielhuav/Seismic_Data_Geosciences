(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicDiagnostics=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function primary(event){
    const unique=new Map();
    for(const v of event.versions||[])if(v.uploader_source==='us'&&v.product_type==='origin'&&v.product_code===event.id){
      const key=v.product_id || JSON.stringify([v.uploader_source,v.product_type,v.product_code,v.update_time_ms]);
      if(!unique.has(key))unique.set(key,v);
      else if(JSON.stringify(unique.get(key))!==JSON.stringify(v))throw new Error('Conflicting retained product identity');
    }
    return [...unique.values()].filter(v=>v.status!=='DELETE').sort((a,b)=>a.update_time_ms-b.update_time_ms);
  }
  function distance(a,b){
    if(![a.latitude,a.longitude,b.latitude,b.longitude].every(finite))return null;
    const [lat1,lon1,lat2,lon2]=[a.latitude,a.longitude,b.latitude,b.longitude].map(v=>v*Math.PI/180);
    const h=Math.sin((lat2-lat1)/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin((lon2-lon1)/2)**2;
    return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function endpoints(revisions){
    return (revisions.events||[]).map(event=>{
      const series=primary(event);if(!series.length)return null;
      const a=series[0],b=series[series.length-1];
      return {event_id:event.id,cohort_year:event.cohort_year,n:series.length,earliest_depth_km:finite(a.depth_km)?a.depth_km:null,latest_depth_km:finite(b.depth_km)?b.depth_km:null,
        earliest_magnitude:finite(a.magnitude)?a.magnitude:null,latest_magnitude:finite(b.magnitude)?b.magnitude:null,
        earliest_magnitude_type:a.magnitude_type||null,latest_magnitude_type:b.magnitude_type||null,
        comparable_endpoint_magnitude:!!a.magnitude_type&&a.magnitude_type===b.magnitude_type&&finite(a.magnitude)&&finite(b.magnitude),
        epicentre_displacement_km:distance(a,b)};
    }).filter(Boolean);
  }
  function theme(options={}){return {ink:'#183342',muted:'#506573',grid:'#d5dfe4',paper:'#ffffff',first:'#215b91',second:'#aa551b',font:'Arial, Helvetica, sans-serif',...options};}
  function plot(points,options={}){
    const c=theme(options.colors),height=options.height||360,left=options.left??140,right=options.right||770,top=options.top??38,bottom=options.bottom??height-68;
    const xr=options.xRange||[0,1],yr=options.yRange||[0,1],x=v=>left+(v-xr[0])/(xr[1]-xr[0])*(right-left),y=v=>bottom-(v-yr[0])/(yr[1]-yr[0])*(bottom-top);
    const f=options.format||((v,d=1)=>Number(v).toLocaleString('en',{maximumFractionDigits:d}));
    let svg=`<title>${esc(options.title)}</title><desc>${esc(options.description||'Observed retained values; no forecast.')}</desc><rect width="800" height="${height}" fill="${esc(c.paper)}"/><g font-family="${esc(c.font)}" font-size="${options.fontSize||27}" fill="${esc(c.muted)}">`;
    for(let i=0;i<=4;i++){
      const xv=xr[0]+(xr[1]-xr[0])*i/4,yv=yr[0]+(yr[1]-yr[0])*i/4;
      svg+=`<line x1="${left}" x2="${right}" y1="${y(yv)}" y2="${y(yv)}" stroke="${esc(c.grid)}" stroke-dasharray="3 6"/><text x="${left-12}" y="${y(yv)+5}" text-anchor="end">${esc(f(yv))}</text>`;
      if(!options.customXTicks)svg+=`<text x="${x(xv)}" y="${height-40}" text-anchor="middle">${esc(f(xv))}</text>`;
    }
    for(const tick of options.customXTicks||[])svg+=`<text x="${x(tick.value)}" y="${height-40}" text-anchor="${tick.value===xr[0]?'start':tick.value===xr[1]?'end':'middle'}">${esc(tick.label)}</text>`;
    if(options.diagonal)svg+=`<line x1="${x(Math.max(xr[0],yr[0]))}" y1="${y(Math.max(xr[0],yr[0]))}" x2="${x(Math.min(xr[1],yr[1]))}" y2="${y(Math.min(xr[1],yr[1]))}" stroke="${esc(c.muted)}" stroke-dasharray="6 6"/>`;
    if(finite(options.threshold))svg+=`<path d="M${x(options.threshold)},${top}V${bottom}M${left},${y(options.threshold)}H${right}" fill="none" stroke="${esc(c.muted)}" stroke-dasharray="2 5"/>`;
    if(options.connect){let path='';for(const p of points){if(!finite(p.x)||!finite(p.y)){path='';continue;}if(path)svg+=`<line x1="${path.split(',')[0]}" y1="${path.split(',')[1]}" x2="${x(p.x)}" y2="${y(p.y)}" stroke="${esc(p.color||c.first)}" stroke-width="2"/>`;path=x(p.x)+','+y(p.y);}}
    for(const p of points){
      if(!finite(p.x)||!finite(p.y))continue;
      const px=x(p.x),py=y(p.y),fill=p.color||(p.group===2022?c.second:c.first),radius=p.radius||5;
      svg+=p.triangle ? `<path d="M${px},${py-radius-1}l${radius+1},${2*radius+2}h${-2*radius-2}Z" fill="${esc(fill)}" stroke="${esc(c.paper)}"><title>${esc(p.label)}</title></path>` : `<circle cx="${px}" cy="${py}" r="${radius}" fill="${p.hollow?esc(c.paper):esc(fill)}" stroke="${esc(fill)}" stroke-width="1.5"><title>${esc(p.label)}</title></circle>`;
    }
    for(const median of options.medians||[])svg+=`<line x1="${x(median.x-.24)}" x2="${x(median.x+.24)}" y1="${y(median.value)}" y2="${y(median.value)}" stroke="${esc(c.paper)}" stroke-width="7"/><line x1="${x(median.x-.24)}" x2="${x(median.x+.24)}" y1="${y(median.value)}" y2="${y(median.value)}" stroke="${esc(c.ink)}" stroke-width="3"><title>${esc(median.label)}</title></line>`;
    const axisFont=options.labelFontSize?` font-size="${options.labelFontSize}"`:'';
    svg+=`<text x="${(left+right)/2}" y="${height-9}" text-anchor="middle" fill="${esc(c.ink)}"${axisFont}>${esc(options.xLabel)}</text><text x="24" y="${(top+bottom)/2}" transform="rotate(-90 24 ${(top+bottom)/2})" text-anchor="middle" fill="${esc(c.ink)}"${axisFont}>${esc(options.yLabel)}</text></g>`;
    return svg;
  }
  function depthPlots(metrics,labels,colors){
    const points=metrics.filter(e=>finite(e.earliest_depth_km)&&finite(e.latest_depth_km)).map(e=>({x:e.earliest_depth_km,y:e.latest_depth_km,group:e.cohort_year,triangle:e.cohort_year===2022,label:e.event_id+' · '+e.earliest_depth_km+' → '+e.latest_depth_km+' km'}));
    const grouped=[2017,2022].map(year=>metrics.filter(e=>e.cohort_year===year&&finite(e.epicentre_displacement_km)).sort((a,b)=>a.event_id.localeCompare(b.event_id)));
    const spread=[],medians=[];
    grouped.forEach((group,index)=>{group.forEach((e,n)=>spread.push({x:index+.38*(n/Math.max(1,group.length-1)-.5),y:e.epicentre_displacement_km,group:e.cohort_year,triangle:e.cohort_year===2022,label:e.event_id+' · '+e.epicentre_displacement_km+' km'}));const values=group.map(e=>e.epicentre_displacement_km).sort((a,b)=>a-b);if(values.length){const mid=Math.floor(values.length/2),v=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;medians.push({x:index,value:v,label:labels.median+' '+v+' km'});}});
    return {depth:plot(points,{title:labels.depthTitle,xLabel:labels.earliestDepth,yLabel:labels.latestDepth,xRange:[0,155],yRange:[0,155],diagonal:true,colors}),displacement:plot(spread,{title:labels.displacementTitle,xLabel:labels.cohort,yLabel:labels.displacement,xRange:[-.45,1.45],yRange:[0,86],customXTicks:[{value:0,label:'2017 · n='+grouped[0].length},{value:1,label:'2022 · n='+grouped[1].length}],medians,colors})};
  }
  function magnitudePlot(metrics,labels,colors){
    const comparable=metrics.filter(e=>e.comparable_endpoint_magnitude),main=comparable.filter(e=>e.earliest_magnitude_type==='mww'),single=comparable.filter(e=>e.earliest_magnitude_type==='mb'),c=theme(colors);
    const points=main.map(e=>{const crosses=(e.earliest_magnitude>=5.5)!==(e.latest_magnitude>=5.5);return {x:e.earliest_magnitude,y:e.latest_magnitude,triangle:crosses,color:crosses?c.second:c.first,label:e.event_id+' · mww · '+e.earliest_magnitude+' → '+e.latest_magnitude};});
    let svg=plot(points,{title:labels.magnitudeTitle,xLabel:labels.earliestM,yLabel:labels.latestM,xRange:[5.2,8.4],yRange:[5.2,8.4],right:545,diagonal:true,threshold:5.5,colors});
    svg+=`<g font-family="Arial" fill="${esc(c.ink)}"><rect x="580" y="58" width="205" height="172" rx="4" fill="${esc(c.paper)}" stroke="${esc(c.grid)}"/><text x="595" y="85" font-size="20">m<tspan baseline-shift="sub" font-size="14">b</tspan> · n=${single.length}</text>`;
    for(const [i,e] of single.entries())svg+=`<text x="595" y="${115+i*62}" font-family="Consolas" font-size="14">${esc(e.event_id)}</text><text x="595" y="${141+i*62}" font-size="17">${e.earliest_magnitude} → ${e.latest_magnitude}</text>`;
    svg+=`<text x="595" y="270" font-size="16">M<tspan baseline-shift="sub" font-size="12">ww</tspan> · n=${main.length}</text><text x="595" y="298" font-size="14">${esc(labels.threshold)} 5.5</text></g>`;return svg;
  }
  function lineagePlots(event,labels,colors){
    const series=primary(event);if(!series.length)return {magnitude:plot([],{title:labels.reportedM,xLabel:labels.updateTime,yLabel:labels.reportedM,colors}),depth:plot([],{title:labels.depth,xLabel:labels.updateTime,yLabel:labels.depth,colors})};
    const times=series.map(v=>v.update_time_ms),from=Math.min(...times),to=Math.max(...times),range=from===to?[from-43200000,to+43200000]:[from,to];
    const ticks=[range[0],(range[0]+range[1])/2,range[1]].map(value=>({value,label:new Date(value).toISOString().slice(0,10)}));
    function render(field,label){const values=series.map(v=>v[field]).filter(finite),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(.1,(hi-lo)*.15),types=new Set(series.map(v=>v.magnitude_type));
      const points=series.map(v=>({x:v.update_time_ms,y:field==='magnitude'&&(types.size!==1||!series[0].magnitude_type)?null:v[field],label:v.update_time_utc+' · '+String(v[field])}));
      return plot(points,{title:event.id+' · '+label,xLabel:labels.updateTime,yLabel:label,xRange:range,yRange:values.length?[lo-pad,hi+pad]:[0,1],customXTicks:ticks,connect:true,colors});}
    return {magnitude:render('magnitude',labels.reportedM),depth:render('depth_km',labels.depth)};
  }
  const coverageLayout=Object.freeze({width:800,height:360,left:140,right:770,top:42,bottom:276,fontSize:30,labelFontSize:32});
  function coveragePlots(data,labels,colors){
    const rows=data.annual_bins,c=theme(colors),from=rows[0]?.year??1900,to=rows[rows.length-1]?.year??2026,range=from===to?[from-.5,to+.5]:[from,to],span=range[1]-range[0],partial=data.partial_year??2026;
    const {left,right,top,bottom}=coverageLayout,width=right-left,plotHeight=bottom-top,xPosition=year=>left+(year-range[0])/span*width;
    const tickYears=[...new Set([from,Math.round(from+(to-from)/3),Math.round(from+2*(to-from)/3),to])];
    const base={...coverageLayout,colors,xRange:range,customXTicks:tickYears.map(value=>({value,label:String(value)})),xLabel:labels.year,description:data.limits};
    let counts=plot([],{...base,title:labels.coverageTitle,yRange:[0,5],yLabel:labels.logRows});
    for(const [key,color,dash] of [['all',c.muted,'6 4'],['numeric',c.ink,'2 5'],['map',c.first,''],['m5',c.second,'']]){
      let previous=null;
      for(const [index,row]of rows.entries()){if(!row.all||row[key]<=0){previous=null;continue;}const x=xPosition(row.year),y=bottom-Math.log10(row[key])/5*plotHeight;
        if(previous)counts+=`<line data-series="${key}" data-from-year="${previous.year}" data-to-year="${row.year}" x1="${previous.x}" y1="${previous.y}" x2="${x}" y2="${y}" stroke="${esc(color)}" stroke-width="2" stroke-dasharray="${dash}"><title>${row.year}: ${row[key]} (${key})</title></line>`;
        if(row.year===partial)counts+=`<circle data-series="${key}" data-year="${row.year}" data-partial="true" cx="${x}" cy="${y}" r="6" fill="${esc(c.paper)}" stroke="${esc(color)}" stroke-width="2"><title>${row.year}: ${row[key]} (${key}); partial year</title></circle>`;
        else if(!previous&&!(rows[index+1]?.all&&rows[index+1]?.[key]>0))counts+=`<circle data-series="${key}" data-year="${row.year}" cx="${x}" cy="${y}" r="3" fill="${esc(color)}"><title>${row.year}: ${row[key]} (${key})</title></circle>`;
        previous={x,y,year:row.year};
      }
    }
    let maximum=plot(rows.map(row=>({x:row.year,y:row.maximum,hollow:row.year===partial,label:row.year+' · M '+row.maximum+' · '+row.maximum_rows+' ties'+(row.year===partial?' · partial year':'')})),{...base,title:labels.maximumTitle,yRange:[4.8,8.8],yLabel:labels.maximum});
    for(const row of rows)if(!row.all){const x=xPosition(row.year),w=Math.min(width,width/span*.75),start=Math.max(left,x-w/2),end=Math.min(right,x+w/2),band=`<rect class="coverage-gap" data-year="${row.year}" x="${start}" y="${top}" width="${end-start}" height="${plotHeight}" fill="${esc(c.muted)}" opacity=".18"><title>${row.year}: ${esc(labels.gap)}</title></rect>`;counts+=band;maximum+=band;}
    return {counts,maximum,layout:coverageLayout};
  }
  return Object.freeze({primary,endpoints,distance,plot,depthPlots,magnitudePlot,lineagePlots,coveragePlots,coverageLayout});
});
