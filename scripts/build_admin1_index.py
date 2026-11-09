"""Build a separate, hash-bound Natural Earth admin-1 overlay without changing catalogues.

The existing 50m country index remains the authority for the country filter.
Admin-1 containment is evaluated only inside the matching retained country class.
No nearest subdivision, locality-text matching or offshore reassignment is used.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.request import Request, urlopen

try:
    from scripts import build_country_index as country
except ModuleNotFoundError:
    import build_country_index as country

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT/'system/dist'
SOURCE = ROOT/'outputs/loading_sql_2026-11-08/geo_sources/ne_10m_admin_1_states_provinces.geojson'
SOURCE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19'
SOURCE_URL = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{SOURCE_COMMIT}/geojson/ne_10m_admin_1_states_provinces.geojson'
SOURCE_SHA256 = '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5'
SOURCE_BYTES = 40726851
COUNTRY_SHA256 = '9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb'
REGISTRY_SHA256 = country.REGISTRY_SHA256
TOLERANCE_DEGREES = 0.01
COORDINATE_DECIMALS = 5
GEOMETRY_PATH = 'data/admin1.geojson'
INDEX_PATH = 'data/admin1-index.json'
MANIFEST_PATH = 'data/admin1-manifest.json'
SPECIAL_REGIONS = [
    {'id':'admin1-outside','label':{'es':'Sin polígono de subdivisión coincidente','en':'Outside matching subdivision polygons'}},
    {'id':'admin1-boundary','label':{'es':'Límite o subdivisiones superpuestas','en':'Subdivision edge or overlap'}},
    {'id':'admin1-invalid','label':{'es':'Coordenadas inválidas o ausentes','en':'Invalid or absent coordinates'}},
    {'id':'admin1-unavailable','label':{'es':'Subdivisiones no disponibles','en':'Subdivisions unavailable'}},
]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def compact(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')

def read_verified(path, expected):
    raw=Path(path).read_bytes()
    if sha(raw)!=expected:
        raise ValueError(f'Pinned SHA-256 mismatch: {Path(path).name}')
    return json.loads(raw)

def source_data(download=False):
    if not SOURCE.exists():
        if not download:
            raise FileNotFoundError('Pinned Natural Earth input missing; run --download to obtain the documented source')
        with urlopen(Request(SOURCE_URL,headers={'User-Agent':'SeismicDataGeosciences-admin1/1'}),timeout=90) as response:
            raw=response.read()
        if len(raw)!=SOURCE_BYTES or sha(raw)!=SOURCE_SHA256:
            raise ValueError('Downloaded Natural Earth source differs from pinned bytes')
        SOURCE.parent.mkdir(parents=True,exist_ok=True);SOURCE.write_bytes(raw)
    return read_verified(SOURCE,SOURCE_SHA256)

def distance_to_segment_squared(point,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    if dx==dy==0:return (point[0]-a[0])**2+(point[1]-a[1])**2
    t=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)))
    return (point[0]-a[0]-t*dx)**2+(point[1]-a[1]-t*dy)**2

def simplify_open(points,tolerance):
    if len(points)<3:return list(points)
    keep={0,len(points)-1};stack=[(0,len(points)-1)];threshold=tolerance*tolerance
    while stack:
        a,b=stack.pop();best=-1;distance=threshold
        for at in range(a+1,b):
            value=distance_to_segment_squared(points[at],points[a],points[b])
            if value>distance:best,distance=at,value
        if best!=-1:keep.add(best);stack.extend([(a,best),(best,b)])
    return [points[i] for i in sorted(keep)]

def ring_area(ring):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]))/2

def simplify_ring(source):
    original=country.unwrap_ring(source)
    # Split at the most distant vertex so a closed ring is not simplified into a line.
    opposite=max(range(1,len(original)-1),key=lambda i:(original[i][0]-original[0][0])**2+(original[i][1]-original[0][1])**2)
    simple=simplify_open(original[:opposite+1],TOLERANCE_DEGREES)+simplify_open(original[opposite:],TOLERANCE_DEGREES)[1:]
    # Every source island and hole remains a ring. A collapsing/orientation-changing
    # simplification falls back to the original rather than deleting a small feature.
    if len(set(simple[:-1]))<3 or ring_area(simple)*ring_area(original)<=0:
        simple=original
    output=[]
    for x,y in simple:
        while x>180:x-=360
        while x<-180:x+=360
        point=[round(x,COORDINATE_DECIMALS),round(y,COORDINATE_DECIMALS)]
        if not output or point!=output[-1]:output.append(point)
    if output[0]!=output[-1]:output.append(output[0])
    if len(set(map(tuple,output[:-1])))<3:
        # Do not collapse tiny islands through coordinate rounding either.
        output=[[float(x),float(y)] for x,y in source]
    return output

def simplify_geometry(geometry):
    if geometry['type'] not in {'Polygon','MultiPolygon'}:
        raise ValueError('Expected Polygon or MultiPolygon admin-1 geometry')
    polys=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
    # A hole must remain inside its own exterior. Retain all vertices in any
    # polygon containing holes rather than simplifying rings independently.
    result=[[[[float(x),float(y)] for x,y in ring] for ring in poly] if len(poly)>1
            else [simplify_ring(ring) for ring in poly] for poly in polys]
    return {'type':geometry['type'],'coordinates':result[0] if geometry['type']=='Polygon' else result}

def geometry_bounds(geometry):
    polys=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
    points=[p for poly in polys for ring in poly for p in ring]
    longitudes=sorted(set((p[0]+360)%360 for p in points));south=min(p[1] for p in points);north=max(p[1] for p in points)
    if len(longitudes)==1:west=east=longitudes[0]
    else:
        gaps=[((longitudes[(i+1)%len(longitudes)]-x)%360,i) for i,x in enumerate(longitudes)]
        _,gap=max(gaps);west=longitudes[(gap+1)%len(longitudes)];east=longitudes[gap]
        if east<west:east+=360
    while (west+east)/2>180:west-=360;east-=360
    return [[south,west],[north,east]]

def source_country(properties):
    value=properties.get('adm0_a3')
    return 'NE_france' if value=='FRA' else value

def region_properties(properties):
    country_id=source_country(properties);source_id=properties.get('adm1_code')
    if not isinstance(source_id,str) or not source_id:
        raise ValueError('Natural Earth admin-1 feature lacks its source code')
    identifier=re.sub('[^A-Za-z0-9_-]+','-',source_id).strip('-')
    name=properties.get('name') or properties.get('name_en')
    en=properties.get('name_en') or name;es=properties.get('name_es') or name
    alias=None
    if source_id=='MEX-2727':
        en='Mexico City (Distrito Federal in source)';es='Ciudad de México (Distrito Federal en la fuente)'
        alias='Display alias disambiguates source Distrito Federal from the separate State of Mexico; source geometry/code/name remain unchanged.'
    if not en or not es:
        en='Unnamed minor islands (Natural Earth)' if country_id=='MEX' else 'Unnamed subdivision (Natural Earth)'
        es='Islas menores sin nombre (Natural Earth)' if country_id=='MEX' else 'Subdivisión sin nombre (Natural Earth)'
    return {'admin1_id':identifier,'country_id':country_id,'label_en':en,'label_es':es,
            'source_name':name,'source_admin1_code':source_id,'source_iso_3166_2':properties.get('iso_3166_2'),
            'source_type':properties.get('type_en'),'source_note':properties.get('note'),'display_alias':alias}

def prepare_geometry(source,country_ids):
    features=[];seen=set()
    for feature in source['features']:
        if source_country(feature['properties']) not in country_ids:continue
        props=region_properties(feature['properties'])
        if props['admin1_id'] in seen:raise ValueError('Repeated derived admin-1 identity')
        seen.add(props['admin1_id']);geometry=simplify_geometry(feature['geometry'])
        props['bounds']=geometry_bounds(geometry)
        features.append({'type':'Feature','properties':props,'geometry':geometry})
    features.sort(key=lambda f:f['properties']['admin1_id'])
    return {'type':'FeatureCollection','features':features}

class Admin1Index:
    def __init__(self,geometry):
        self.indices={};self.regions=[]
        for feature in geometry['features']:
            p=feature['properties'];identifier=p['admin1_id'];cid=p['country_id']
            if cid not in self.indices:self.indices[cid]=country.LandIndex({'type':'FeatureCollection','features':[]})
            land=self.indices[cid];g=feature['geometry'];polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
            for poly in polys:land._add_polygon(identifier,poly)
            self.regions.append({'id':identifier,'country_id':cid,'label':{'es':p['label_es'],'en':p['label_en']},
                                 'bounds':p['bounds'],'source_admin1_code':p['source_admin1_code'],
                                 'source_iso_3166_2':p['source_iso_3166_2'],'source_type':p['source_type']})
    def classify(self,longitude,latitude,country_id):
        if country_id=='invalid':return 'admin1-invalid'
        if country_id=='boundary':return 'admin1-boundary'
        if country_id=='outside':return 'admin1-outside'
        if country_id not in self.indices:return 'admin1-unavailable'
        found=self.indices[country_id].classify(longitude,latitude)
        return {'outside':'admin1-outside','boundary':'admin1-boundary','invalid':'admin1-invalid'}.get(found,found)

def classify_package(package,country_ids,index,cache=None):
    fields=package['fields'];rows=package['rows']
    if len(set(fields))!=len(fields) or not {'longitude','latitude'}.issubset(fields) or len(rows)!=len(country_ids):
        raise ValueError('Admin-1 rows do not align with the catalogue and country index')
    lon,lat=fields.index('longitude'),fields.index('latitude');cache={} if cache is None else cache;ids=[]
    for row,cid in zip(rows,country_ids):
        if len(row)!=len(fields):raise ValueError('Malformed row cannot be assigned an admin-1 class')
        key=(cid,row[lon],row[lat]);safe=all(not isinstance(v,bool) and isinstance(v,(int,float)) and math.isfinite(v) for v in key[1:])
        if safe and key in cache:identifier=cache[key]
        else:
            identifier=index.classify(row[lon],row[lat],cid)
            if safe:cache[key]=identifier
        ids.append(identifier)
    counts=Counter(ids)
    by_country={}
    for cid,identifier in zip(country_ids,ids):by_country.setdefault(cid,Counter())[identifier]+=1
    return ids,dict(sorted(counts.items())),{cid:dict(sorted(c.items())) for cid,c in sorted(by_country.items())}

def build(verify_only=False,download=False):
    old_countries=read_verified(DIST/'data/country-index.json',COUNTRY_SHA256)
    registry=read_verified(DIST/'data/catalogs.json',REGISTRY_SHA256)
    country_ids={r['id'] for r in old_countries['regions']}-{'outside','boundary','invalid'}
    geometry=prepare_geometry(source_data(download),country_ids);raw_geometry=compact(geometry);index=Admin1Index(geometry)
    catalogs={};cache={};country_by_region={r['id']:r['country_id'] for r in index.regions};specials={r['id'] for r in SPECIAL_REGIONS}
    for c in registry['catalogs']:
        events_path=Path(c['events_url'])
        if events_path.is_absolute() or '..' in events_path.parts:raise ValueError('Unsafe catalogue path')
        package=read_verified(DIST/events_path,c['sha256']);old=old_countries['catalogs'][c['id']]
        if old['events_sha256']!=c['sha256'] or len(package['rows'])!=old['row_count']:raise ValueError('Country/catalogue evidence does not match')
        ids,counts,by_country=classify_package(package,old['country_ids'],index,cache)
        if any(identifier not in specials and country_by_region[identifier]!=cid for cid,identifier in zip(old['country_ids'],ids)):
            raise ValueError('Admin-1 assignment crosses its retained country class')
        catalogs[c['id']]={'events_sha256':c['sha256'],'row_count':len(ids),'admin1_ids':ids,'counts':counts,'country_counts':by_country}
    metadata={'id':'natural-earth-admin1-pip/1','source_scale':'1:10 million','generalization':'Closed-ring Ramer-Douglas-Peucker for polygons without holes; all vertices are retained for polygons with holes. Every source polygon/island/hole is retained; collapsing or orientation-changing rings fall back to their original vertices.',
              'simplification_tolerance_degrees':TOLERANCE_DEGREES,'coordinate_decimals':COORDINATE_DECIMALS,
              'classification':'Even-odd containment in the packaged generalized geometry, using the existing latitude-band algorithm separately for each retained country class.',
              'country_condition':'A subdivision can be assigned only if its country_id equals the unchanged country-index row. No nearest state/province or place-text matching.',
              'special_cases':{r['id']:r['label']['en'] for r in SPECIAL_REGIONS},
              'boundary':'Any ring edge or overlap produces admin1-boundary; holes/coastal gaps remain admin1-outside.',
              'limitations':'Approximate, generalized, de facto geographic containment in a pinned source. Not authoritative current administrative jurisdiction or positional uncertainty. Ring simplification is not asserted to preserve shared-edge topology.'}
    output={'schema':'seismic-admin1-index/1','geometry_path':GEOMETRY_PATH,'geometry_sha256':sha(raw_geometry),'country_index_path':'data/country-index.json','country_index_sha256':COUNTRY_SHA256,
            'registry_sha256':REGISTRY_SHA256,'source_sha256':SOURCE_SHA256,'method':metadata,'regions':index.regions,'special_regions':SPECIAL_REGIONS,'catalogs':catalogs}
    raw_index=compact(output)
    country_counts=dict(sorted(Counter(r['country_id'] for r in index.regions).items()))
    manifest={'schema':'seismic-admin1-manifest/1','source':{'name':'Natural Earth Admin 1 States and Provinces','version':'5.1.1','scale':'1:10 million','commit':SOURCE_COMMIT,'url':SOURCE_URL,
              'documentation':'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/','license':'Public domain','rights_url':'https://www.naturalearthdata.com/about/terms-of-use/',
              'retrieved_on':'2026-11-08','bytes':SOURCE_BYTES,'sha256':SOURCE_SHA256},'method':metadata,'retained_countries':len(country_ids),'countries_with_features':len(country_counts),'subdivisions':len(index.regions),
              'country_feature_counts':country_counts,'coverage_note':'The 50m admin-1 product covers only USA/Canada; 10m is used for Mexico and the other retained countries. Mexico has 32 named entities plus a source unnamed minor-island unit; units are not all called states.',
              'country_index_sha256':COUNTRY_SHA256,'registry_sha256':REGISTRY_SHA256,
              'assets':[{'path':GEOMETRY_PATH,'bytes':len(raw_geometry),'sha256':sha(raw_geometry)},{'path':INDEX_PATH,'bytes':len(raw_index),'sha256':sha(raw_index)}]}
    data={GEOMETRY_PATH:raw_geometry,INDEX_PATH:raw_index,MANIFEST_PATH:compact(manifest)}
    for path,raw in data.items():
        target=DIST/path
        if verify_only:
            if not target.is_file() or target.read_bytes()!=raw:raise ValueError(f'Admin-1 artifact differs: {path}')
        else:target.write_bytes(raw)
    report={'mode':'verify-only' if verify_only else 'build','regions':len(index.regions),'country_feature_counts':country_counts,
            'assets':[{'path':path,'bytes':len(raw),'sha256':sha(raw)} for path,raw in data.items()],
            'catalogs':{cid:{'rows':c['row_count'],'classified':sum(n for k,n in c['counts'].items() if k not in specials),'special_counts':{k:n for k,n in c['counts'].items() if k in specials}} for cid,c in catalogs.items()}}
    print(json.dumps(report,ensure_ascii=False));return output

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify-only',action='store_true');parser.add_argument('--download',action='store_true');args=parser.parse_args();build(args.verify_only,args.download)

if __name__=='__main__':main()
