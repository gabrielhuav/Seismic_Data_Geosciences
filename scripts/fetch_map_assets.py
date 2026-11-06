"""Prepare pinned, local map assets; no live tile server or API key is used."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "system/dist"
NE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
SOURCES = {
    "vendor/leaflet/leaflet.js": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "vendor/leaflet/leaflet.css": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "vendor/leaflet/LICENSE": "https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE",
}
LEAFLET_EXTRA_HASHES = {
    "images/layers.png": "1dbbe9d028e292f36fcba8f8b3a28d5e8932754fc2215b9ac69e4cdecf5107c6",
    "images/layers-2x.png": "066daca850d8ffbef007af00b06eac0015728dee279c51f3cb6c716df7c42edf",
    "images/marker-icon.png": "574c3a5cca85f4114085b6841596d62f00d7c892c7b03f28cbfa301deb1dc437",
    "images/marker-icon-2x.png": "00179c4c1ee830d3a108412ae0d294f55776cfeb085c60129a39aa6fc4ae2528",
    "images/marker-shadow.png": "264f5c640339f042dd729062cfc04c17f8ea0f29882b538e3848ed8f10edb4da",
    "leaflet.js.map": "600a10dc5cd110de0699510d322afcbe01c7ca90b4c5f48adc20314c70aac753",
}
SOURCES.update({f"vendor/leaflet/{name}": f"https://unpkg.com/leaflet@1.9.4/dist/{name}" for name in LEAFLET_EXTRA_HASHES})
EXPECTED_SHA256 = {
    SOURCES["vendor/leaflet/leaflet.js"]: "db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a",
    SOURCES["vendor/leaflet/leaflet.css"]: "a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6",
    SOURCES["vendor/leaflet/LICENSE"]: "53e8dc25862014e4324741ca18fbe3611e11d42ef69f59f86ea8c5389647d4cb",
    f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_COMMIT}/geojson/ne_50m_admin_0_countries.geojson": "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb",
}
EXPECTED_SHA256.update({f"https://unpkg.com/leaflet@1.9.4/dist/{name}": sha for name, sha in LEAFLET_EXTRA_HASHES.items()})


def digest(raw): return hashlib.sha256(raw).hexdigest()


def obtain(url, path):
    existed = path.exists()
    if existed:
        raw = path.read_bytes()
    else:
        with urlopen(Request(url, headers={"User-Agent": "SeismicDataMapAssetPreparation/1"}), timeout=60) as response:
            raw = response.read()
    if digest(raw) != EXPECTED_SHA256[url]:
        raise ValueError(f"Pinned map asset hash mismatch: {url}")
    if not existed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    return raw


def coords(geometry):
    def walk(value):
        if value and isinstance(value[0], (int, float)):
            yield value
        else:
            for child in value: yield from walk(child)
    yield from walk(geometry["coordinates"])


def main():
    manifest = {"leaflet_version": "1.9.4", "leaflet_license": "BSD-2-Clause", "natural_earth_commit": NE_COMMIT,
                "basemap_scale": "1:50 million", "data_rights": "Natural Earth public domain",
                "rights_source": "https://www.naturalearthdata.com/about/terms-of-use/", "assets": []}
    for local, url in SOURCES.items():
        raw = obtain(url, DIST / local)
        manifest["assets"].append({"path": local, "source": url, "sha256": digest(raw), "bytes": len(raw)})
    url = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_COMMIT}/geojson/ne_50m_admin_0_countries.geojson"
    raw = obtain(url, ROOT / "data/raw/cartography/ne_50m_admin_0_countries.geojson")
    data = json.loads(raw)
    features = []
    for feature in data["features"]:
        points = list(coords(feature["geometry"]))
        west, east = min(p[0] for p in points), max(p[0] for p in points)
        south, north = min(p[1] for p in points), max(p[1] for p in points)
        if west > -65 or east < -135 or south > 45 or north < 3: continue
        props = feature["properties"]
        # Geographic context only. These polygons never classify event nationality.
        features.append({"type": "Feature", "properties": {k: props.get(k) for k in ["ADMIN", "NAME_EN", "ISO_A3", "LABEL_X", "LABEL_Y"]}, "geometry": feature["geometry"]})
    target = DIST / "data/basemap.geojson"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    manifest["assets"].append({"path": "data/basemap.geojson", "source": url, "source_sha256": digest(raw), "sha256": digest(target.read_bytes()), "bytes": target.stat().st_size,
                               "transformation": "Whole country features whose envelopes intersect longitude -135..-65 and latitude 3..45; retained labels and original coordinates."})
    (DIST / "data/map_assets.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"features": len(features), "local_assets": len(manifest["assets"]), "basemap_bytes": target.stat().st_size}))


if __name__ == "__main__": main()
