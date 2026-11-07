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

**A web system for traceable exploration and analysis of heterogeneous earthquake catalogues**

The current author-review manuscript is available as
[editable Word](outputs/paper/Seismic_CG_manuscript.docx) and
[PDF](outputs/paper/Seismic_CG_manuscript.pdf). This version has 26 pages,
eight inline figures and four tables. It describes the published explorer at
code commit `49372d02198a614a07dda1a3ecbb8a21d754ff68`, including direct SSN,
USGS and NRCan inputs, separate/combined catalogue exploration and derived
descriptive analyses. Public availability does not imply journal acceptance.
The software MIT licence does not cover these manuscript files.

## Explorer and reproducibility

The [browser-local explorer](system/README.md) provides a geographic map, ES/EN,
text search, catalogue and provider selectors, filters, source records, CSV export,
shareable views and downloadable local-query specifications with input hashes
and result IDs. Its default USGS North America catalogue covers 2020–2025;
the original Mexico snapshot, a separately licensed NRCan historical Canadian
catalogue and the direct SSN 1900–2026 download remain individually selectable.
All four can also be explored together with their source records and overlap
flags retained. Country/territory filtering uses generalized land polygons,
independently of the data distributor; outside/boundary categories stay explicit.
The separate retained-revision pilot remains available in its own view.

The default Natural Earth background is local. OpenStreetMap, humanitarian OSM,
USGS Topo and NASA Blue Marble's static August 2004 composite are optional
remote backgrounds, loaded after selection; background changes preserve
the active catalogue. The app serves packaged data without a database, API key
or paid map account. See [catalogues, attribution and coverage](docs/CATALOGS.md).

Core auditing and validation require Python 3.10+ and its standard library:

```text
python scripts/prepare_public_evidence.py restore
python scripts/audit_revisions.py
python -m scripts.validate_evidence
python -m unittest discover -s tests
python scripts/build_catalogs.py --verify-only
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
See the [deliberate deployment workflow](docs/DEPLOYMENT.md) for GitHub Pages.

Project continuity is documented in AGENTS.md and the three selected Markdown files
under contexto/. The manuscript files are available in the repository; the website
serves only `system/dist`. Context, manuscripts, private authoring inputs and historical
SSN-derived observations are excluded from the website. Historical repositories
remain independent and unchanged.
