"""Package a pinned PB2002 cartographic overlay without reclassifying earthquakes.

GeoJSON conversion: Hugo Ahlenius/Nordpil and csterling, from Peter Bird's
PB2002 model (Bird, 2003). This third-party dataset is ODC-BY-1.0, not MIT/CC0.
"""
from __future__ import annotations
import argparse,hashlib,json,math
from pathlib import Path
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
PIN='339b0c56563c118307b1f4542703047f5f698fae'
CACHE=ROOT/'data/raw/tectonicplates'/PIN
OUT=ROOT/'system/dist/data'
TARGET=OUT/'tectonic-plates.geojson';MANIFEST=OUT/'tectonic-plates-manifest.json';LICENSE=OUT/'tectonic-plates-LICENSE.txt'
BASE='https://raw.githubusercontent.com/fraxen/tectonicplates/'+PIN+'/'
LICENSE_URL='https://opendatacommons.org/licenses/by/1-0/'
SOURCES={
 'GeoJSON/PB2002_plates.json':('922918f970baf7e645821a4a728b945dbb5eeac1337d71d087fba021bcc79e21',327718),
 'GeoJSON/PB2002_boundaries.json':('42b3e0876a7e40f133e958ba7ab85f8851b5c693a046fbc3b138e7751863d92a',226378),
 'LICENSE.md':('aca5f9e92e61843413b9297659af2eef552eb38fef39eae2f701566d985de36c',186),
 'README.md':('ed650bfd4ffde9cd09afe7981bdd5ea266d89529f78138a02d8d6e341e50c438',2871),
 'original/README.md':('d1bfa5b21ff8a53baaf2bc7c54ee1c51628ef724b82976e4448771e8d31a7b65',8019)
}
EXPECTED_SHA256='0a4d3ad9bb5d419d89f476a0fdd0f2dd35954b736e1a526d20414c728397e16b'
ATTRIBUTION='PB2002: Peter Bird (2003); GeoJSON conversion by Hugo Ahlenius/Nordpil and csterling; ODC-BY-1.0.'
CITATION={'author':'Bird, Peter','year':2003,'title':'An updated digital model of plate boundaries','journal':'Geochemistry, Geophysics, Geosystems','volume':'4','issue':'3','article':'1027','doi':'10.1029/2001GC000252','url':'https://doi.org/10.1029/2001GC000252'}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(value):return (json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode('utf-8')
def source(path,download=False):
    target=CACHE/path;expected,size=SOURCES[path]
    if download:
        raw=urlopen(Request(BASE+path,headers={'User-Agent':'SeismicDataGeosciences/1'}),timeout=30).read()
        if len(raw)!=size or sha(raw)!=expected:raise ValueError('Pinned source mismatch: '+path)
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    if not target.exists():raise FileNotFoundError(str(target)+'; rebuild with --download')
    raw=target.read_bytes()
    if len(raw)!=size or sha(raw)!=expected:raise ValueError('Pinned source mismatch: '+path)
    return raw

def points(geometry):
    def walk(c):
        if len(c)>=2 and isinstance(c[0],(int,float)):
            if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in c[:2]):raise ValueError('Invalid coordinate')
            if not (-180<=c[0]<=180 and -90<=c[1]<=90):raise ValueError('Coordinate range')
            yield c[:2]
        else:
            for child in c:yield from walk(child)
    yield from walk(geometry['coordinates'])

def build(download=False):
    bodies={name:source(name,download) for name in SOURCES}
    plates=json.loads(bodies['GeoJSON/PB2002_plates.json']);boundaries=json.loads(bodies['GeoJSON/PB2002_boundaries.json'])
    assert plates['type']==boundaries['type']=='FeatureCollection'
    assert len(plates['features'])==54 and len(boundaries['features'])==241
    features=[]
    for i,f in enumerate(plates['features'],1):
        assert f['geometry']['type'] in {'Polygon','MultiPolygon'}
        p=dict(f['properties']);p.update(kind='plate',plate_code=p['Code'],plate_name=p['PlateName'],feature_key=f'pb2002-plate-{i:03}')
        features.append({'type':'Feature','id':p['feature_key'],'properties':p,'geometry':f['geometry']})
    for i,f in enumerate(boundaries['features'],1):
        assert f['geometry']['type']=='LineString'
        p=dict(f['properties']);p.update(kind='boundary',boundary_id=f'pb2002-boundary-{i:03}',boundary_name=p['Name'],plate_a=p['PlateA'],plate_b=p['PlateB'],boundary_type=p.get('Type') or None)
        features.append({'type':'Feature','id':p['boundary_id'],'properties':p,'geometry':f['geometry']})
    unique={f['properties']['plate_code']:f['properties']['plate_name'] for f in features if f['properties']['kind']=='plate'}
    assert len(unique)==52 and {'PA','NA','CO','RI','CA','JF','NZ'}<=unique.keys()
    coordinates=[p for f in features for p in points(f['geometry'])]
    collection={'type':'FeatureCollection','name':'PB2002 tectonic plates and boundaries','model':'PB2002','model_publication_year':2003,'attribution':ATTRIBUTION,'license':{'id':'ODC-BY-1.0','url':LICENSE_URL},'features':features}
    raw=encode(collection)
    license_text=('Contains information from the PB2002 tectonic-plate collection, made available under the Open Data Commons Attribution License 1.0.\n'
      +ATTRIBUTION+'\nLicense: '+LICENSE_URL+'\nSource: https://github.com/fraxen/tectonicplates/tree/'+PIN+'\n'
      +'Model: Bird (2003), doi:10.1029/2001GC000252.\nThis package preserves source geometries and original attributes and adds display identifiers. It does not classify earthquakes or establish active-fault, subduction, hazard or forecasting claims.\n\nOriginal collection notice follows:\n'+bodies['LICENSE.md'].decode('utf-8')).encode('utf-8')
    metadata={'schema':'seismic-tectonic-context/1','model':'PB2002','model_publication_year':2003,'source_commit':PIN,'source_repository':'https://github.com/fraxen/tectonicplates','citation':CITATION,
      'license':{'id':'ODC-BY-1.0','url':LICENSE_URL,'notice':'tectonic-plates-LICENSE.txt','notice_sha256':sha(license_text)},'attribution':ATTRIBUTION,
      'source_files':[{'path':name,'url':BASE+name,'bytes':size,'sha256':hash_} for name,(hash_,size) in SOURCES.items()],
      'asset':{'path':'data/tectonic-plates.geojson','bytes':len(raw),'sha256':sha(raw)},'counts':{'plate_features':54,'unique_plate_codes':52,'boundary_features':241,'total_features':295,'vertices':len(coordinates)},
      'plate_names':dict(sorted(unique.items())),
      'regional_plate_labels':{'PA':{'en':'Pacific','es':'Pacífico'},'NA':{'en':'North America','es':'Norteamericana'},'CO':{'en':'Cocos','es':'Cocos'},'RI':{'en':'Rivera','es':'Rivera'},'CA':{'en':'Caribbean','es':'Caribe'},'JF':{'en':'Juan de Fuca','es':'Juan de Fuca'},'NZ':{'en':'Nazca','es':'Nazca'}},
      'transformation':'Concatenate original plate and boundary GeoJSON features. Preserve every geometry coordinate and original property; add kind, stable feature identifiers and aliases. No simplification, clipping, inferred boundary classification, earthquake assignment or source-row modification.',
      'limits':['Static PB2002 model published in 2003, not a live tectonic or active-fault service.','54 polygon features represent 52 plate codes; the source already splits some geometries at the antimeridian.','176 source boundary features have an empty Type and remain unknown; 65 retain the literal source type subduction. No additional boundary class is inferred.','Cartographic context does not identify an earthquake mechanism, plate membership, causality, hazard or a forecast.']}
    return raw,metadata,license_text

def verify():
    raw=TARGET.read_bytes();metadata=json.loads(MANIFEST.read_text(encoding='utf-8'));data=json.loads(raw)
    assert sha(raw)==metadata['asset']['sha256'] and len(raw)==metadata['asset']['bytes']
    if EXPECTED_SHA256:assert sha(raw)==EXPECTED_SHA256
    assert metadata['source_commit']==PIN and metadata['license']['id']=='ODC-BY-1.0'
    assert sha(LICENSE.read_bytes())==metadata['license']['notice_sha256']
    assert len(data['features'])==295 and data['model']=='PB2002'
    assert len({f['properties']['plate_code'] for f in data['features'] if f['properties']['kind']=='plate'})==52
    for f in data['features']:list(points(f['geometry']))
    if all((CACHE/name).exists() for name in SOURCES):
        expected,record,notice=build();assert raw==expected and metadata==record and LICENSE.read_bytes()==notice
    return {'asset':metadata['asset'],'counts':metadata['counts'],'license':'ODC-BY-1.0','source_commit':PIN}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--download',action='store_true');p.add_argument('--verify-only',action='store_true');args=p.parse_args()
    if args.verify_only:print(json.dumps(verify()));return
    raw,metadata,license_text=build(args.download);OUT.mkdir(exist_ok=True)
    TARGET.write_bytes(raw);MANIFEST.write_bytes(encode(metadata));LICENSE.write_bytes(license_text)
    print(json.dumps(verify()))
if __name__=='__main__':main()
