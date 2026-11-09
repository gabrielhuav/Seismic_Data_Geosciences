# Seismic Data Geosciences

Independent research workspace for a seismic-data article intended for
[Computers & Geosciences](https://www.sciencedirect.com/journal/computers-and-geosciences).

Authors: José Manuel Villa Vargas; Gabriel Hurtado Avilés (corresponding author).

The system supports consultation, comparison and exploration of heterogeneous
earthquake catalogues, with traceable descriptive information for analysis,
study and subsequent research. The article presents three connected contributions:
the computational system, documented seismic inputs, and reproducible results
that demonstrate the workflow. Browser operations and offline analytical
pipelines remain explicitly distinct.

The software also audits retained origin-product revisions and makes its evidence
boundaries explicit. A current-selected ComCat pilot contains 36 events and 236
public origin-product versions. An independent SQLite evaluation checks 4,720
retained projections without discrepancies. Separate synthetic histories exercise
controlled evidence omissions; they do not estimate operational error rates.
The application does not reconstruct a complete past public catalog or estimate
earthquake probability or damage. The manuscript presents this bounded application;
the target journal's evaluation of its computational contribution remains separate.

## Manuscript

**A browser-based seismic observatory for regional earthquake catalogue comparison in North America**

The author-review manuscript is available as
[editable Word](outputs/paper/Seismic_CG_manuscript.docx) and
[PDF](outputs/paper/Seismic_CG_manuscript.pdf). The verified local pair has 30 pages,
13 inline figures and four editable tables with numerical alignment and explicit
notes. Genuine system captures, text, input hashes and every rendered page were
checked against the expanded local revision. This pair awaits publication with
that revision; it is not attributed to the older public baseline below.
The software MIT licence does not cover manuscript files.

The verified public baseline is
`590f6e79ad6d5d78d70e286ab0c60bd4e856fdce` (8 November 2026).
The compressed loader, browser SQL, administrative selection, tectonic context
and country-comparison additions described below are a local revision awaiting
publication. They are not attributed to that public commit. The
[live system](https://gabrielhuav.github.io/Seismic_Data_Geosciences/) uses a manual
Pages workflow; a new deployment requires separate authorization.
Publication does not imply journal acceptance or coauthor approval.

The two IJCOPI articles and systems informed the interface review; those projects
remain unchanged.

## Explorer and reproducibility

The [browser-local explorer](system/README.md) provides a geographic map, English
by default with Spanish available,
text search, catalogue and provider selectors, filters, source records, CSV export,
shareable views and downloadable local-query specifications with input hashes
and result IDs. Unversioned entry opens all four catalogues on Home; the
USGS North America catalogue covers 2020–2025. Versioned links retain their selection;
the original Mexico snapshot, a separately licensed NRCan historical Canadian
catalogue and the direct SSN 1900–2026 download remain individually selectable.
All four can also be explored together with their source records and overlap
flags retained. Country/territory filtering uses generalized land polygons,
independently of the data distributor; outside/boundary categories stay explicit.
The separate retained-revision pilot remains available in its own view. The local
revision has eight workspaces: Home, Catalogue, Sources, Analysis, Revisions,
Evidence/methods, SQL and country comparison. Country clicks require confirmation;
743 generalized Natural Earth first-order units support state/province selection
within the existing 47 country/territory land classes. Administrative queries use
v5 links with geometry/index evidence; earlier links remain supported. Neither
country nor subdivision labels assign offshore records to their nearest region.

Home provides a functional counterpart of the architecture: four preserved
inputs, the shared interactive map and real exports of the active selection.
An optional heatmap retains equal weights for visible source rows; 8-pixel cells,
a 32-pixel Gaussian radius and 12-pixel sigma use log1p colours relative to the
viewport maximum. It is neither physical density nor earthquake hazard. Point
symbols remain available. Mexican subdivision context preserves the offshore
selection. Source profiles expose each package's analytical purpose and adapter.
Guided SQL, practical retained-version examples and common-bin country comparison
make descriptive results inspectable before export. This refinement is local.

The Sources view presents the stored catalogue inventory, coverage, field/unit
semantics, packages and hashes. Analysis uses the active filtered selection to
show magnitude summaries by catalogue and exact reported type, documented-km
depth summaries, annual source-row counts and qualified descriptive Pearson
associations. It exports filtered records CSV, query JSON, summary CSV, analysis
and evidence JSON, and a printable HTML report. The visual-feedback revision
includes a selectable ZIP with a payload-hash manifest, an inline report preview,
native retained-version diagnostics and a separately scoped full-download SSN
coverage module. These results support further
analysis and research; no earthquake probability model is implemented.

Static gzip companions preserve original JSON bytes and hashes. Transfer progress,
bounded network/server retries and verified uncompressed fallback support loading;
integrity failures stop the load. An optional read-only SQL workspace uses
locally bundled sql.js 1.13.0 (SQLite/WebAssembly) in a Web Worker. It constructs
temporary in-memory tables from the current verified selection; no SQL server,
legacy SQL import, Docker or persistent database is required. Returned rows are
capped at 5,000 with explicit truncation; CSV contains values and JSON additionally
retains the statement and input evidence.

Country comparison applies common UTC years, reported-magnitude threshold and
exact type to one USGS North America catalogue. The default 2020–2025, M ≥ 4.5,
`mww` comparison contains 15 Canadian and 53 Mexican land-class records. Counts,
summaries and annual bins retain selected IDs and hashes; they are not national
hazard or completeness-adjusted occurrence rates. Optional PB2002 plates provide
static geological context, not event mechanisms or active-fault monitoring.

The default Natural Earth background is local. OpenStreetMap, humanitarian OSM,
USGS Topo and NASA Blue Marble's static August 2004 composite are optional
remote backgrounds, loaded after selection; background changes preserve
the active catalogue. The app serves packaged data without a database server, API key
or paid map account. See [catalogues, attribution and coverage](docs/CATALOGS.md).

Core auditing and validation require Python 3.10+ and its standard library.
The browser suites and browser-equivalence oracle also require Node.js:

```text
python scripts/prepare_public_evidence.py restore
python scripts/audit_revisions.py
python -m scripts.validate_evidence
python -m unittest discover -s tests
python scripts/build_catalogs.py --verify-only
python scripts/build_tectonic_assets.py --verify-only
python scripts/build_transport_assets.py --verify-only
node tests/test_analytics.cjs
node tests/test_research_charts.cjs
node tests/test_catalog_frontend.cjs
node tests/test_system_labels.cjs
node tests/test_asset_loader.cjs
node tests/test_sql_explorer.cjs
node tests/test_country_comparison.cjs
python -m http.server 8787 --bind 127.0.0.1 --directory system/dist
```

Open http://127.0.0.1:8787/ for the local explorer. The packaged application is
ready to serve; rebuilding all four catalogues and the local cartography is described in the
[reproduction guide](docs/REPRODUCIBILITY.md). Original pilot responses, the
acquisition manifest and their checksums are in the
[bounded evidence package](research-data/README.md). Figures and editable Word
generation use the separately listed authoring dependencies.

New project software and documentation use the [MIT licence](LICENSE).
[Source-specific rights and credits](docs/LICENSING.md) remain applicable to
observations, third-party software, cartography and the journal template.
Bundled sql.js retains MIT/SQLite notices; Natural Earth is public domain.
The pinned PB2002 GeoJSON conversion retains ODC-BY 1.0 attribution to Peter
Bird's model and Hugo Ahlenius/Nordpil and contributors' conversion. Preserved
inputs, local dependencies and standard exports support migration to another
static host; future browser compatibility and continued hosting are not guaranteed.
See the [deliberate deployment workflow](docs/DEPLOYMENT.md) for GitHub Pages.

Project continuity is documented in AGENTS.md and the three selected Markdown files
under contexto/. The manuscript files are available in the repository; the website
serves only `system/dist`. Context, manuscripts, private authoring inputs and historical
SSN-derived observations are excluded from the website. Historical repositories
remain independent and unchanged.
