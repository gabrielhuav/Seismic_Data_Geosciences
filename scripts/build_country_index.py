"""Build a deterministic land-polygon lookup without changing catalogue bytes.

Country/territory means containment in the pinned Natural Earth 1:50m map
geometry. It does not mean nationality, jurisdiction, territorial water, source
agency, or the country named by a reference locality. Only Python's standard
library is used; no network request or upstream executable is involved.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "system/dist"
OUTPUT = DIST / "data/country-index.json"
GEOMETRY_PATH = "data/basemap.geojson"
GEOMETRY_SHA256 = "4eda3c4dcb5ff10e2013843b4efa1ecff08b016ee47929f4e641eb0fe77af35f"
REGISTRY_SHA256 = "a6724a24babd000f1f7358947092e915a63625daf400f13585a714aac06558bf"
EPSILON = 1e-10  # Numerical tolerance in degrees, never source uncertainty.
SPECIAL_REGIONS = [
    {"id": "outside", "label": {"en": "Outside land polygons / unassigned", "es": "Fuera de polígonos terrestres / sin asignar"}},
    {"id": "boundary", "label": {"en": "Polygon edge or overlapping regions", "es": "Borde de polígono o regiones superpuestas"}},
    {"id": "invalid", "label": {"en": "Invalid or absent coordinates", "es": "Coordenadas ausentes o inválidas"}},
]
TRANSLATIONS = {"MEX": {"en": "Mexico", "es": "México"},
                "USA": {"en": "United States of America", "es": "Estados Unidos de América"},
                "CAN": {"en": "Canada", "es": "Canadá"}}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def load_verified_json(path, expected_sha256):
    """Reject changed source bytes before any JSON deserialization."""
    raw = Path(path).read_bytes()
    if digest(raw) != expected_sha256:
        raise ValueError(f"Pinned source SHA-256 mismatch: {Path(path).name}")
    return json.loads(raw)


def region_identity(properties):
    code = properties.get("ISO_A3")
    if isinstance(code, str) and re.fullmatch(r"[A-Z]{3}", code):
        identifier = code
    else:
        admin = properties.get("ADMIN")
        if not isinstance(admin, str) or not admin.strip():
            raise ValueError("Natural Earth region lacks a stable ADMIN name")
        ascii_name = unicodedata.normalize("NFKD", admin).encode("ascii", "ignore").decode("ascii").lower()
        slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
        if not slug or len(slug) > 72:
            raise ValueError("Natural Earth ADMIN cannot form a safe stable ID")
        identifier = "NE_" + slug
    name = properties.get("NAME_EN") or properties.get("ADMIN")
    if not isinstance(name, str) or not name:
        raise ValueError("Natural Earth region lacks its source label")
    return {"id": identifier, "label": TRANSLATIONS.get(identifier, {"en": name, "es": name})}


def unwrap_ring(ring, reference=None):
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError("Country polygon rings must be explicitly closed")
    points = []
    for position in ring:
        if (len(position) < 2 or any(isinstance(v, bool) or not isinstance(v, (int, float))
                or not math.isfinite(v) for v in position[:2])):
            raise ValueError("Non-finite country geometry coordinate")
        x, y = position[:2]
        if not -180 <= x <= 180 or not -90 <= y <= 90:
            raise ValueError("Country geometry is not geographic longitude/latitude")
        if points:
            while x - points[-1][0] > 180:
                x -= 360
            while x - points[-1][0] < -180:
                x += 360
        points.append((x, y))
    if points[0] != points[-1]:
        raise ValueError("Unwrapped ring crosses a whole world or encloses a pole")
    middle = (min(x for x, _ in points) + max(x for x, _ in points)) / 2
    shift = 360 * round((reference - middle) / 360) if reference is not None else 0
    return [(x + shift, y) for x, y in points]


class LandIndex:
    """Bounding boxes and latitude-band segments avoid all-edge scans per row."""

    def __init__(self, geometry):
        if geometry.get("type") != "FeatureCollection":
            raise ValueError("Expected a Natural Earth FeatureCollection")
        self.regions, self.polygons, self.bands = [], [], {}
        self.edge_tests = 0
        seen = set()
        for feature in geometry["features"]:
            region = region_identity(feature["properties"])
            if region["id"] in seen:
                raise ValueError("Repeated country/territory ID; refusing ambiguous first-match mapping")
            seen.add(region["id"])
            self.regions.append(region)
            source = feature["geometry"]
            if source["type"] not in {"Polygon", "MultiPolygon"}:
                raise ValueError("Expected Polygon or MultiPolygon land geometry")
            polys = [source["coordinates"]] if source["type"] == "Polygon" else source["coordinates"]
            for poly in polys:
                self._add_polygon(region["id"], poly)
        self.regions.sort(key=lambda region: region["id"])

    def _add_polygon(self, region_id, source):
        if not source:
            raise ValueError("Empty land polygon")
        outer = unwrap_ring(source[0])
        west, east = min(x for x, _ in outer), max(x for x, _ in outer)
        south, north = min(y for _, y in outer), max(y for _, y in outer)
        if east - west > 180:
            raise ValueError("Country polygon must be cut at the antimeridian")
        center = (west + east) / 2
        rings = [outer] + [unwrap_ring(hole, center) for hole in source[1:]]
        edge_bands = {}
        for ring in rings:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
                if x1 == x2 and y1 == y2:
                    continue
                edge = (x1, y1, x2, y2)
                for band in range(math.floor(min(y1, y2) - EPSILON), math.floor(max(y1, y2) + EPSILON) + 1):
                    edge_bands.setdefault(band, []).append(edge)
        index = len(self.polygons)
        self.polygons.append((region_id, west, south, east, north, center, edge_bands))
        for band in range(math.floor(south - EPSILON), math.floor(north + EPSILON) + 1):
            self.bands.setdefault(band, []).append(index)

    def classify(self, longitude, latitude):
        if (any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                for v in [longitude, latitude]) or not -180 <= longitude <= 180 or not -90 <= latitude <= 90):
            return "invalid"
        band = math.floor(latitude)
        interiors, on_edge = set(), False
        for index in self.bands.get(band, []):
            region_id, west, south, east, north, center, edge_bands = self.polygons[index]
            if not south - EPSILON <= latitude <= north + EPSILON:
                continue
            # Only the temporary query longitude is unwrapped. Source rows are
            # never rewritten, normalized, rounded, deduplicated or reassigned.
            x = longitude + 360 * round((center - longitude) / 360)
            if not west - EPSILON <= x <= east + EPSILON:
                continue
            inside = False
            edges = edge_bands.get(band, [])
            self.edge_tests += len(edges)
            for x1, y1, x2, y2 in edges:
                dx, dy = x2 - x1, y2 - y1
                cross = (x - x1) * dy - (latitude - y1) * dx
                if (abs(cross) <= EPSILON * max(1, abs(dx), abs(dy))
                        and min(x1, x2) - EPSILON <= x <= max(x1, x2) + EPSILON
                        and min(y1, y2) - EPSILON <= latitude <= max(y1, y2) + EPSILON):
                    on_edge = True
                    break
                if (y1 > latitude) != (y2 > latitude) and x < x1 + (latitude - y1) * dx / dy:
                    inside = not inside
            if inside:
                interiors.add(region_id)
        if on_edge or len(interiors) > 1:
            return "boundary"
        return next(iter(interiors)) if interiors else "outside"


def classify_package(package, expected_rows, index, cache=None):
    fields, rows = package["fields"], package["rows"]
    if len(set(fields)) != len(fields) or not {"latitude", "longitude"}.issubset(fields):
        raise ValueError("Catalogue fields are missing or repeated")
    if len(rows) != expected_rows:
        raise ValueError("Catalogue row count differs from its pinned registry")
    lat, lon = fields.index("latitude"), fields.index("longitude")
    country_ids = []
    cache = {} if cache is None else cache
    for row in rows:
        if len(row) != len(fields):
            raise ValueError("Country index cannot align a malformed source row")
        xy = (row[lon], row[lat])
        # Booleans compare equal to integer coordinates in Python; reject them
        # before consulting the numeric coordinate cache.
        valid_key = all(not isinstance(v, bool) and isinstance(v, (int, float)) and math.isfinite(v) for v in xy)
        if valid_key and xy in cache:
            region_id = cache[xy]
        else:
            region_id = index.classify(*xy)
            if valid_key:
                cache[xy] = region_id
        country_ids.append(region_id)
    identifiers = [region["id"] for region in index.regions] + [region["id"] for region in SPECIAL_REGIONS]
    counts = dict.fromkeys(identifiers, 0)
    for region_id in country_ids:
        counts[region_id] += 1
    return country_ids, counts


def build(verify_only=False):
    registry = load_verified_json(DIST / "data/catalogs.json", REGISTRY_SHA256)
    geometry = load_verified_json(DIST / GEOMETRY_PATH, GEOMETRY_SHA256)
    index, cache = LandIndex(geometry), {}
    catalogs = {}
    for catalog in registry["catalogs"]:
        path = Path(catalog["events_url"])
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("Catalogue event path must remain inside the artifact")
        events_path = (DIST / path).resolve()
        events_path.relative_to(DIST.resolve())
        package = load_verified_json(events_path, catalog["sha256"])
        ids, counts = classify_package(package, catalog["event_count"], index, cache)
        catalogs[catalog["id"]] = {"events_sha256": catalog["sha256"], "row_count": len(ids),
                                    "country_ids": ids, "counts": counts}
    output = {"schema": "seismic-country-index/1", "geometry_path": GEOMETRY_PATH,
              "geometry_sha256": GEOMETRY_SHA256, "registry_sha256": REGISTRY_SHA256,
              "method": {"id": "natural-earth-land-pip/1", "scale": "Natural Earth 1:50 million",
                         "coordinate_order": "Original reported longitude, latitude; no coordinate is modified.",
                         "algorithm": "Even-odd Polygon/MultiPolygon containment with holes; per-polygon bounding boxes and one-degree latitude-band edge index.",
                         "boundary": "Any exterior/hole edge (including coasts), or interiors of more than one region, yields boundary. No first-match country wins.",
                         "outside": "No land polygon contains the reported point. This can include sea, lakes, generalized coasts/islands or uncovered areas; not a verified marine or territorial classification.",
                         "numeric_tolerance_degrees": EPSILON,
                         "tolerance_scope": "Computational roundoff only, not positional uncertainty, a coastline buffer or a nearest-country assignment.",
                         "antimeridian": "Ring/query longitudes are unwrapped only inside containment calculations. Original positive Aleutian longitudes remain unchanged.",
                         "region_ids": "Unique three-uppercase-letter source ISO_A3 where present; otherwise NE_ plus ASCII ADMIN slug (never -99).",
                         "limitations": "Generalized map geometry and de facto boundary policy, not authoritative jurisdiction, nationality, EEZ, uncertainty propagation, or a tectonic classification."},
              "text": {"en": "Approximate country/territory by reported point inside Natural Earth land polygons. Unassigned sea/coast/boundary cases remain separate; provider and locality text are not used.",
                       "es": "País/territorio aproximado por el punto reportado dentro de polígonos terrestres Natural Earth. Mar/costa sin asignación y límites quedan separados; no se usa el proveedor ni el texto de localidad."},
              "regions": index.regions + SPECIAL_REGIONS, "catalogs": catalogs}
    raw = compact(output)
    if verify_only:
        if OUTPUT.read_bytes() != raw:
            raise ValueError("Country index bytes differ from the recomputed pinned inputs")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(raw)
    print(json.dumps({"path": OUTPUT.relative_to(ROOT).as_posix(), "bytes": len(raw), "sha256": digest(raw),
                      "mode": "verify-only" if verify_only else "build",
                      "country_territory_regions": len(index.regions), "special_states": len(SPECIAL_REGIONS),
                      "edge_tests": index.edge_tests, "coordinate_cache_size": len(cache),
                      "catalogs": {key: {"row_count": value["row_count"], "counts": {k: v for k, v in value["counts"].items() if v}}
                                   for key, value in catalogs.items()}}))
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true",
                        help="Recompute from pinned inputs and compare exact existing bytes; never write the index")
    args = parser.parse_args(argv)
    build(verify_only=args.verify_only)


if __name__ == "__main__":
    main()
