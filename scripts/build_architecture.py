"""Maintain the actual stack diagram shown in the application and manuscript."""
from pathlib import Path
import html
import json

ROOT=Path(__file__).resolve().parents[1]
def build():
    cats=json.loads((ROOT/'system/dist/data/catalogs.json').read_text())['catalogs']
    counts={c['id']:c['event_count'] for c in cats}
    out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1700 820" role="img" aria-labelledby="title desc"><title id="title">Implemented system architecture</title><desc id="desc">Preserved sources, verified adapters and browser computations, reusable outputs, and a separate offline evidence audit.</desc><rect width="1700" height="820" fill="white"/><g font-family="Arial,Helvetica,sans-serif" fill="#183342"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#506573"/></marker></defs>']
    def text(x,y,value,size=23,bold=False,anchor='start'):
        out.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{700 if bold else 400}" text-anchor="{anchor}">{html.escape(value)}</text>')
    def rect(x,y,w,h,fill='#fff'):
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="#91a2ac" stroke-width="1.5"/>')
    def line(x,y,x2,y2,arrow=False):
        out.append(f'<path d="M{x} {y}L{x2} {y2}" stroke="#506573" stroke-width="2" fill="none"'+(' marker-end="url(#arrow)"' if arrow else '')+'/>')
    for x,n,title in [(30,'01','PRESERVED SOURCES'),(600,'02','ADAPTATION AND COMPUTATION'),(1170,'03','WORKSPACE AND DELIVERABLES')]:
        text(x,44,n,21,True);text(x+47,44,title,26,True)
    for i,(label,key,scope) in enumerate([
        ('USGS · Mexico region','usgs-mx-historical','1900–2026 · regional snapshot'),
        ('USGS · North America','usgs-na-2020-2025','2020–2025 · regional windows'),
        ('NRCan / GSC · Canada','nrcan-ca-historical','1985–2019 · historical download'),
        ('SSN / UNAM · Mexico','ssn-mx-historical','1900–2026 · partial final year')]):
        y=79+i*135;rect(30,y,490,117,'#f6f8fa')
        out.append(f'<g transform="translate(66 {y+49})" fill="none" stroke="#215b91" stroke-width="2"><circle r="24"/><ellipse rx="10" ry="24"/><path d="M-23 0H23M-19 -12H19M-19 12H19"/><path d="M10 -25Q27 -47 35 -27Q38 -16 22 -8Q9 -17 10 -25Z" fill="white"/><circle cx="23" cy="-27" r="4"/></g>')
        text(108,y+30,label,29,True);text(108,y+61,f'{counts[key]:,} source rows',29);text(108,y+90,scope,24)
    line(531,320,582,320,True)
    rect(600,79,490,156,'#eef3f8');text(627,115,'Python source adapters',30,True)
    for n,s in enumerate(['CSV / GeoJSON → query schema','UTC · types · documented units','Original values and nulls retained']):text(627,151+n*30,s,28)
    line(845,240,845,275,True)
    rect(600,286,490,125,'#f6f8fa');text(627,324,'SHA-256 verification',30,True)
    text(627,360,'JSON + manifests · Web Crypto',28);text(627,391,'Git / Actions / static Pages',28)
    line(845,416,845,448,True)
    rect(600,460,490,142,'#eef3f8');text(627,498,'Browser JavaScript',30,True)
    text(627,533,'Filter · group · compute · draw',28);text(627,567,'Session memory · no server DB',28)
    line(1100,320,1152,320,True)
    rect(1170,79,490,523,'#f6f8fa')
    rect(1195,109,440,215);line(1195,143,1635,143);text(1213,133,'HTML / CSS / JS · Leaflet',26,True)
    for x,y in [(1230,191),(1260,222),(1302,198),(1340,261)]:out.append(f'<circle cx="{x}" cy="{y}" r="6" fill="#215b91"/>')
    line(1215,277,1370,161);line(1410,281,1610,281);line(1410,281,1410,167)
    for x,y in [(1433,258),(1470,237),(1517,245),(1570,197)]:out.append(f'<circle cx="{x}" cy="{y}" r="5" fill="#aa551b"/>')
    text(1195,362,'Maps and source records',30,True)
    for n,s in enumerate(['Grouped statistics / SVG','Version diagnostics / lineage','Full-download SSN coverage','CSV / JSON / HTML / ZIP','Input and payload hashes']):text(1195,405+n*36,s,28)
    rect(30,657,1630,132,'#f5f5f5');text(56,697,'SEPARATE OFFLINE EVIDENCE AUDIT',30,True)
    text(56,735,'ComCat products → Python contracts → SQLite oracle and synthetic fixtures',29)
    text(56,768,'Separate from the web runtime. Source rows are not merged into independent earthquakes; no forecast.',27)
    out.append('</g></svg>')
    return ''.join(out)+'\n'

if __name__=='__main__':
    (ROOT/'system/dist/architecture.svg').write_text(build(),encoding='utf-8')
