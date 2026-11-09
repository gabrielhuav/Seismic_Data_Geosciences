"""Check article/site links, packaged bytes and public-artifact privacy.

Offline checks never imply network success. HEAD/GET failures remain failures;
no earlier-project exceptions or saved connector receipts are applied silently.
Generated event links have an explicit inventory and optional bounded/all checks.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "system/dist"
URL = re.compile(r"https?://[^\s<>\"'`(){}\[\]\\$]+")
ENCODED_URL_SUFFIX = re.compile(r"['\"]\s*\+\s*encodeURIComponent\s*\(")
CSS_URL = re.compile(r"url\(\s*['\"]?([^)'\"\s]+)", re.I)
LOCAL_JSON = re.compile(r"['\"]((?:data|vendor)/[^'\"\s$]+)['\"]")
SOURCE_MAP = re.compile(r"[#@]\s*sourceMappingURL=([^\s]+)")
MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)")
SECRET = re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")
LOCAL_PATH = re.compile(r"(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|/Users/|/home/)")
EVENT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,100}\Z")
ALLOWED = {".html", ".js", ".css", ".json", ".geojson", ".map", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".ico", ".txt", ".woff", ".woff2", ".gz", ".wasm"}
PRIVATE_PARTS = {".git", "contexto", "paper", "outputs", "tmp", "__pycache__", "node_modules", "credentials"}
USER_AGENT = "SeismicDataResearch-LinkCheck/2 (bounded reproducibility audit)"
SQLJS_VERSION = "1.13.0"
SQLJS_PACKAGE_SHA256 = "6d70e68446df85ac8f56e34dd10986cfe1182335cb0f071b71b3f007bc33394a"
SQLJS_FILES = {
    "sql-wasm.js": (48788, "694ca5b36aa3e6e71f417819d7df390b65343665fcfa5c69015ca33d93d291b3"),
    "sql-wasm.wasm": (659806, "0734155c83e493983d1f2ff5b09a4fab6e35a32e9449c7e4e545756439f62d73"),
    "LICENSE": (2199, "60a3f6e4d7b29b4321359e683b36cf198d24f58e24582070f56e6fa89d5ee2be"),
}
NATURAL_EARTH_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
ADMIN1_SOURCE_SHA256 = "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5"
TECTONIC_COMMIT = "339b0c56563c118307b1f4542703047f5f698fae"
TECTONIC_SHA256 = "0a4d3ad9bb5d419d89f476a0fdd0f2dd35954b736e1a526d20414c728397e16b"
TECTONIC_LICENSE_SHA256 = "c1ecb59349b5b0cb81bad82d59af033304358c0109d668c727abe03bd96b2fd0"


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids = [], set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        for key in ("href", "src", "poster"):
            if attrs.get(key):
                self.links.append(attrs[key])
        if attrs.get("srcset"):
            self.links.extend(item.strip().split()[0] for item in attrs["srcset"].split(",") if item.strip())


def source_paths(scope):
    paths = [p for p in DIST.rglob("*") if p.is_file() and p.suffix.lower() in {".html", ".js", ".css", ".json", ".geojson"} and not ("vendor" in p.relative_to(DIST).parts and p.suffix == ".js")]
    if scope == "all":
        paths += [ROOT / "README.md", ROOT / "system/README.md", ROOT / "paper/drafts/manuscript.md"]
        paths += list((ROOT / "docs").rglob("*.md"))
        paths += [ROOT / "data/source_manifest.json", ROOT / "paper/templates/provenance.json"]
        paths += [ROOT / "research-data/README.md", ROOT / "research-data/comcat/manifest.json"]
    return sorted({p for p in paths if p.is_file()})


def collect_links(scope):
    external, templates = defaultdict(set), []
    local, sources, non_navigation = [], [], []
    for path in source_paths(scope):
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        name = path.relative_to(ROOT).as_posix()
        sources.append({"path": name, "sha256": digest(raw), "bytes": len(raw)})
        for match in URL.finditer(text):
            url = match.group().rstrip(".,;:")
            line_start = text.rfind("\n", 0, match.start()) + 1
            line_end = text.find("\n", match.end())
            line = text[line_start:line_end if line_end >= 0 else len(text)]
            if url == "https://local.invalid/" and name == "system/dist/view-state.js" and "new URL(" in line:
                non_navigation.append({"url": url, "source": name, "classification": "reserved parser base, never a navigable link", "line": text.count("\n", 0, match.start()) + 1})
            elif name in {"README.md", "system/README.md"} and urlsplit(url).hostname in {"127.0.0.1", "localhost", "::1"}:
                non_navigation.append({"url": url, "source": name, "classification": "local preview example in developer instructions; not a public deployment destination", "line": text.count("\n", 0, match.start()) + 1})
            elif text[match.end():match.end()+2] == "${":
                templates.append({"source": name, "prefix": url, "status": "resolved separately from typed packaged event IDs"})
            elif text[match.end():match.end()+1] == "{":
                templates.append({"source": name, "prefix": url,
                                  "status": "parameterized provider URL; event routes inventoried separately and map tiles requested only for a user-selected visible view, never prefetched by this checker"})
            elif ENCODED_URL_SUFFIX.match(text, match.end()):
                templates.append({"source": name, "prefix": url,
                                  "status": "URL prefix concatenated with an encoded identifier; typed packaged event routes inventoried separately, prefix is not a literal navigation target"})
            elif (name == "system/dist/app.js" and
                  url == "https://github.com/gabrielhuav/Seismic_Data_Geosciences/blob/main/" and
                  re.match(r"['\"]\s*\+\s*publicCopy\.split\(", text[match.end():])):
                templates.append({"source": name, "prefix": url,
                                  "status": "Manifest-defined native SSN copy; the complete destination is inventoried below, not this non-navigable prefix."})
            else:
                external[url].add(name)
        refs = []
        if path.suffix == ".html":
            parser = Assets()
            parser.feed(text)
            refs += parser.links
        elif path.suffix == ".css":
            refs += CSS_URL.findall(text)
        elif path.suffix == ".js":
            for match in LOCAL_JSON.finditer(text):
                link = match.group(1)
                # sql.js accepts a locateFile resolver even when wasmBinary is
                # supplied. This exact concatenated directory is not a fetched
                # asset. The actual JS/WASM/LICENSE targets are independently
                # pinned below and the explicit fetch remains a local reference.
                prefix = text[max(0, match.start()-30):match.start()]
                suffix = text[match.end():match.end()+12]
                if (name == "system/dist/sql-worker.js" and link == "vendor/sqljs/" and
                        re.search(r"locateFile\s*:\s*file\s*=>\s*$", prefix) and
                        re.match(r"\s*\+\s*file\b", suffix)):
                    non_navigation.append({"url": link, "source": name,
                                           "classification": "sql.js local resolver directory prefix; complete JS/WASM/licence paths independently pinned", "line": text.count("\n", 0, match.start())+1})
                else:
                    refs.append(link)
        elif path.suffix == ".md":
            refs += [a or b for a, b in MARKDOWN_LINK.findall(text)]
        if path.suffix in {".js", ".css"}:
            refs += SOURCE_MAP.findall(text)
        for link in sorted(set(refs)):
            target = urlsplit(link)
            if target.scheme or link.startswith("//"):
                continue
            resolved = ((DIST if target.path.startswith("/") else path.parent) / unquote(target.path).lstrip("/")).resolve() if target.path else path
            within = resolved.is_relative_to(ROOT)
            ok = within and resolved.is_file()
            if ok and target.fragment and resolved.suffix == ".html":
                parser = Assets()
                parser.feed(resolved.read_text(encoding="utf-8"))
                ok = unquote(target.fragment) in parser.ids
            local.append({"source": name, "link": link, "ok": ok, "reason": "exists" if ok else "missing target/fragment or escapes repository"})
    # The native SSN inspector constructs this provenance link from a verified
    # manifest path. Inventory its actual candidate destination, rather than
    # certifying only the repository URL prefix before the first publication.
    registry_path = DIST / "data/catalogs.json"
    if registry_path.exists():
        for catalog in json.loads(registry_path.read_text(encoding="utf-8"))["catalogs"]:
            if catalog["provider"] != "ssn":
                continue
            manifest_path = DIST / catalog["manifest_url"]
            for spec in json.loads(manifest_path.read_text(encoding="utf-8"))["files"]:
                copy = spec.get("public_copy_path", "")
                if re.fullmatch(r"research-data/catalogs/ssn-mx/[A-Za-z0-9_.-]+\.csv", copy):
                    external["https://github.com/gabrielhuav/Seismic_Data_Geosciences/blob/main/" + copy].add(manifest_path.relative_to(ROOT).as_posix())
    return external, local, templates, sources, non_navigation


def check_url(url, timeout=20):
    for method in ("HEAD", "GET"):
        try:
            with urlopen(Request(url, method=method, headers={"User-Agent": USER_AGENT}), timeout=timeout) as response:
                return {"url": url, "status": response.status, "final_url": response.url, "ok": 200 <= response.status < 400, "method": method}
        except HTTPError as error:
            if method == "HEAD" and error.code in (403, 405, 501):
                continue
            return {"url": url, "status": error.code, "ok": False, "classification": "client_blocked_or_forbidden" if error.code in (403, 429) else "http_failure", "method": method}
        except Exception as error:
            return {"url": url, "ok": False, "classification": "network_failure", "error": str(error), "method": method}


def packaged_feature_checks():
    """Check optional feature packages offline; this never certifies remote URLs.

    Feature entry points make their manifests mandatory. Fixed upstream engine
    and model pins are independent of the editable manifests. Transport is bound
    to every current JSON/GeoJSON input, including compressed and decoded bytes.
    Small synthetic link-policy fixtures without these features remain supported.
    """
    checks = []

    def check(name, ok, error=None):
        item = {"check": name, "ok": bool(ok)}
        if error is not None:
            item["error"] = str(error)
        checks.append(item)

    def local_file(relative):
        if not isinstance(relative, str) or not relative or "\\" in relative:
            raise ValueError("Invalid packaged path")
        path = Path(relative)
        target = (DIST / path).resolve()
        if path.is_absolute() or ".." in path.parts or not target.is_relative_to(DIST.resolve()) or not target.is_file():
            raise ValueError("Missing packaged file or path outside public artifact: " + relative)
        return target

    def matching_bytes(relative, spec):
        raw = local_file(relative).read_bytes()
        if len(raw) != spec["bytes"] or digest(raw) != spec["sha256"]:
            raise ValueError("Packaged bytes differ: " + relative)
        return raw

    sql_dir = DIST / "vendor/sqljs"
    if sql_dir.exists() or (DIST / "sql-explorer.js").exists():
        try:
            provenance = json.loads(local_file("vendor/sqljs/provenance.json").read_text(encoding="utf-8"))
            expected = {name: {"bytes": count, "sha256": sha} for name, (count, sha) in SQLJS_FILES.items()}
            check("pinned sql.js provenance and licence", provenance.get("name") == "sql.js" and
                  provenance.get("version") == SQLJS_VERSION and provenance.get("files") == expected and
                  provenance.get("package_sha256") == SQLJS_PACKAGE_SHA256 and
                  provenance.get("source_package") == f"https://registry.npmjs.org/sql.js/-/sql.js-{SQLJS_VERSION}.tgz" and
                  provenance.get("upstream") == f"https://github.com/sql-js/sql.js/tree/v{SQLJS_VERSION}" and
                  provenance.get("license") == "MIT; bundled SQLite is public domain")
            for name, spec in expected.items():
                try:
                    raw = matching_bytes("vendor/sqljs/" + name, spec)
                    check("pinned sql.js asset: " + name, name != "sql-wasm.wasm" or raw[:8] == b"\x00asm\x01\x00\x00\x00")
                except (OSError, ValueError, KeyError) as error:
                    check("pinned sql.js asset: " + name, False, error)
        except (OSError, ValueError, KeyError) as error:
            check("pinned sql.js provenance and licence", False, error)

    transport = DIST / "data/transport-manifest.json"
    if transport.exists() or (DIST / "asset-loader.js").exists():
        try:
            manifest = json.loads(local_file("data/transport-manifest.json").read_text(encoding="utf-8"))
            assets = manifest["assets"]
            listed = [asset["path"] for asset in assets]
            expected = {path.relative_to(DIST).as_posix() for path in (DIST / "data").rglob("*")
                        if path.is_file() and path.suffix in {".json", ".geojson"} and path != transport}
            check("transport manifest covers every structured data asset once", manifest.get("schema") == "seismic-transport/1" and
                  len(listed) == len(set(listed)) and set(listed) == expected)
            for asset in assets:
                name = asset["path"]
                try:
                    raw = matching_bytes(name, asset)
                    spec = asset["gzip"]
                    if spec["path"] != name + ".gz":
                        raise ValueError("Compressed path must be the original path plus .gz")
                    compressed = matching_bytes(spec["path"], spec)
                    check("transport original/gzip integrity: " + name, compressed[:4] == b"\x1f\x8b\x08\x00" and
                          compressed[4:8] == b"\x00" * 4 and compressed[9:10] == b"\xff" and gzip.decompress(compressed) == raw)
                except (OSError, ValueError, KeyError, EOFError) as error:
                    check("transport original/gzip integrity: " + str(name), False, error)
        except (OSError, ValueError, KeyError, TypeError) as error:
            check("transport manifest covers every structured data asset once", False, error)

    admin_manifest = DIST / "data/admin1-manifest.json"
    if admin_manifest.exists() or (DIST / "data/admin1-index.json").exists() or (DIST / "data/admin1.geojson").exists():
        try:
            metadata = json.loads(local_file("data/admin1-manifest.json").read_text(encoding="utf-8"))
            source = metadata["source"]
            check("pinned Natural Earth admin-1 source and rights", metadata.get("schema") == "seismic-admin1-manifest/1" and
                  source.get("commit") == NATURAL_EARTH_COMMIT and source.get("sha256") == ADMIN1_SOURCE_SHA256 and
                  source.get("bytes") == 40726851 and source.get("license") == "Public domain" and
                  source.get("url") == f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NATURAL_EARTH_COMMIT}/geojson/ne_10m_admin_1_states_provinces.geojson" and
                  source.get("rights_url") == "https://www.naturalearthdata.com/about/terms-of-use/")
            assets = metadata["assets"]
            check("admin-1 manifest names geometry and index once", {asset["path"] for asset in assets} ==
                  {"data/admin1.geojson", "data/admin1-index.json"} and len(assets) == 2)
            for asset in assets:
                try:
                    matching_bytes(asset["path"], asset)
                    check("pinned admin-1 asset: " + asset["path"], True)
                except (OSError, ValueError, KeyError) as error:
                    check("pinned admin-1 asset: " + str(asset.get("path")), False, error)
            index = json.loads(local_file("data/admin1-index.json").read_text(encoding="utf-8"))
            check("admin-1 country/registry/source evidence binding", index.get("country_index_sha256") == metadata.get("country_index_sha256") ==
                  digest(local_file("data/country-index.json").read_bytes()) and
                  index.get("registry_sha256") == metadata.get("registry_sha256") == digest(local_file("data/catalogs.json").read_bytes()) and
                  index.get("source_sha256") == ADMIN1_SOURCE_SHA256 and
                  index.get("geometry_sha256") == digest(local_file("data/admin1.geojson").read_bytes()))
        except (OSError, ValueError, KeyError, TypeError) as error:
            check("admin-1 package provenance", False, error)

    tectonic_manifest = DIST / "data/tectonic-plates-manifest.json"
    if tectonic_manifest.exists() or (DIST / "data/tectonic-plates.geojson").exists():
        try:
            metadata = json.loads(local_file("data/tectonic-plates-manifest.json").read_text(encoding="utf-8"))
            asset, licence, citation = metadata["asset"], metadata["license"], metadata["citation"]
            check("pinned PB2002 model, citation and separate licence", metadata.get("schema") == "seismic-tectonic-context/1" and
                  metadata.get("model") == "PB2002" and metadata.get("source_commit") == TECTONIC_COMMIT and
                  metadata.get("model_publication_year") == 2003 and citation.get("doi") == "10.1029/2001GC000252" and
                  citation.get("url") == "https://doi.org/10.1029/2001GC000252" and
                  licence.get("id") == "ODC-BY-1.0" and licence.get("url") == "https://opendatacommons.org/licenses/by/1-0/")
            raw = matching_bytes(asset["path"], asset)
            check("pinned PB2002 geometry", asset.get("path") == "data/tectonic-plates.geojson" and digest(raw) == TECTONIC_SHA256)
            notice = local_file("data/" + licence["notice"]).read_bytes()
            check("pinned PB2002 attribution notice", digest(notice) == licence.get("notice_sha256") == TECTONIC_LICENSE_SHA256)
            sources = metadata["source_files"]
            check("PB2002 source URLs use the pinned commit", len(sources) == 5 and all(
                  item["url"] == f"https://raw.githubusercontent.com/fraxen/tectonicplates/{TECTONIC_COMMIT}/" + item["path"] for item in sources))
        except (OSError, ValueError, KeyError, TypeError) as error:
            check("PB2002 package provenance", False, error)
    return checks


def privacy_and_integrity():
    inventory, failures, virtual_runtime_paths = [], [], []
    for path in sorted(DIST.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(DIST).as_posix()
        raw = path.read_bytes()
        inventory.append({"path": relative, "bytes": len(raw), "sha256": digest(raw)})
        parts = set(p.lower() for p in Path(relative).parts)
        reason = []
        if path.is_symlink() or not path.resolve().is_relative_to(DIST.resolve()):
            reason.append("symlink or target outside public artifact")
        if parts & PRIVATE_PARTS or relative.startswith("data/raw/") or path.name.startswith(".env"):
            reason.append("private path in public artifact")
        if path.suffix.lower() not in ALLOWED and path.name not in {"LICENSE", ".nojekyll"}:
            reason.append("unexpected public file type")
        if path.suffix.lower() in {".html", ".js", ".css", ".json", ".geojson", ".map", ".txt"}:
            text = raw.decode("utf-8")
            if SECRET.search(text):
                reason.append("credential/private-key signature")
            path_scan = text
            # The pinned Emscripten engine creates this POSIX directory inside
            # its in-memory virtual filesystem. It is not a workstation path.
            # Admit only the exact quoted literal in the exact upstream bytes;
            # any changed vendor file or any other local path still fails.
            if (relative == "vendor/sqljs/sql-wasm.js" and len(raw) == SQLJS_FILES["sql-wasm.js"][0] and
                    digest(raw) == SQLJS_FILES["sql-wasm.js"][1]):
                literal = '"/home/web_user"'
                if literal in path_scan:
                    path_scan = path_scan.replace(literal, '"[Emscripten virtual HOME]"')
                    virtual_runtime_paths.append({"path": relative, "literal": "/home/web_user",
                                                  "classification": "Pinned Emscripten in-memory POSIX HOME; not a workstation path",
                                                  "guard_sha256": SQLJS_FILES["sql-wasm.js"][1]})
            if LOCAL_PATH.search(path_scan):
                reason.append("private workstation path")
        if reason:
            failures.append({"path": relative, "reasons": reason})
    checks = []
    manifest_path = DIST / "data/manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        checks.append({"check": "events bytes match public manifest", "ok": digest((DIST / "data/events.json").read_bytes()) == manifest.get("derived_asset_sha256")})
        checks.append({"check": "historical SSN metadata excluded from public manifest", "ok": "historical_ssn" not in manifest})
    map_path = DIST / "data/map_assets.json"
    if map_path.exists():
        for asset in json.loads(map_path.read_text(encoding="utf-8"))["assets"]:
            target = (DIST / asset["path"]).resolve()
            ok = target.is_relative_to(DIST.resolve()) and target.is_file()
            if ok:
                raw = target.read_bytes()
                ok = len(raw) == asset["bytes"] and digest(raw) == asset["sha256"]
            checks.append({"check": "pinned map asset: " + asset["path"], "ok": ok})
    registry_path = DIST / "data/catalogs.json"
    if registry_path.exists():
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        ids = [item["id"] for item in registry["catalogs"]]
        checks.append({"check": "unique catalogue IDs and valid default", "ok": len(ids) == len(set(ids)) and registry["default_catalog_id"] in ids})
        for catalog in registry["catalogs"]:
            for path_key, hash_key in [("events_url", "sha256"), ("manifest_url", "manifest_sha256")]:
                target = (DIST / catalog[path_key]).resolve()
                ok = target.is_relative_to(DIST.resolve()) and target.is_file()
                if ok:
                    ok = digest(target.read_bytes()) == catalog[hash_key]
                checks.append({"check": catalog["id"] + ": " + path_key, "ok": ok})
    checks.extend(packaged_feature_checks())
    return {"inventory": inventory, "privacy_failures": failures, "virtual_runtime_paths": virtual_runtime_paths, "integrity_checks": checks,
            "limits": "Checks known private path/credential signatures and packaged checksums; not a proof that arbitrary prose contains no personal information."}


def event_routes(mode):
    registry_path = DIST / "data/catalogs.json"
    catalogs = json.loads(registry_path.read_text(encoding="utf-8"))["catalogs"] if registry_path.exists() else [
        {"id": "usgs-mx-historical", "provider": "usgs", "events_url": "data/events.json", "manifest_url": "data/manifest.json"}]
    ids, malformed, unmapped, routes, summaries = [], [], [], set(), []
    for catalog in catalogs:
        data = json.loads((DIST / catalog["events_url"]).read_text(encoding="utf-8"))
        records = [dict(zip(data["fields"], row)) for row in data["rows"]]
        manifest = json.loads((DIST / catalog["manifest_url"]).read_text(encoding="utf-8"))
        mapped_files = {spec["path"] for spec in manifest["files"]
                        if urlsplit(spec.get("url", "")).scheme == "https" or
                        (catalog["provider"] == "ssn" and
                         catalog.get("identifier_kind") == "derived_row_key" and
                         spec.get("url_kind") == "catalogue_landing" and
                         spec.get("url") == "http://www2.ssn.unam.mx:8080/catalogo/")}
        local_ids = [row["id"] for row in records]
        ids.extend(catalog["id"] + ":" + eid for eid in local_ids)
        malformed.extend(catalog["id"] + ":" + str(eid) for eid in local_ids if not isinstance(eid, str) or not EVENT_ID.fullmatch(eid))
        unmapped.extend(catalog["id"] + ":" + name for name in sorted({row["file"] for row in records} - mapped_files))
        sample = {}
        for row in records:
            sample.setdefault((row["file"], row["net"], row["time"][:4]), row["id"])
        # Derived NRCan row keys never become USGS event URLs. Its dataset links
        # are literal provenance links checked by collect_links.
        derived_keys = catalog.get("identifier_kind") == "derived_row_key" or manifest.get("identifier_kind") == "derived_row_key"
        chosen = set(local_ids if mode == "all" else sample.values() if mode == "sample" else []) if catalog["provider"] == "usgs" and not derived_keys else set()
        routes.update("https://earthquake.usgs.gov/earthquakes/eventpage/" + quote(eid, safe="~()*!.'-") for eid in chosen)
        summaries.append({"id": catalog["id"], "provider": catalog["provider"], "records": len(records), "sampled_or_selected_event_routes": len(chosen)})
    routes = sorted(routes)
    return {"event_count": len(ids), "unique_event_ids": len(set(ids)), "counting_unit": "catalogue records, namespaced by catalogue; overlapping observations are not asserted to be independent earthquakes",
            "catalogues": summaries, "malformed_event_ids": malformed,
            "unmapped_raw_csv_files": unmapped, "mode": mode,
            "route_count": len(routes), "generated_route_family": "USGS current event page, URL-encoded packaged event ID",
            "limits": "HTTP success on an event-page route does not prove that a current event exists or that current parameters equal the frozen observation. Sampling never certifies unvisited links."}, routes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--network", action="store_true")
    parser.add_argument("--scope", choices=("all", "artifact"), default="all")
    parser.add_argument("--dynamic-events", choices=("none", "sample", "all"), default="none")
    parser.add_argument("--workers", type=int, choices=range(1, 5), default=4)
    args = parser.parse_args()
    external, local, templates, sources, non_navigation = collect_links(args.scope)
    artifact = privacy_and_integrity()
    dynamic, routes = event_routes(args.dynamic_events)
    urls = sorted(set(external) | set(routes))
    checked = list(ThreadPoolExecutor(max_workers=args.workers).map(check_url, urls)) if args.network else []
    for result in checked:
        result["linked_from"] = sorted(external.get(result["url"], [])) or ["generated current-event route"]
    failures = sum(not item["ok"] for item in local)
    failures += len(artifact["privacy_failures"]) + sum(not item["ok"] for item in artifact["integrity_checks"])
    failures += len(dynamic["malformed_event_ids"]) + len(dynamic["unmapped_raw_csv_files"])
    network_failures = sum(not item["ok"] for item in checked)
    report = {"checked_at_utc": datetime.now(timezone.utc).isoformat(), "scope": args.scope, "source_files": sources,
              "local_assets": local, "artifact": artifact, "literal_external_url_count": len(external),
              "literal_external_inventory": [{"url": url, "linked_from": sorted(paths)} for url, paths in sorted(external.items())],
              "non_navigation_urls": non_navigation,
              "dependency_scope": "Third-party Leaflet JS and sql.js/SQLite WASM engine bytes are covered by independent version/file pins and packaged provenance, not interpreted as application navigation. Leaflet CSS resources are checked as local references. Engine provenance, Natural Earth admin-1 and PB2002 model/citation/licence URLs are included in the literal external inventory and need fresh network verification for publication; offline byte checks never certify those destinations. Original application JS, including map attribution and generated-event templates, is scanned. Every transport entry verifies original and compressed hashes, sizes and lossless decoding.",
              "archived_response_scope": "Raw official response bodies in research-data/comcat preserve historical product-content URLs as captured evidence, not as current website navigation. Their bytes and acquisition manifest are checked by prepare_public_evidence.py; this link report covers the source/query links exposed by the article, technical documentation and deployed explorer, without dereferencing every unexposed media URL inside archived products.",
              "url_templates": templates, "dynamic_events": dynamic, "external_checked": checked,
              "network_checked": args.network, "generated_event_links_exhaustively_checked": args.network and args.dynamic_events == "all",
              "failed_local": failures, "failed_external": network_failures,
              "publication_gate": "No automatic exceptions. Match this source/artifact inventory to the exact proposed push; resolve failures with fresh evidence or explicit authorization for that push. Offline or sampled coverage does not certify unvisited URLs."}
    output = ROOT / "outputs/links"
    output.mkdir(parents=True, exist_ok=True)
    name = "report_network.json" if args.network else "report_local.json"
    (output / name).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"report": str(output / name), "scope": args.scope, "public_files": len(artifact["inventory"]),
                      "local_references": len(local), "literal_external_urls": len(external), "dynamic_events": dynamic,
                      "network_checked": args.network, "failed_local": failures, "failed_external": network_failures}, indent=2))
    return 1 if failures or network_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
