"""Independent, offline Python oracle for the historical browser tools.

Only private oracle JSON is written. Scientific source bytes are never changed.
Python selects and ranks raw rows itself; the Node subprocess calls the public
JavaScript API and returns results plus CSV for differential evaluation.

Run from a checkout using Python's standard library and Node.js::

    python scripts/audit_historical_views.py --node node

The executable defaults to Node.js found on PATH. Pass --node with a full path
when it is not on PATH. --output-dir selects a private validation directory.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import io
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'system/dist'
OUT = ROOT / 'outputs/validation/historical_tools'
R = 6371.0088
BOUNDARY_TOLERANCE_KM = 1e-9
MISSING = '__missing__'
NODE = None
READS = {}

def read(path, expected=None):
    path = Path(path)
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if expected is not None:
        assert digest == expected, str(path)
    READS[path] = {'path': path.relative_to(ROOT).as_posix(), 'bytes': len(raw), 'sha256': digest}
    return json.loads(raw)

def finite(value):
    return type(value) in (int, float) and math.isfinite(value)

def key(row):
    return str(next((row[name] for name in ['source_event_id', 'id', 'record_key'] if row.get(name) is not None), ''))

def kind(row):
    value = row.get('magType')
    if value is None:
        value = row.get('mag_type')
    return value or MISSING

def year(row):
    value = row.get('year')
    return value if type(value) is int else int(str(row.get('time', ''))[:4])

def ordered(rows):
    return sorted(rows, key=lambda row: (-row['mag'], utc_sort_key(row.get('time')), key(row)))

def point(row):
    return finite(row.get('latitude')) and -90 <= row['latitude'] <= 90 and finite(row.get('longitude')) and -180 <= row['longitude'] <= 180

def haversine(a, b):
    if not point(a) or not point(b):
        return None
    p, q = math.radians(a['latitude']), math.radians(b['latitude'])
    dl = math.radians(b['longitude'] - a['longitude'])
    h = math.sin((q-p)/2)**2 + math.cos(p)*math.cos(q)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(min(1, max(0, h))))

def dot(a, b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def unit(a):
    length = math.sqrt(dot(a,a))
    return tuple(x/length for x in a) if length > 1e-15 else None
def vector(lon, lat):
    p,q = math.radians(lon),math.radians(lat)
    return (math.cos(q)*math.cos(p),math.cos(q)*math.sin(p),math.sin(q))
def angle(a,b): return math.atan2(math.sqrt(dot(cross(a,b),cross(a,b))),dot(a,b))

def segment_distance(p,a,b):
    """Independent 3-D projection onto a finite minor great-circle arc."""
    length = angle(a,b)
    shortest = min(angle(p,a), angle(p,b))
    normal = unit(cross(a,b))
    if normal is None or abs(length-math.pi) < 1e-10:
        return shortest*R
    projection = unit(tuple(p[i]-dot(p,normal)*normal[i] for i in range(3)))
    if projection is not None:
        for candidate in [projection, tuple(-x for x in projection)]:
            if abs(angle(a,candidate)+angle(candidate,b)-length) <= 1e-9:
                shortest = min(shortest,angle(p,candidate))
    return shortest*R

def feature_segments(features):
    segments=[]
    for feature in features:
        geometry=feature['geometry']
        rings=geometry['coordinates'] if geometry['type']=='Polygon' else [ring for poly in geometry['coordinates'] for ring in poly]
        for ring in rings:
            vectors=[vector(*xy[:2]) for xy in ring]
            segments.extend(zip(vectors[:-1],vectors[1:]))
    return segments

def boundary_distance(row,segments):
    if not point(row) or not segments:
        return None
    p=vector(row['longitude'],row['latitude'])
    return min(segment_distance(p,a,b) for a,b in segments)

def in_land(row, filters):
    scope=filters['scope']
    return scope=='footprint' or ((row.get('country_id') in ['MEX','CAN','USA'] if scope=='NA' else row.get('country_id')==scope) and (not filters.get('admin1') or row.get('admin1_id')==filters['admin1']))

def oracle(rows,filters,mode,geometries):
    base=[row for row in rows if finite(row.get('mag')) and filters['yearFrom']<=year(row)<=filters['yearTo'] and kind(row)==filters['magType']]
    if mode=='top':
        selected=ordered([row for row in base if in_land(row,filters)])
        return {'eligible_records':len(selected),'keys':[key(row) for row in selected[:10]],'top':[{'record_key':key(row),'time':row.get('time'),'magnitude':row['mag'],'country_id':row.get('country_id'),'admin1_id':row.get('admin1_id')} for row in selected[:10]]}
    base=[row for row in base if row['mag']>=filters.get('minimumMagnitude',7)]
    land=[row for row in base if in_land(row,filters)]
    extra={}
    if filters.get('includeOffshore') and filters['scope']!='footprint':
        features=[g for g in geometries[1 if filters.get('admin1') else 0]['features'] if (g['properties'].get('admin1_id')==filters['admin1'] if filters.get('admin1') else g['properties'].get('ISO_A3') in (['MEX','CAN','USA'] if filters['scope']=='NA' else [filters['scope']]))]
        segments=feature_segments(features)
        assert segments
        for row in base:
            if in_land(row,filters): continue
            unassigned=not row.get('country_id') or row.get('country_id') in ['outside','boundary','invalid']
            unassigned_admin=filters.get('admin1') and row.get('country_id')==filters['scope'] and str(row.get('admin1_id') or '').startswith('admin1-')
            if unassigned or unassigned_admin:
                distance=boundary_distance(row,segments)
                if distance is not None and distance<=100+BOUNDARY_TOLERANCE_KM:
                    extra[key(row)]=distance
    selected=land+[row for row in base if key(row) in extra]
    located=ordered([row for row in selected if point(row)])
    assert len({key(row) for row in located})==len(located)
    pairs=[]
    participants=set()
    for i,a in enumerate(located):
        for b in located[i+1:]:
            distance=haversine(a,b)
            if distance<=filters['radiusKm']+BOUNDARY_TOLERANCE_KM:
                pairs.append((key(a),key(b),distance))
                participants.update([key(a),key(b)])
    pairs.sort(key=lambda item:(item[2],item[0],item[1]))
    return {'eligible_records':len(selected),'located_records':len(located),'paired_records':len(participants),'pair_count':len(pairs),'nearby_unassigned_records':len(extra),'keys':[key(row) for row in located],'pairs':pairs,'context_distances':extra,'land_records':len(land)}

def parse_utc(value):
    match=re.fullmatch(r'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(?:Z|\+00:00)',value) if isinstance(value,str) else None
    if not match:return None
    try: return (datetime.fromisoformat(match[1]+'+00:00'),Decimal('0.'+(match[2] or '0')))
    except ValueError: return None

def utc_sort_key(value):
    parsed=parse_utc(value)
    return (0,*parsed,'') if parsed is not None else (1,datetime.min.replace(tzinfo=timezone.utc),Decimal(0),str(value or ''))

def update_time(row): return parse_utc(row.get('updated'))

def combined_oracle(inputs,filters):
    chosen=inputs if filters['catalogueId']=='all' else [data for data in inputs if data['catalog']['id']==filters['catalogueId']]
    groups={}; source_rows=0
    priority=lambda member:({'usgs-na-2020-2025':0,'usgs-mx-historical':1}.get(member[0]['id'],2),member[0]['id'])
    for data in chosen:
        catalog=data['catalog']
        for row in data['events']:
            qualified=catalog['id']+'~'+key(row)
            original=catalog['provider']=='usgs' and catalog.get('identifier_kind','source_event_id')=='source_event_id'
            group_key='usgs-original:'+key(row) if original else 'source-row:'+qualified
            groups.setdefault(group_key,[]).append((catalog,row,qualified)); source_rows+=1
    eligible=[]
    for members in groups.values():
        if len(members)>1 and all(update_time(row) is not None for _,row,_ in members):
            latest=max(update_time(row) for _,row,_ in members)
            member=min([m for m in members if update_time(m[1])==latest],key=priority)
        else: member=min(members,key=priority)
        catalog,row,qualified=member
        if finite(row.get('mag')) and filters['yearFrom']<=year(row)<=filters['yearTo'] and (filters['magType']=='__all__' or kind(row)==filters['magType']) and in_land(row,filters):
            eligible.append((catalog,row,qualified,members))
    eligible.sort(key=lambda item:(-item[1]['mag'],utc_sort_key(item[1].get('time')),key(item[1]),item[2]))
    top=[{'record_key':qualified,'source_record_key':key(row),'catalogue_id':catalog['id'],'magnitude':row['mag'],'time':row.get('time'),'magnitude_type':None if kind(row)==MISSING else kind(row),'provenance':[{'catalogue_id':c['id'],'source_record_key':key(r),'magnitude':r.get('mag'),'time':r.get('time'),'updated':r.get('updated')} for c,r,_ in members]} for catalog,row,qualified,members in eligible[:10]]
    return {'source_catalogue_count':len(chosen),'source_records':source_rows,'grouped_candidate_records':len(groups),'identical_usgs_ids_grouped':sum(len(members)>1 for members in groups.values()),'collapsed_usgs_source_rows':source_rows-len(groups),'eligible_records':len(eligible),'keys':[item['record_key'] for item in top],'top':top}

NODE_CODE = r'''
const fs=require('fs'),crypto=require('crypto'),H=require('./system/dist/history-explorer.js');
const requests=JSON.parse(fs.readFileSync(0,'utf8')),base='system/dist/',load=p=>JSON.parse(fs.readFileSync(base+p,'utf8'));
const reg=load('data/catalogs.json'),countries=load('data/country-index.json'),admin=load('data/admin1-index.json');
const geometry=load(countries.geometry_path),admin1Geometry=load(admin.geometry_path);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cache=new Map(),before=new Map(),results=[];
function dataFor(id){if(!cache.has(id)){
  const catalog=reg.catalogs.find(c=>c.id===id),raw=load(catalog.events_url);
  const events=raw.rows.map((row,i)=>({...Object.fromEntries(raw.fields.map((f,j)=>[f,row[j]])),country_id:countries.catalogs[id].country_ids[i],admin1_id:admin.catalogs[id].admin1_ids[i]}));
  const data={catalog,events,admin1:admin,geometry,admin1Geometry,hashes:{events:catalog.sha256,manifest:catalog.manifest_sha256},geographyEvidence:{index_sha256:hash(countries),admin1:{index_sha256:hash(admin)}}};
  cache.set(id,data);before.set(id,hash(data));
 }return cache.get(id);}
for(const request of requests){
 const fixture=!!(request.fixture||request.combinedFixture);
 const data=request.mode==='combined'?(request.combinedFixture||reg.catalogs.map(c=>dataFor(c.id))):(request.fixture||dataFor(request.filters.catalogueId));
 const b=fixture?hash(data):null;
 let result;
 try{result=request.mode==='combined'?H.computeCombinedTop(data,request.filters):request.mode==='top'?H.computeTop(data,request.filters):H.computeRecurrence(data,request.filters);}
 catch(e){results.push({name:request.name,error:e.message});continue;}
 results.push({name:request.name,result,csv:H.csv(result),fixture_unchanged:fixture?b===hash(data):null});
}
const unchanged=[...cache].map(([id,data])=>({catalogue:id,unchanged:before.get(id)===hash(data)}));
process.stdout.write(JSON.stringify({results,unchanged}));
'''

def validate_csv(text,result):
    if result['schema']=='seismic-combined-reported-top10/1': return validate_combined_csv(text,result)
    records=list(csv.DictReader(io.StringIO(text)))
    assert len(next(csv.reader(io.StringIO(text))))==17
    assert all(len(row)==17 and None not in row for row in records)
    evidence=json.loads(next(row['value'] for row in records if row['section']=='evidence'))
    assert evidence=={name:result[name] for name in ['schema','filters','input','rule','limits']}
    actual=[row for row in records if row['section']=='record']
    expected=result.get('ranked_records',result.get('records'))
    assert [row['record_key'] for row in actual]==[row['record_key'] for row in expected]
    for row,source in zip(actual,expected):
        assert row['time_utc']==(source.get('time') or '')
        assert row['rank_or_pair']==str(source.get('rank',''))
        assert row['scope_basis']==source.get('scope_basis','')
        for field in ['latitude','longitude','reported_magnitude','depth_km','distance_to_land_km']:
            target=source.get(field)
            assert row[field]=='' if target is None else abs(float(row[field])-target)<1e-9
        assert row['magnitude_type']==(source.get('magnitude_type') or '')
        assert row['country_id']==(source.get('country_id') or '')
        assert row['admin1_id']==(source.get('admin1_id') or '')
        assert row['place']==(source.get('place') or '')
    pairs=[row for row in records if row['section']=='pair']
    assert len(pairs)==len(result.get('pairs',[]))
    for row,pair in zip(pairs,result.get('pairs',[])):
        assert int(row['rank_or_pair'])==pair['pair_no']
        assert (row['record_key'],row['record_b'])==(pair['record_a'],pair['record_b'])
        assert abs(float(row['distance_km'])-pair['distance_km'])<1e-9
    return {'columns':17,'evidence_rows':1,'record_rows':len(actual),'pair_rows':len(pairs),'status':'pass'}

def validate_combined_csv(text,result):
    rows=list(csv.DictReader(io.StringIO(text)))
    assert all(len(row)==17 and None not in row for row in rows)
    evidence=[row for row in rows if row['section']=='evidence'];assert len(evidence)==1
    assert json.loads(evidence[0]['value'])=={name:result[name] for name in ['schema','filters','input','rule','limits']}
    actual=[row for row in rows if row['section']=='record']; provenance=[row for row in rows if row['section']=='provenance']
    assert len(actual)==len(result['ranked_records'])
    assert len(provenance)==sum(len(row['provenance']) for row in result['ranked_records'])
    for csvrow,row in zip(actual,result['ranked_records']):
        assert csvrow['record_key']==row['record_key'] and csvrow['source_record_key']==row['source_record_key']
        for column,field in [('time_utc','time'),('reported_update_utc','reported_update_utc'),('catalogue_id','catalogue_id'),('provider','provider'),('magnitude_type','magnitude_type'),('country_id','country_id'),('admin1_id','admin1_id'),('place','place')]: assert csvrow[column]==(row.get(field) or '')
        assert int(csvrow['rank'])==row['rank']
        for field in ['latitude','longitude','reported_magnitude','depth_km']:
            assert csvrow[field]=='' if row.get(field) is None else abs(float(csvrow[field])-row[field])<1e-9
        alternatives=[p for p in provenance if int(p['rank'])==row['rank']]
        for csvp,p in zip(alternatives,row['provenance']):
            assert csvp['record_key']==p['qualified_record_key'] and csvp['catalogue_id']==p['catalogue_id']
            assert float(csvp['reported_magnitude'])==p['reported_magnitude'] and csvp['magnitude_type']==(p['magnitude_type'] or '')
            assert json.loads(csvp['value'])=={name:p[name] for name in ['hashes','geography','update_utc_valid']}
    return {'columns':17,'evidence_rows':1,'record_rows':len(actual),'provenance_rows':len(provenance),'status':'pass'}

def main():
    global OUT, NODE
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node',default=shutil.which('node'),help='Node.js executable name or explicit path; defaults to node on PATH.')
    parser.add_argument('--output-dir',type=Path,default=Path('outputs/validation/historical_tools'),help='Private output directory; relative paths are resolved against the repository root.')
    args=parser.parse_args()
    if not args.node:
        parser.error('Node.js was not found on PATH; pass --node with its executable path.')
    NODE=Path(shutil.which(args.node) or Path(args.node).expanduser().resolve())
    if not NODE.is_file():
        parser.error('The --node executable does not exist: '+str(NODE))
    OUT=args.output_dir.expanduser()
    OUT=(ROOT/OUT).resolve() if not OUT.is_absolute() else OUT.resolve()
    for path in [Path(__file__).resolve(),DIST/'history-explorer.js']:
        raw=path.read_bytes()
        READS[path]={'path':path.relative_to(ROOT).as_posix(),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    registry=read(DIST/'data/catalogs.json')
    countries=read(DIST/'data/country-index.json')
    admin=read(DIST/'data/admin1-index.json')
    registry_sha=READS[DIST/'data/catalogs.json']['sha256']
    assert countries['registry_sha256']==admin['registry_sha256']==registry_sha
    assert admin['country_index_sha256']==READS[DIST/'data/country-index.json']['sha256']
    geometries=[read(DIST/countries['geometry_path'],countries['geometry_sha256']),read(DIST/admin['geometry_path'],admin['geometry_sha256'])]
    datasets={}
    for catalog in registry['catalogs']:
        cid=catalog['id'];raw=read(DIST/catalog['events_url'],catalog['sha256']);read(DIST/catalog['manifest_url'],catalog['manifest_sha256'])
        assert len(raw['rows'])==catalog['event_count']==countries['catalogs'][cid]['row_count']==admin['catalogs'][cid]['row_count']
        assert countries['catalogs'][cid]['events_sha256']==admin['catalogs'][cid]['events_sha256']==catalog['sha256']
        datasets[cid]=[dict(zip(raw['fields'],row),country_id=countries['catalogs'][cid]['country_ids'][i],admin1_id=admin['catalogs'][cid]['admin1_ids'][i]) for i,row in enumerate(raw['rows'])]
    nrcan_types=sorted({kind(row) for row in datasets['nrcan-ca-historical'] if row['admin1_id']=='CAN-682'})
    ontario_type=next((literal for literal in ['ML','ml','MN','mb','mb_Lg',MISSING] if literal in nrcan_types),nrcan_types[0])
    cases=[]
    def add(name,cid,scope='NA',admin1='',magtype='mww',mode='top',radius=100,offshore=False):
        catalog=next(c for c in registry['catalogs'] if c['id']==cid)
        cases.append({'name':name,'mode':mode,'filters':{'catalogueId':cid,'scope':scope,'admin1':admin1,'yearFrom':catalog['years'][0],'yearTo':catalog['years'][1],'magType':magtype,'minimumMagnitude':7,'radiusKm':radius,'includeOffshore':offshore,'offshoreKm':100}})
    add('guerrero_top','ssn-mx-historical','MEX','MEX-2729',MISSING)
    add('guerrero_land_50','ssn-mx-historical','MEX','MEX-2729',MISSING,'recurrence',50)
    add('guerrero_context_50','ssn-mx-historical','MEX','MEX-2729',MISSING,'recurrence',50,True)
    add('north_america_top','usgs-na-2020-2025')
    add('north_america_land_100','usgs-na-2020-2025',mode='recurrence')
    add('north_america_footprint_100','usgs-na-2020-2025','footprint',mode='recurrence')
    add('mexico_ssn_top','ssn-mx-historical','MEX',magtype=MISSING)
    add('mexico_ssn_land_100','ssn-mx-historical','MEX',magtype=MISSING,mode='recurrence')
    add('ssn_footprint_100','ssn-mx-historical','footprint',magtype=MISSING,mode='recurrence')
    add('mexico_usgs_top','usgs-mx-historical','MEX')
    add('mexico_usgs_footprint_100','usgs-mx-historical','footprint',mode='recurrence')
    add('california_top','usgs-na-2020-2025','USA','USA-3521')
    add('california_land_100','usgs-na-2020-2025','USA','USA-3521',mode='recurrence')
    add('ontario_top','nrcan-ca-historical','CAN','CAN-682',ontario_type)
    add('ontario_land_100','nrcan-ca-historical','CAN','CAN-682',ontario_type,'recurrence')
    # Synthetic observations exercise missing fields, exact types, land classes,
    # threshold boundaries, zero-depth, derived IDs and the antimeridian.
    fixture={'catalog':{'id':'oracle-fixture','provider':'nrcan','years':[1900,2026],'identifier_kind':'derived_row_key'},'admin1':{'regions':[{'id':'MEX-X','country_id':'MEX'}]},'events':[]}
    def e(identifier,mag=7,lon=0,**extra):
        return {'id':identifier,'mag':mag,'longitude':lon,'latitude':0,'time':'2020-01-01T00:00:00Z','year':2020,'magType':'mww','country_id':'MEX','admin1_id':'MEX-X','depth':None,**extra}
    fixture['events']=[e('a',lon=179.8),e('b',lon=-179.8),e('c',mag=6.999),e('d',mag=7,latitude=None),e('e',mag=8,magType=None),e('f',mag=9,magType='MWW'),e('g',mag=None),e('h',mag=9,country_id='outside'),e('i',mag=7,depth=0)]
    filters={'catalogueId':'oracle-fixture','scope':'MEX','admin1':'MEX-X','yearFrom':1900,'yearTo':2026,'magType':'mww','minimumMagnitude':7,'radiusKm':50,'includeOffshore':False,'offshoreKm':100}
    for mode in ['top','recurrence']:
        cases.append({'name':'fixture_'+mode,'mode':mode,'filters':filters,'fixture':fixture})
    cases.append({'name':'fixture_missing_type','mode':'top','filters':{**filters,'magType':MISSING},'fixture':fixture})
    for offset,name in [(-1e-8,'below'),(0,'at'),(BOUNDARY_TOLERANCE_KM/2,'within_epsilon'),(10*BOUNDARY_TOLERANCE_KM,'outside_epsilon'),(1e-6,'above')]:
        fx={**fixture,'catalog':{**fixture['catalog'],'provider':'usgs'},'events':[e('a'),e('b',lon=math.degrees((50+offset)/R))]}
        cases.append({'name':'radius_'+name,'mode':'recurrence','filters':filters,'fixture':fx})
    combined_filters={'catalogueId':'all','scope':'footprint','admin1':'','yearFrom':1900,'yearTo':2026,'magType':'__all__','includeOffshore':False}
    for name,changes in [('combined_overview',{}),('combined_guerrero',{'scope':'MEX','admin1':'MEX-2729'}),('combined_north_america_land',{'scope':'NA'}),('combined_advanced_guerrero',{'catalogueId':'ssn-mx-historical','scope':'MEX','admin1':'MEX-2729','magType':MISSING})]:
        cases.append({'name':name,'mode':'combined','filters':{**combined_filters,**changes}})
    for name,updated_a,updated_b in [('newer_update','2024-01-01T00:00:00Z','2025-01-01T00:00:00Z'),('missing_update',None,'2025-01-01T00:00:00Z'),('submillisecond_update','2025-01-01T00:00:00.0001Z','2025-01-01T00:00:00.0009Z')]:
        inputs=[{'catalog':{'id':cid,'provider':provider,'years':[1900,2026],**({'identifier_kind':'derived_row_key'} if provider!='usgs' else {})},'events':[e('same',mag=mag,updated=updated,magType=magtype)],'admin1':fixture['admin1'],'hashes':{'events':'synthetic-'+cid},'geographyEvidence':{'index_sha256':'synthetic-country'}} for cid,provider,mag,updated,magtype in [('usgs-na-2020-2025','usgs',7,updated_a,'mww'),('usgs-mx-historical','usgs',6,updated_b,'mw'),('ssn-mx-historical','ssn',8,None,None)]]
        cases.append({'name':'combined_fixture_'+name,'mode':'combined','filters':combined_filters,'combinedFixture':inputs})
    chronology_inputs=[{'catalog':{'id':cid,'provider':provider,'years':[1900,2026],**({'identifier_kind':'derived_row_key'} if provider=='ssn' else {})},'events':[e(identifier,mag=7,time=origin,magType=literal)],'admin1':fixture['admin1'],'hashes':{'events':'synthetic-'+cid},'geographyEvidence':{'index_sha256':'synthetic-country'}} for cid,provider,identifier,origin,literal in [('usgs-na-2020-2025','usgs','fraction','2020-01-01T00:00:00.100Z','mww'),('ssn-mx-historical','ssn','whole','2020-01-01T00:00:00Z',None)]]
    cases.append({'name':'combined_fixture_utc_chronology','mode':'combined','filters':combined_filters,'combinedFixture':chronology_inputs})
    oracle_results={}
    real_inputs=[{'catalog':catalog,'events':datasets[catalog['id']]} for catalog in registry['catalogs']]
    for case in cases:
        if case['mode']=='combined': oracle_results[case['name']]=combined_oracle(case.get('combinedFixture',real_inputs),case['filters'])
        else:
            rows=case['fixture']['events'] if case.get('fixture') else datasets[case['filters']['catalogueId']]
            oracle_results[case['name']]=oracle(rows,case['filters'],case['mode'],geometries)
    paper={name:oracle_results[name] for name in ['guerrero_top','guerrero_land_50','guerrero_context_50']}
    OUT.mkdir(exist_ok=True,parents=True)
    (OUT/'oracle_python_preliminary.json').write_text(json.dumps(paper,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'python_computed':{name:{k:v for k,v in result.items() if k not in ['pairs','keys','top','context_distances']} for name,result in paper.items()},'guerrero_largest':paper['guerrero_top']['top'][0]},ensure_ascii=False),flush=True)
    proc=subprocess.run([str(NODE),'--max-old-space-size=4096','-e',NODE_CODE],input=json.dumps(cases,ensure_ascii=False),encoding='utf8',capture_output=True,cwd=ROOT,check=True)
    actual=json.loads(proc.stdout)
    comparisons=[]
    for item in actual['results']:
        name=item['name'];expected=oracle_results[name];case=next(c for c in cases if c['name']==name)
        assert 'error' not in item,(name,item)
        result=item['result']
        for field in ['eligible_records','located_records','pair_count','paired_records','nearby_unassigned_records','source_records','grouped_candidate_records','identical_usgs_ids_grouped','collapsed_usgs_source_rows','source_catalogue_count']:
            if field in expected: assert result[field]==expected[field],(name,field,result[field],expected[field])
        records=result.get('ranked_records',result.get('records'))
        assert [r['record_key'] for r in records]==expected['keys'],name
        if case['mode']=='combined':
            meta={data['catalog']['id']:data['catalog'] for data in case.get('combinedFixture',real_inputs)}
            for row,expected_row in zip(records,expected['top']):
                assert row['source_record_key']==expected_row['source_record_key'] and row['catalogue_id']==expected_row['catalogue_id']
                assert row['reported_magnitude']==expected_row['magnitude'] and row['time']==expected_row['time'] and row['magnitude_type']==expected_row['magnitude_type']
                assert len(row['provenance'])==len(expected_row['provenance'])
                for alternative,p in zip(row['provenance'],expected_row['provenance']): assert alternative['catalogue_id']==p['catalogue_id'] and alternative['record_key']==p['source_record_key'] and alternative['reported_magnitude']==p['magnitude'] and alternative['time']==p['time'] and alternative['reported_update_utc']==p['updated']
        else: meta={case['filters']['catalogueId']:case['fixture']['catalog'] if case.get('fixture') else next(c for c in registry['catalogs'] if c['id']==case['filters']['catalogueId'])}
        for row in records:
            catalog=meta[row.get('catalogue_id',case['filters']['catalogueId'])]
            assert row['identifier_kind']==catalog.get('identifier_kind','source_event_id')
            if catalog['provider']=='nrcan' and catalog.get('depth_unit')!='km': assert row['depth_km'] is None
        if case['filters']['magType']==MISSING:
            assert all(row['magnitude_type'] is None for row in records)
        elif case['filters']['magType']!='__all__':
            assert all(row['magnitude_type']==case['filters']['magType'] for row in records)
        assert all('event_id' not in row and 'physical_event_id' not in row for row in records)
        max_pair_error=0.0
        if case['mode']=='recurrence':
            assert result['rule']['numeric_tolerance_km']==BOUNDARY_TOLERANCE_KM
            js_pairs={(p['record_a'],p['record_b']):p['distance_km'] for p in result['pairs']}
            py_pairs={(a,b):d for a,b,d in expected['pairs']}
            assert js_pairs.keys()==py_pairs.keys(),name
            max_pair_error=max([abs(js_pairs[p]-py_pairs[p]) for p in py_pairs] or [0])
            assert max_pair_error<1e-8,(name,max_pair_error)
            for row in records:
                if row['record_key'] in expected['context_distances']:
                    assert abs(row['distance_to_land_km']-expected['context_distances'][row['record_key']])<1e-7
        assert item.get('fixture_unchanged') is not False
        summary={k:v for k,v in expected.items() if k not in ['pairs','keys','context_distances']}
        if case['mode']=='recurrence':
            summary['pairs']=[{'record_a':a,'record_b':b,'distance_km':d} for a,b,d in expected['pairs']]
            summary['geographic_context_distances_km']=expected['context_distances']
        summary.update(name=name,mode=case['mode'],filters=case['filters'],status='pass',csv=validate_csv(item['csv'],result),maximum_pair_distance_difference_km=max_pair_error)
        comparisons.append(summary)
    assert all(item['unchanged'] for item in actual['unchanged'])
    for path,receipt in READS.items():
        assert hashlib.sha256(path.read_bytes()).hexdigest()==receipt['sha256'],str(path)
    report={'schema':'seismic-independent-history-oracle/1','checked_utc':datetime.now(timezone.utc).isoformat(),'status':'pass','cases':len(comparisons),'comparisons':comparisons,'verified_sources':list(READS.values()),'javascript_inputs_unchanged':actual['unchanged'],'python_method':'Independent raw-row predicates and Python tuple sorting; independent Haversine asin formula; spherical context uses 3-D unit-vector projection onto finite minor arcs, not JavaScript bearing/cross-track formulas.','numeric_boundary_contract':{'distance_absolute_tolerance_km':BOUNDARY_TOLERANCE_KM,'meaning':'One micrometre numerical comparison tolerance for pairs and optional geographic context; not a positional uncertainty or displayed rounding. Evaluates d <= radius + tolerance.','fixtures':'50 km - 1e-8 km; exactly 50 km; 50 km + half tolerance; 50 km + ten tolerances; 50 km + 1e-6 km. The last two must be excluded.'},'limitations':['Geographic assignment uses the independently hash-verified existing indexes, not a new external jurisdiction survey.','Synthetic fixtures establish calculation semantics, not observed catalogue properties.','Source records are not asserted independent physical earthquakes; no hazard, risk or forecast is estimated.']}
    report['utc_comparison']={'python':'Calendar-valid whole seconds use native datetime; arbitrary decimal fractions use Decimal without conversion to float or microsecond truncation.','javascript':'Calendar-valid whole seconds and exact zero-padded decimal strings; no millisecond truncation.','cases':'Mixed whole-second/.100Z origin order and .0001Z/.0009Z representative updates.'}
    report['case_groups']={'original_single_catalogue_and_proximity':23,'combined_real':4,'combined_synthetic':4}
    (OUT/'oracle_historical_views.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'status':'pass','cases':len(comparisons),'report':str(OUT/'oracle_historical_views.json'),'summaries':[{k:v for k,v in row.items() if k not in ['csv','filters','top','pairs','geographic_context_distances_km']} for row in comparisons]},ensure_ascii=False),flush=True)

if __name__=='__main__': main()
