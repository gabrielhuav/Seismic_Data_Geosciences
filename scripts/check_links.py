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
CSS_URL = re.compile(r"url\(\s*['\"]?([^)'\"\s]+)", re.I)
LOCAL_JSON = re.compile(r"['\"]((?:data|vendor)/[^'\"\s$]+)['\"]")
SOURCE_MAP = re.compile(r"[#@]\s*sourceMappingURL=([^\s]+)")
MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)")
SECRET = re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")
LOCAL_PATH = re.compile(r"(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|/Users/|/home/)")
EVENT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,100}\Z")
ALLOWED = {".html", ".js", ".css", ".json", ".geojson", ".map", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".ico", ".txt", ".woff", ".woff2"}
PRIVATE_PARTS = {".git", "contexto", "paper", "outputs", "tmp", "__pycache__", "node_modules", "credentials"}
USER_AGENT = "SeismicDataResearch-LinkCheck/2 (bounded reproducibility audit)"


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
            elif text[match.end():match.end()+2] == "${":
                templates.append({"source": name, "prefix": url, "status": "resolved separately from typed packaged event IDs"})
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
            refs += LOCAL_JSON.findall(text)
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


def privacy_and_integrity():
    inventory, failures = [], []
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
            if LOCAL_PATH.search(text):
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
    return {"inventory": inventory, "privacy_failures": failures, "integrity_checks": checks,
            "limits": "Checks known private path/credential signatures and packaged checksums; not a proof that arbitrary prose contains no personal information."}


def event_routes(mode):
    data = json.loads((DIST / "data/events.json").read_text(encoding="utf-8"))
    records = [dict(zip(data["fields"], row)) for row in data["rows"]]
    ids = [row["id"] for row in records]
    malformed = [eid for eid in ids if not isinstance(eid, str) or not EVENT_ID.fullmatch(eid)]
    files = {row["file"] for row in records}
    manifest = json.loads((DIST / "data/manifest.json").read_text(encoding="utf-8"))
    mapped_files = {spec["path"] for spec in manifest["files"] if spec.get("url", "").startswith("https://raw.githubusercontent.com/")}
    sample = {}
    for row in records:
        # Deterministic examples span file, network and year, rather than first N.
        sample.setdefault((row["file"], row["net"], row["time"][:4]), row["id"])
    chosen = sorted(set(ids if mode == "all" else sample.values() if mode == "sample" else []))
    routes = ["https://earthquake.usgs.gov/earthquakes/eventpage/" + quote(eid, safe="~()*!.'-") for eid in chosen]
    return {"event_count": len(ids), "unique_event_ids": len(set(ids)), "malformed_event_ids": malformed,
            "unmapped_raw_csv_files": sorted(files - mapped_files), "mode": mode,
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
              "dependency_scope": "Third-party Leaflet JS and source-map definition/source URLs are covered by pinned-file hashes, not interpreted as application navigation. Leaflet CSS resource URLs are checked as local references. Original application JS, including map attribution and generated-event templates, is scanned.",
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
