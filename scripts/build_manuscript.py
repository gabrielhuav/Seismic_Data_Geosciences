"""Create editable author-review documents by patching the retained C&G template.

Template styles, numbering, headers, footers, images and all opaque parts remain
byte-identical. Only manuscript content, image relationships/content types and
core metadata change. This script does not render or publish documents.
"""
from __future__ import annotations
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import struct
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "paper/templates/C&G_WordTemplate.docx"
SOURCE = ROOT / "paper/drafts/manuscript.md"
OUT = ROOT / "outputs/paper"
SUPPORT = ROOT / "outputs/paper-support"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"w": W, "r": R}
FIGURE_ANCHOR = re.compile(r"<!--\s*figure:\s*([1-9]\d*)\s*-->")
FIGURE_MARKER = re.compile(r"<!--\s*figure\b", re.IGNORECASE)
def w(n): return "{"+W+"}"+n
def node(n, **attrs):
    el=E.Element(w(n))
    for k,v in attrs.items(): el.set(w(k),str(v))
    return el
def sha(b): return hashlib.sha256(b).hexdigest()


def clean(text):
    # Compact article links remain genuine clickable relationships in Word/PDF.
    text=re.sub(r"\[([^\]]+)\]\((https://gabrielhuav\.github\.io/Seismic_Data_Geosciences/\?figure=[^)]+)\)",r"\1",text)
    text=re.sub(r"\[([^\]]+)\]\(([^)]+)\)",r"\1 (\2)",text)
    return text.replace("`", "").replace("**", "").replace("−", "-").replace("–", "-").replace("—", "; ")


def blocks(text):
    lines=text.splitlines(); i=0
    while i<len(lines):
        s=lines[i].strip()
        if not s: i+=1; continue
        anchor=FIGURE_ANCHOR.fullmatch(s)
        if anchor:
            yield ("figure",int(anchor.group(1))); i+=1
        elif FIGURE_MARKER.search(s):
            raise ValueError("Figure anchors must be standalone <!-- figure:N --> lines")
        elif s.startswith("#"):
            level=len(s)-len(s.lstrip("#")); yield ("h"+str(level),s.lstrip("# ")); i+=1
        elif s.startswith("|"):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith("|"):
                cells=[clean(x.strip()) for x in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?",x.strip()) for x in cells): rows.append(cells)
                i+=1
            yield("table",rows)
        else:
            para=[]
            while i<len(lines) and lines[i].strip() and not lines[i].startswith(("#","|")):
                if FIGURE_MARKER.search(lines[i]): break
                para.append(lines[i].strip()); i+=1
            yield("p"," ".join(para))


def figure_placement_plan(parsed, figure_specs):
    """Validate the complete caption/anchor contract before changing any package."""
    content=[]; captions=[]; in_captions=False
    for kind,text in parsed:
        if kind=="h2" and text=="Figure captions":
            if in_captions: raise ValueError("Duplicate Figure captions section")
            in_captions=True; continue
        if in_captions:
            if kind!="p": raise ValueError("Figure captions may contain only caption paragraphs")
            captions.append(text)
        else:
            content.append((kind,text))
    if not in_captions: raise ValueError("Figure captions section is required")
    if not figure_specs or len(captions)!=len(figure_specs):
        raise ValueError("Each ordered and hash-verified figure requires one caption")
    expected=list(range(1,len(figure_specs)+1))
    for number,caption in zip(expected,captions):
        if not caption.startswith(f"Figure {number}."):
            raise ValueError("Figure captions must follow the declared document order")
    anchors=[text for kind,text in content if kind=="figure"]
    if len(anchors)!=len(set(anchors)): raise ValueError("Duplicate figure anchor")
    if set(anchors)-set(expected): raise ValueError("Figure anchor outside declared figure range")
    if set(expected)-set(anchors): raise ValueError("Missing figure anchor")
    if anchors!=expected: raise ValueError("Figure anchors must follow the declared document order")
    return content,captions


def without_figure_anchors(text):
    return "\n".join(line for line in text.splitlines() if not FIGURE_ANCHOR.fullmatch(line.strip()))


def main(include_highlights=True):
    source_bytes=SOURCE.read_bytes()
    source_text=source_bytes.decode("utf-8")
    parsed=list(blocks(source_text))
    figure_order_path=ROOT/"paper/figures/manuscript_figures.json"
    figure_specs=json.loads(figure_order_path.read_text(encoding="utf-8"))["ordered_figures"]
    content,captions=figure_placement_plan(parsed,figure_specs)
    raw=TEMPLATE.read_bytes()
    expected=json.loads((TEMPLATE.parent/"provenance.json").read_text())["sha256"]
    if sha(raw)!=expected: raise ValueError("Retained template hash changed")
    contract=ROOT/"tmp/template-contract/artifact.md"
    if not contract.exists(): raise FileNotFoundError("Template distillation contract is required")
    with ZipFile(TEMPLATE) as z: parts={n:z.read(n) for n in z.namelist()}
    doc=E.fromstring(parts["word/document.xml"]); body=doc.find(w("body")); ps=body.findall(w("p"))
    patterns={"title":ps[43],"author":ps[44],"abstract":ps[65],"heading":ps[68],"body":ps[69],"caption":ps[98]}
    final_sect=deepcopy(body.find(w("sectPr")))
    figure_pattern=next(deepcopy(p) for p in ps if p.find(".//"+w("drawing")) is not None)
    # Manuscript only; cover letter/highlights are separate artifacts, not sections.
    for child in list(body): body.remove(child)
    def paragraph(text,role="body",style=None):
        p=node("p"); pattern=patterns.get(role,patterns["body"])
        pr=deepcopy(pattern.find(w("pPr")))
        if pr is None: pr=node("pPr")
        for name in ["numPr","sectPr","pageBreakBefore"]:
            for c in pr.findall(w(name)): pr.remove(c)
        if role in ["title","heading"]: pr.append(node("keepNext"))
        if role == "caption":
            for old in pr.findall(w("keepNext")): pr.remove(old)
            pr.append(node("keepLines"))
        if style:
            for old in pr.findall(w("pStyle")): pr.remove(old)
            pr.insert(0,node("pStyle",val=style))
        pr.append(node("widowControl")); p.append(pr)
        run=node("r"); rp=node("rPr"); rp.append(node("rFonts",ascii="Times New Roman",hAnsi="Times New Roman",cs="Times New Roman")); rp.append(node("color",val="000000")); rp.append(node("sz",val=34 if role=="title" else 22 if role=="heading" else 20));
        if role in ["title","heading"]: rp.append(node("b"))
        rp.append(node("lang",val="en-US")); run.append(rp)
        for j,line in enumerate(clean(text).split("\n")):
            if j: run.append(node("br"))
            t=node("t"); t.set("{http://www.w3.org/XML/1998/namespace}space","preserve"); t.text=line; run.append(t)
        figure_links=list(re.finditer(r"\[([^\]]+)\]\((https://gabrielhuav\.github\.io/Seismic_Data_Geosciences/\?figure=[^)]+)\)",text))
        if not figure_links:
            p.append(run); return p
        def append_text(value,parent=p,linked=False):
            part=node("r"); properties=deepcopy(rp)
            if linked:
                for color in properties.findall(w("color")):properties.remove(color)
                properties.append(node("color",val="155DA0"));properties.append(node("u",val="single"))
            part.append(properties);literal=node("t");literal.set("{http://www.w3.org/XML/1998/namespace}space","preserve");literal.text=clean(value);part.append(literal);parent.append(part)
        at=0
        for match in figure_links:
            append_text(text[at:match.start()])
            rid="rIdArticleView"+str(len(rel)+1)
            relation=E.SubElement(rel,"{"+relns+"}Relationship",Id=rid,Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",Target=match.group(2),TargetMode="External")
            hyperlink=node("hyperlink");hyperlink.set("{"+R+"}id",rid);hyperlink.set(w("history"),"1");append_text(match.group(1),hyperlink,True);p.append(hyperlink);at=match.end()
        append_text(text[at:]);return p
    def table(rows):
        t=node("tbl"); prop=node("tblPr");prop.append(node("tblW",w=9360,type="dxa"));prop.append(node("tblLayout",type="fixed"))
        borders=node("tblBorders")
        for edge in ["top","left","bottom","right","insideH","insideV"]:
            borders.append(node(edge,val="single" if edge in ["top","bottom"] else "nil",sz=8,color="000000"))
        prop.append(borders); margins=node("tblCellMar")
        for edge in ["top","bottom"]: margins.append(node(edge,w=70,type="dxa"))
        for edge in ["left","right"]: margins.append(node(edge,w=100,type="dxa"))
        prop.append(margins);t.append(prop)
        if len(rows[0]) == 4 and "Catalogue" in rows[0][0]:
            widths = [2100, 1700, 1100, 4460]
        elif rows[0][0].startswith("Table 3."):
            widths=[3600,1500,4260]
        elif rows[0][0].startswith("Table 4."):
            widths=[3000,3180,3180]
        else:
            widths=[2500,3430,3430] if len(rows[0])==3 else [9360//len(rows[0])]*len(rows[0])
        grid=node("tblGrid")
        for width in widths:grid.append(node("gridCol",w=width))
        t.append(grid)
        for i,row in enumerate(rows):
            tr=node("tr");pr=node("trPr");pr.append(node("cantSplit"))
            if i==0:pr.append(node("tblHeader"))
            tr.append(pr)
            for j,cell in enumerate(row):
                tc=node("tc");cp=node("tcPr");cp.append(node("tcW",w=widths[j],type="dxa"));cp.append(node("vAlign",val="center"));tc.append(cp)
                if i==0:
                    cb=node("tcBorders");cb.append(node("bottom",val="single",sz=6,color="000000"));cp.append(cb)
                for func in ["snapshot_observed","retained_projection_conditional","historical_catalog_not_identifiable"]:
                    cell=cell.replace(func,func.replace("_","_\n"))
                p=paragraph(cell,"body");pp=p.find(w("pPr"))
                if i<len(rows)-1 or rows[0][0].startswith(("Table 2.","Table 3.")):
                    pp.append(node("keepNext"))
                for old in pp.findall(w("spacing")):pp.remove(old)
                pp.append(node("spacing",before=70,after=70,line=240,lineRule="auto"))
                if i and re.fullmatch(r"[\d,./ +−-]+",cell):pp.append(node("jc",val="right"))
                for run in p.findall(w("r")):
                    rp=run.find(w("rPr"))
                    if i==0:rp.append(node("b"))
                    if i and (cell.startswith(("snapshot_","retained_","historical_")) or re.fullmatch(r"us[0-9a-z]+",cell)):
                        for old in rp.findall(w("rFonts")):rp.remove(old)
                        rp.append(node("rFonts",ascii="Consolas",hAnsi="Consolas"))
                        for old in rp.findall(w("sz")):rp.remove(old)
                        rp.append(node("sz",val=18))
                tc.append(p);tr.append(tc)
            t.append(tr)
        return t
    relname="word/_rels/document.xml.rels"; rel=E.fromstring(parts[relname])
    relns="http://schemas.openxmlformats.org/package/2006/relationships"
    figure_nodes={}
    for i,(spec,caption) in enumerate(zip(figure_specs,captions),1):
        image_path = (ROOT / spec["path"]).resolve()
        if not image_path.is_relative_to((ROOT / "paper/figures").resolve()):
            raise ValueError("Manuscript figure escapes the maintained figure directory")
        image_bytes=image_path.read_bytes()
        if spec.get("sha256") and sha(image_bytes) != spec["sha256"]:
            raise ValueError("Figure bytes differ from their generation manifest")
        px_w,px_h=struct.unpack(">II",image_bytes[16:24]); cx=5943600;cy=round(cx*px_h/px_w)
        fp=deepcopy(figure_pattern)
        pr=fp.find(w("pPr"))
        if pr is None:pr=node("pPr");fp.insert(0,pr)
        for name in ["pageBreakBefore","keepNext"]:
            for old in pr.findall(w(name)): pr.remove(old)
        pr.append(node("keepNext"))
        for old in fp.findall(".//"+w("br")):
            if old.get(w("type"))=="page": old.getparent().remove(old)
        for old in fp.findall(".//"+w("lastRenderedPageBreak")): old.getparent().remove(old)
        for old in fp.findall(".//"+w("t")):old.text=""
        pic_ns={"a":"http://schemas.openxmlformats.org/drawingml/2006/main","wp":"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"}
        for el in fp.findall(".//a:blip",pic_ns):el.set("{"+R+"}embed",f"rIdAuditFigure{i}")
        for el in fp.findall(".//wp:extent",pic_ns)+fp.findall(".//a:xfrm/a:ext",pic_ns):el.set("cx",str(cx));el.set("cy",str(cy))
        for el in fp.findall(".//wp:docPr",pic_ns):el.set("id",str(100+i));el.set("name",f"Figure {i}");el.set("descr",clean(caption))
        parts[f"word/media/audit_figure_{i}.png"]=image_bytes
        E.SubElement(rel,"{"+relns+"}Relationship",Id=f"rIdAuditFigure{i}",Type=R+"/image",Target=f"media/audit_figure_{i}.png")
        figure_nodes[i]=(fp,paragraph(caption,"caption"))
    figure_placements=[]
    section_name=None
    for block_index,(kind,text) in enumerate(content):
        if kind=="figure":
            image_paragraph,caption_paragraph=figure_nodes[text]
            body.append(image_paragraph);body.append(caption_paragraph)
            figure_placements.append({"figure":text,"anchor":f"<!-- figure:{text} -->","content_block_index":block_index})
        elif kind=="table":
            body.append(table(text));gap=paragraph("")
            if text[0][0].startswith(("Table 2.","Table 3.")):gap.find(w("pPr")).append(node("keepNext"))
            body.append(gap)
        elif kind=="h1":body.append(paragraph(text,"title","Title"))
        elif kind in ["h2","h3"]:
            if kind=="h2": section_name=text
            body.append(paragraph(text,"heading"))
        else:body.append(paragraph(text,"abstract" if section_name=="Abstract" and not text.startswith("Keywords:") else "body"))
    parts[relname]=E.tostring(rel,xml_declaration=True,encoding="UTF-8",standalone=True)
    # Preserve source-derived page layout, continuous line numbering and footers.
    body.append(final_sect)
    parts["word/document.xml"]=E.tostring(doc,xml_declaration=True,encoding="UTF-8",standalone=True)
    core=E.fromstring(parts["docProps/core.xml"])
    core_ns={"dc":"http://purl.org/dc/elements/1.1/","cp":"http://schemas.openxmlformats.org/package/2006/metadata/core-properties"}
    for tag,value in [("dc:creator","José Manuel Villa Vargas; Gabriel Hurtado Avilés"),("dc:title",parsed[0][1]),("cp:lastModifiedBy","Gabriel Hurtado Avilés")]:
        el=core.find(tag,core_ns)
        if el is None:
            prefix,name=tag.split(":");el=E.SubElement(core,"{"+core_ns[prefix]+"}"+name)
        el.text=value
    parts["docProps/core.xml"]=E.tostring(core,xml_declaration=True,encoding="UTF-8",standalone=True)
    modified={"word/document.xml","docProps/core.xml",relname}
    for name in list(parts):
        if name.startswith("word/footer") and name.endswith(".xml"):
            footer=E.fromstring(parts[name]); changed=False
            for text_node in footer.findall(".//"+w("t")):
                if text_node.text and "short author name" in text_node.text:
                    # Preserve native PAGE fields; leave optional preprint/byline
                    # text blank consistently. Authorship remains on the title
                    # page and in core metadata.
                    text_node.text=""; changed=True
            if changed:
                parts[name]=E.tostring(footer,xml_declaration=True,encoding="UTF-8",standalone=True); modified.add(name)
    OUT.mkdir(parents=True,exist_ok=True)
    dest=OUT/"Seismic_CG_manuscript.docx"
    pending=dest.with_suffix(".building.docx")
    with ZipFile(pending,"w",ZIP_DEFLATED) as z:
        for name,data in parts.items():z.writestr(name,data)
    pending.replace(dest)
    with ZipFile(TEMPLATE) as ref:
        preserved=[n for n in ref.namelist() if n not in modified]
        with ZipFile(dest) as final:
            assert all(ref.read(n)==final.read(n) for n in preserved)
    SUPPORT.mkdir(parents=True, exist_ok=True)
    if include_highlights:
        # Highlights retain the body pattern and section geometry as a separate file.
        hdoc=E.fromstring(parts["word/document.xml"]); hb=hdoc.find(w("body"))
        for c in list(hb):hb.remove(c)
        hb.append(paragraph("Highlights","title","Title"))
        for line in (ROOT/"paper/drafts/highlights.txt").read_text(encoding="utf-8").splitlines():
            if line.strip():
                if len(line)>85:raise ValueError("Highlight exceeds 85 characters")
                hb.append(paragraph("• "+line))
        hb.append(deepcopy(final_sect));hparts=dict(parts);hparts["word/document.xml"]=E.tostring(hdoc,xml_declaration=True,encoding="UTF-8",standalone=True)
        SUPPORT.mkdir(parents=True, exist_ok=True)
        with ZipFile(SUPPORT/"Seismic_CG_highlights.docx","w",ZIP_DEFLATED) as z:
            for n,data in hparts.items():z.writestr(n,data)
    text=without_figure_anchors(source_text);abstract=text.split("## Abstract",1)[1].split("## 1.",1)[0].split("Keywords:")[0]
    maintext=text.split("## 1.",1)[1].split("## References",1)[0]
    metadata_path = SOURCE.parent / "author_metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
    pending = ["latest generated manuscript must pass complete visual review",
               "public code/data availability must match the actual released artifacts",
               "coauthor review and final submission authorization are not established by building a document"]
    if not metadata.get("confirmed_for_manuscript"):
        pending.append("author metadata and declarations unconfirmed")
    report={"source_sha256":sha(source_bytes),"template_sha256":sha(raw),"manuscript_sha256":sha(dest.read_bytes()),"author_metadata_sha256":sha(metadata_path.read_bytes()) if metadata_path.exists() else None,"preserved_part_count":len(preserved),"modified_parts":sorted(modified),"figure_count":len(figure_specs),"figure_specs":figure_specs,"figure_placement":"inline","figure_anchor_count":len(figure_placements),"figure_placements":figure_placements,"word_count_excludes_figure_anchors":True,"abstract_words":len(abstract.split()),"main_words_approximate":len(maintext.split()),"render_status":"not yet rendered; Word-native PDF export required on this Windows host","not_submission_ready":pending,
            "scientific_scope":"Bounded retained-projection application; independent historical public-state reconstruction accuracy is not claimed.",
            "editorial_risk":"The journal may judge the executable evidence-contract contribution incremental; software validation alone does not prove an advance over the state of the art."}
    (SUPPORT/"build_report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))


if __name__=="__main__":main()
