"""Render the implemented system design from registry counts and declared stack.

The diagram distinguishes data adaptation, browser computation and offline audit.
It is a maintained vector figure, not an interface screenshot or invented output.
"""
from pathlib import Path
import json
from scripts import make_figures as base
from matplotlib.patches import FancyBboxPatch,FancyArrowPatch
import matplotlib.pyplot as plt

R=base.ROOT
def main():
    registry= json.loads((R/'system/dist/data/catalogs.json').read_text(encoding='utf-8'))
    counts={}
    for cat in registry['catalogs']:
        data=json.loads((R/'system/dist'/cat['events_url']).read_text(encoding='utf-8'))
        assert len(data['rows'])==cat['event_count']
        counts[cat['id']]=len(data['rows'])
    base.style()
    fig,ax=plt.subplots(figsize=(6.5,5.8))
    ax.set(xlim=(0,1),ylim=(0,1));ax.axis('off')
    pairs=[]
    def box(x,y,w,h,title,body,fill):
        p=FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.009,rounding_size=0.008',edgecolor='#657B80',facecolor=fill,lw=.75)
        ax.add_patch(p)
        a=ax.text(x+w/2,y+h-.022,title,ha='center',va='top',weight='bold',fontsize=9.1,linespacing=1.2)
        b=ax.text(x+.013,y+h-.081,body,ha='left',va='top',fontsize=8.5,linespacing=1.46)
        pairs.extend([(p,a),(p,b)])
    ax.text(.005,.987,'A  General design',fontsize=11,weight='bold',va='top')
    for x,title,body in [(.012,'Preserved inputs','Source CSV / GeoJSON\nManifests and hashes'),(.355,'Explicit adapters','Field and clock alignment\nSource values retained'),(.699,'Browser workspace','Explore · inspect · analyse\nExport and reproduce')]:
        box(x,.774,.285,.166,title,body,'#EFF5F4')
    for x in [.305,.648]:
        ax.add_patch(FancyArrowPatch((x,.85),(x+.042,.85),arrowstyle='-|>',mutation_scale=11,lw=1,color='#27796E'))
    ax.text(.005,.727,'B  Four catalogues',fontsize=10,weight='bold',va='top')
    ax.text(.349,.727,'C  Actual implementation',fontsize=10,weight='bold',va='top')
    ax.text(.696,.727,'D  Reusable outputs',fontsize=10,weight='bold',va='top')
    box(.012,.245,.285,.43,'Three distributors',
        f"USGS · Mexico region\n{counts['usgs-mx-historical']:,} source records\n\nUSGS · North America\n{counts['usgs-na-2020-2025']:,} source records\n\nNRCan · Canada historical\n{counts['nrcan-ca-historical']:,} source records\n\nSSN · Mexico direct\n{counts['ssn-mx-historical']:,} source records",'#F6F2E9')
    box(.355,.245,.285,.43,'Preparation and delivery',
        'Python adapters\nCSV · JSON · GeoJSON\nSHA-256 manifests\n\nGit / GitHub repository\nGitHub Actions / Pages\n\nHTML · CSS · JavaScript\nLeaflet maps\nWeb Crypto verification\nBrowser-local analysis', '#EDF3F8')
    box(.699,.245,.285,.43,'Results and exports',
        'Separate / combined maps\nSearch and record tables\nSource catalogue inventory\n\nGrouped descriptive results\nAnnual selected-row counts\nWithin-group association\nFiltered-record CSV\nStatistics CSV\nQuery / analysis JSON\nPrintable HTML report', '#EDF4F3')
    box(.012,.031,.972,.151,'Independent offline evidence audit',
        'Retained ComCat versions → Python contracts → SQLite checks and synthetic fixtures.\nSource roles and clocks retained; source records do not imply unique earthquakes.', '#F4F4F4')
    fig.subplots_adjust(left=.012,right=.988,bottom=.015,top=.99)
    fig.canvas.draw();renderer=fig.canvas.get_renderer()
    for p,t in pairs:
        outer,inner=p.get_window_extent(renderer),t.get_window_extent(renderer)
        assert outer.x0<=inner.x0<=inner.x1<=outer.x1 and outer.y0<=inner.y0<=inner.y1<=outer.y1,t.get_text()
    files=base.save(fig,'figure_system_design')
    receipt={'figure':'system design','catalogue_counts':counts,'files':files,
      'implemented_stack':['Python adapters','Git/GitHub','GitHub Actions/Pages','HTML/CSS/JavaScript','Leaflet','Web Crypto SHA-256'],
      'offline_validation':'Python and SQLite; not a production database server',
      'scope':'Schema alignment preserves heterogeneous scientific meaning; no Docker, PHP, Java or server database is used by this deployed explorer.'}
    (R/'paper/figures/system_design_manifest.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps({'files':files,'counts':counts},indent=2))
if __name__=='__main__':main()
