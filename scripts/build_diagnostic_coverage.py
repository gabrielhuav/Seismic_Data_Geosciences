"""Preserve full-download SSN annual summaries for the browser diagnostics view."""
from pathlib import Path
import csv,hashlib,json,math

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'research-data/catalogs/ssn-mx/ssn_19000101_20261106.csv'
TARGET=ROOT/'system/dist/data/ssn-coverage.json'
EXPECTED='0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993'

def build():
    digest=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest!=EXPECTED:raise ValueError('SSN input hash mismatch')
    bins={year:dict(year=year,all=0,numeric=0,map=0,m5=0,maximum=None,maximum_rows=0) for year in range(1900,2027)}
    with SOURCE.open(encoding='utf-8-sig',newline='') as stream:
        reader=csv.reader(stream)
        for _ in range(4):next(reader)
        header=next(reader)
        if header[:3]!=['Fecha UTC','Hora UTC','Magnitud']:raise ValueError('SSN header mismatch')
        for row in reader:
            if len(row)!=len(header):continue
            item=bins[int(row[0][:4])];item['all']+=1
            try:value=float(row[2])
            except ValueError:continue
            if not math.isfinite(value):continue
            item['numeric']+=1;item['map']+=value>=3.5;item['m5']+=value>=5
            if item['maximum'] is None or value>item['maximum']:item['maximum']=value;item['maximum_rows']=1
            elif value==item['maximum']:item['maximum_rows']+=1
    totals={key:sum(row[key] for row in bins.values()) for key in ['all','numeric','map','m5']}
    assert totals==dict(all=402082,numeric=384433,map=242288,m5=1901)
    return dict(schema='ssn-annual-coverage/1',source=dict(path=str(SOURCE.relative_to(ROOT)).replace('\\','/'),sha256=digest,bytes=SOURCE.stat().st_size),totals=totals,partial_year=2026,cutoff_utc='2026-11-06T20:31:07Z',annual_bins=list(bins.values()),limits='Offline aggregation of preserved observed rows; missing years are not physical zeros. Unknown magnitude types remain unknown. No completeness or forecast claim.')

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--verify-only',action='store_true');args=parser.parse_args()
    raw=(json.dumps(build(),ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode('utf-8')
    if args.verify_only:assert TARGET.read_bytes()==raw,'Coverage package differs from reconstructed evidence'
    else:TARGET.write_bytes(raw)
    print(json.dumps({'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}))
