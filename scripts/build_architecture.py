"""Build a visual architecture from preserved metadata and a real system capture.

Default capture: system/dist/overview-map.png. An explicit capture and output may
be supplied for a private layout preview. Missing captures cause an error; the
figure never substitutes a simulated interface or silent placeholder.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CAPTURE = ROOT / "system/dist/overview-map.png"
DEFAULT_OUTPUT = ROOT / "system/dist/architecture.svg"
DEFAULT_CAPTURE_URL = (
    "http://127.0.0.1:18306/?v=3&lang=en&catalog=usgs-na-2020-2025&snapshot="
    "8fe055ffe635875f7290906d45f70562a7896621&from=2020&to=2025&min=4.5&max=10&mt=mww"
    "&depth=1000&rev=us2000ahv0&c=53.69671%2C-124.98047%2C3"
)
WIDTH, HEIGHT = 2300, 1300


def _png(path: Path) -> tuple[str, int, int, str]:
    if not path.is_file():
        raise FileNotFoundError(
            f"Real system capture not found: {path}\n"
            "Take the current expanded-map screenshot and save it as "
            "system/dist/overview-map.png, or pass --capture-system PATH."
        )
    data = path.read_bytes()
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError(f"The system capture must be a valid PNG: {path}")
    width, height = struct.unpack(">II", data[16:24])
    if width < 1000 or height < 450:
        raise ValueError(
            f"System capture is too small for this figure ({width} x {height}). "
            "Use a horizontal desktop capture at least 1000 x 450 px."
        )
    if width <= height:
        raise ValueError("Use a horizontal system capture; portrait captures are not suitable.")
    return base64.b64encode(data).decode("ascii"), width, height, hashlib.sha256(data).hexdigest()


def _silhouette(features: list[dict], countries: tuple[str, ...], x: float, y: float,
                width: float, height: float) -> str:
    """Real Natural Earth source cues, not query-window or earthquake coverage.

    Simple equirectangular projection with continuous Alaska longitudes. Exterior
    silhouettes suffice at this scale; original source geometries are untouched.
    """
    rings = []
    for feature in features:
        if feature.get("properties", {}).get("ISO_A3") not in countries:
            continue
        geometry = feature["geometry"]
        polygons = ([geometry["coordinates"]] if geometry["type"] == "Polygon"
                    else geometry["coordinates"])
        for polygon in polygons:
            ring = []
            for lon, lat, *_ in polygon[0]:
                lon = lon - 360 if lon > 0 else lon
                if -195 <= lon <= -45 and 10 <= lat <= 85:
                    ring.append((lon, lat))
            if len(ring) >= 3:
                rings.append(ring)
    if not rings:
        raise ValueError(f"Natural Earth silhouette is absent for {countries!r}")
    points = [point for ring in rings for point in ring]
    mean_lat = (min(p[1] for p in points) + max(p[1] for p in points)) / 2
    correction = math.cos(math.radians(mean_lat))
    projected = [[(lon * correction, -lat) for lon, lat in ring] for ring in rings]
    points = [point for ring in projected for point in ring]
    west, east = min(p[0] for p in points), max(p[0] for p in points)
    north, south = min(p[1] for p in points), max(p[1] for p in points)
    scale = min(width / (east - west), height / (south - north))
    ox = x + (width - (east - west) * scale) / 2
    oy = y + (height - (south - north) * scale) / 2
    return " ".join(
        "M" + " L".join(f"{ox+(lon-west)*scale:.2f},{oy+(lat-north)*scale:.2f}"
                        for lon, lat in ring) + " Z"
        for ring in projected
    )


def build(capture_system: Path | str = DEFAULT_CAPTURE, capture_url: str = DEFAULT_CAPTURE_URL) -> str:
    capture_system = Path(capture_system)
    if not capture_system.is_absolute():
        capture_system = ROOT / capture_system
    image, image_w, image_h, capture_hash = _png(capture_system)
    catalogues = json.loads((ROOT / "system/dist/data/catalogs.json").read_text(encoding="utf-8"))["catalogs"]
    counts = {catalogue["id"]: catalogue["event_count"] for catalogue in catalogues}
    features = json.loads((ROOT / "system/dist/data/basemap.geojson").read_text(encoding="utf-8"))["features"]
    total = sum(counts.values())
    out = [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">',
        '<title id="title">A browser-based seismic observatory: sources, workspace and reusable results</title>',
        '<desc id="desc">Four preserved catalogue snapshots feed a browser-based observatory. '
        'The large central image is an actual expanded-map screenshot with administrative and tectonic context. '
        'Traceable descriptive results can be exported as CSV, JSON, HTML, SVG and ZIP. '
        'SQLite WebAssembly runs locally in a browser worker; a separate offline SQLite oracle validates evidence. '
        'Source rows are retained with provenance, not merged into independent earthquakes.</desc>',
        f'<metadata>Embedded system PNG SHA-256: {capture_hash}; dimensions: {image_w}x{image_h}. '
        'Source silhouettes: repository Natural Earth basemap. No simulated interface or plotted data. '
        'Capture origin: actual local preview, not a claim of a production capture. '
        f'Capture URL (provenance, not a public navigation link): {html.escape(capture_url)}</metadata>',
        '<defs><linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">'
        '<stop stop-color="#f3f8fc"/><stop offset=".56" stop-color="#fff"/><stop offset="1" stop-color="#eff7f5"/>'
        '</linearGradient><linearGradient id="blue" x1="0" x2="1"><stop stop-color="#075985"/><stop offset="1" stop-color="#0e7490"/></linearGradient>'
        '<filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#122f45" flood-opacity=".11"/></filter>'
        '<marker id="arrow" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="5" markerHeight="5" orient="auto"><path d="M2 2L9 6L2 10" fill="none" stroke="#548496" stroke-width="2"/></marker>'
        '</defs><style>.architecture-hit{transition:fill .15s,stroke .15s}.architecture-link:hover .architecture-hit,.architecture-link:focus .architecture-hit{fill:var(--hit);fill-opacity:.15;stroke:var(--hit);stroke-width:4}.architecture-link:focus{outline:none}@media(prefers-reduced-motion:reduce){.architecture-hit{transition:none}}</style>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#paper)"/>',
        '<g font-family="Arial,Helvetica,sans-serif" fill="#123047">',
    ]

    def text(x, y, value, size=22, weight=400, fill="#123047", anchor="start", spacing=None):
        letter_spacing = f' letter-spacing="{spacing}"' if spacing is not None else ""
        out.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" '
                   f'fill="{fill}" text-anchor="{anchor}"{letter_spacing}>{html.escape(str(value))}</text>')

    def rect(x, y, w, h, fill="#fff", stroke="#dce7ed", radius=16, extra=""):
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" '
                   f'fill="{fill}" stroke="{stroke}" {extra}/>')

    def path(d, color="#49768a", width=2, fill="none", extra=""):
        out.append(f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{width}" '
                   f'stroke-linecap="round" stroke-linejoin="round" {extra}/>')

    def arrow(x1, y1, x2, y2):
        path(f"M{x1} {y1}H{x2}", "#86a9b8", 2.2, extra='marker-end="url(#arrow)"')

    def pill(x, y, w, label, color="#075985", bg="#eaf4f8", size=19):
        rect(x, y, w, 33, bg, bg, 16)
        text(x+w/2, y+23, label, size, 600, color, "middle")

    def file_icon(x, y, color, letters, scale=1):
        out.append(f'<g transform="translate({x} {y}) scale({scale})">')
        path("M0 0H31L45 14V59H0Z", color, 2, "#fff")
        path("M31 0V14H45", color, 2)
        text(22.5, 40, letters, 14, 700, color, "middle")
        out.append('</g>')

    def heading(x, number, title, color):
        rect(x, 102, 34, 30, color, color, 8)
        text(x+17, 123, number, 17, 700, "#fff", "middle")
        text(x+46, 124, title, 23, 700)

    text(28, 49, "THE SEISMIC OBSERVATORY", 35, 700, "#123047", spacing=1.1)
    text(28, 78, "Preserved sources  /  an inspectable browser workspace  /  reusable descriptive information", 23, 400, "#456879")
    pill(1860, 23, 411, f"{total:,} preserved source rows", "#075985", "#deeff5", 22)
    heading(25, "01", "SOURCES", "#176b8d")
    heading(277, "02", "SYSTEM", "#087d87")
    heading(2050, "03", "OUTPUTS", "#997029")

    source_specs = [
        ("01 USGS", "North America", "usgs-na-2020-2025", "2020–2025", ("USA", "CAN", "MEX"), "#2563eb"),
        ("02 USGS", "Mexico region", "usgs-mx-historical", "1900–2026*", ("MEX",), "#7c3aed"),
        ("03 NRCan / GSC", "Canada + vicinity", "nrcan-ca-historical", "1985–2019", ("CAN",), "#c28112"),
        ("04 SSN / UNAM", "Mexico", "ssn-mx-historical", "1900–2026*", ("MEX",), "#0d9471"),
    ]
    for index, (agency, geography, key, years, countries, color) in enumerate(source_specs):
        x, y, w, h = 25, 151+index*237, 220, 218
        rect(x, y, w, h, "#fff", "#dae6ec", 17)
        out.append(f'<rect x="{x}" y="{y+17}" width="4" height="{h-34}" rx="2" fill="{color}"/>')
        text(x+17, y+32, agency, 23, 700, color)
        text(x+17, y+58, geography, 20, 400, "#456879")
        silhouette = _silhouette(features, countries, x+91, y+69, 111, 91)
        path(silhouette, color, .7, color, 'fill-opacity=".15" stroke-opacity=".65"')
        text(x+17, y+164, f"{counts[key]:,}", 34, 700, color)
        text(x+17, y+189, "source rows", 18, 400, "#456879")
        text(x+w-16, y+210, years, 17, 400, "#456879", "end")
        arrow(x+w+6, y+h/2, 266, y+h/2)
    text(26, 1121, "*2026 is partial", 17, 400, "#5a6f7e")

    # Native marks describe ingestion. All UI and map marks below are from PNG.
    process_y = 155
    file_icon(294, process_y-3, "#176b8d", "CSV", .53)
    text(328, process_y+20, "CSV / GeoJSON", 20, 600)
    arrow(484, process_y+9, 522, process_y+9)
    path(f"M540 {process_y-1}h12m-12 9h20m-20 9h12m12-24 8 12-8 12", "#087d87", 2.2)
    text(582, process_y+20, "UTC · types · units · nulls", 20, 600)
    arrow(839, process_y+9, 879, process_y+9)
    path(f"M907 {process_y-6}l17 7v12q-1 14-17 23-16-9-17-23V{process_y+1}Z", "#087d87", 2.1, "#e6f5f3")
    path(f"M899 {process_y+15}l6 6 11-14", "#087d87", 2.2)
    text(937, process_y+20, "SHA-256", 20, 700)
    arrow(1044, process_y+9, 1084, process_y+9)
    file_icon(1102, process_y-3, "#176b8d", "GZ", .53)
    text(1135, process_y+20, "JSON.gz + manifests", 20, 600)
    arrow(1353, process_y+9, 1393, process_y+9)
    text(1410, process_y+20, "Static GitHub Pages", 20, 700, "#075985")
    pill(1662, process_y-7, 346, "Provenance retained", "#087d87", "#e6f5f3", 19)

    # Contained, uncropped screenshot. Pixel aspect and original marks survive.
    frame_x, frame_y, frame_w, frame_h = 277, 204, 1745, 904
    rect(frame_x, frame_y, frame_w, frame_h, "#fff", "#bdced8", 12, 'filter="url(#shadow)"')
    inner_x, inner_y, inner_w, inner_h = frame_x+3, frame_y+3, frame_w-6, frame_h-6
    scale = min(inner_w/image_w, inner_h/image_h)
    shown_w, shown_h = image_w*scale, image_h*scale
    shown_x = inner_x+(inner_w-shown_w)/2
    shown_y = inner_y+(inner_h-shown_h)/2
    out.append(f'<image x="{shown_x:.3f}" y="{shown_y:.3f}" width="{shown_w:.3f}" height="{shown_h:.3f}" '
               f'preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,{image}"/>')

    outputs = [
        ("CSV", "Rows and", "group summaries", "#176b8d"),
        ("JSON", "Query and", "input evidence", "#087d87"),
        ("HTML", "Printable", "analysis report", "#8b5674"),
        ("SVG", "Native", "vector figures", "#aa6b22"),
        ("ZIP", "Files and", "hash manifest", "#525f98"),
    ]
    for index, (extension, first, second, color) in enumerate(outputs):
        x, y, w, h = 2050, 151+index*194, 221, 176
        rect(x, y, w, h, "#fff", "#dae6ec", 17)
        file_icon(x+18, y+18, color, extension, .84)
        text(x+75, y+44, extension, 30, 700, color)
        text(x+18, y+113, first, 21, 600)
        text(x+18, y+142, second, 21, 400, "#456879")
        arrow(2028, y+h/2, 2046, y+h/2)

    text(278, 1141, "LOCAL BROWSER COMPUTATION", 19, 700, "#087d87", spacing=.7)
    for x, w, label in [(622, 118, "JavaScript"), (751, 96, "Leaflet"), (858, 155, "Web Worker"),
                        (1024, 189, "SQLite · WASM"), (1224, 128, "Web Crypto")]:
        pill(x, 1118, w, label, "#075985", "#e8f2f7", 19)
    text(1380, 1141, "Session memory · no database server / Docker", 20, 400, "#456879")
    text(278, 1176, "12 coordinated views", 20, 700)
    views = [("Home", 78), ("Map", 64), ("Sources", 96), ("Results", 86), ("Revisions", 106),
             ("SQL", 62), ("Compare", 100), ("Methods", 96), ("Quick", 80),
             ("Top 10", 76), ("Proximity", 106), ("Help", 64)]
    current_x = 520
    for label, width in views:
        pill(current_x, 1154, width, label, "#31586b", "#edf3f6", 17)
        current_x += width+8
    text(1710, 1176, "NE admin-1 + PB2002 · context", 17, 600, "#58707e")

    # This lane is offline evidence validation, never a browser dependency.
    rect(25, 1205, 2246, 53, "#edf1f4", "#d8e0e6", 10)
    path("M49 1220h25v24H49Zm4-5h17m-27 10h6m-6 12h6m25-12h6m-6 12h6", "#627481", 1.8)
    text(96, 1239, "SEPARATE OFFLINE VALIDATION", 20, 700, "#465f71", spacing=.5)
    text(540, 1239, "Python contracts", 22, 600, "#465f71")
    arrow(727, 1232, 770, 1232)
    text(788, 1239, "SQLite oracle", 22, 700, "#465f71")
    arrow(944, 1232, 987, 1232)
    text(1005, 1239, "Synthetic fixtures + evidence audit", 22, 400, "#465f71")
    text(2229, 1239, "Not required by the web runtime", 21, 400, "#465f71", "end")
    text(25, 1287, "Source rows may overlap across catalogues; no cross-provider event merging or earthquake forecast.", 17, 400, "#5a6f7e")
    text(2271, 1287, "Context: Natural Earth (public domain) · PB2002: Bird (2003); Ahlenius / Nordpil / csterling (ODC-BY 1.0)", 16, 400, "#5a6f7e", "end")
    # Responsive SVG hit areas open the implemented source/query, not a mockup.
    for index, (_, _, key, _, _, color) in enumerate(source_specs):
        href='index.html?v=3&amp;lang=en&amp;catalog='+key+'&amp;tab=sources'
        out.append(f'<a class="architecture-link" style="--hit:{color}" href="{href}" target="_top"><title>Open {html.escape(key)} in Sources</title><rect x="25" y="{151+index*237}" width="220" height="218" class="architecture-hit" fill="transparent" pointer-events="all"/></a>')
    out.append('<a href="index.html?figure=4d&amp;lang=en" target="_top"><title>Open the real interactive map for this selection</title><rect x="277" y="204" width="1745" height="904" fill="transparent" pointer-events="all"/></a>')
    for index, (_, _, _, color) in enumerate(outputs):
        out.append(f'<a class="architecture-link" style="--hit:{color}" href="index.html?v=4&amp;lang=en&amp;catalog=all-catalogs&amp;from=2010&amp;to=2025&amp;min=4.5&amp;tab=analysis" target="_top"><title>Open analysis and reusable exports for this selection</title><rect x="2050" y="{151+index*194}" width="221" height="176" class="architecture-hit" fill="transparent" pointer-events="all"/></a>')
    out.append('</g></svg>\n')
    return "".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-system", type=Path, default=DEFAULT_CAPTURE,
                        help="Actual expanded-map PNG (default: system/dist/overview-map.png)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                        help="SVG output; use an ignored outputs/ path for private layout previews")
    parser.add_argument("--capture-url", default=DEFAULT_CAPTURE_URL,
                        help="Actual capture URL recorded as provenance, never as a public navigation link")
    args = parser.parse_args()
    try:
        svg = build(args.capture_system, args.capture_url)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, f"Architecture figure was not generated: {error}\n")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(svg, encoding="utf-8")
    print(f"Architecture figure: {args.output}")


if __name__ == "__main__":
    main()
