# Reproducing the local audit

## Author-review interface revision of 8 November 2026

An unversioned entry opens all four packages on Home. Versioned links retain
their explicit selection. Source cards expose active-session verification,
full hashes, original CSV/package JSON formats and downloads. Cache status
describes memory, not a persistent offline database.

The export workspace generates a stored ZIP locally. CSV, JSON and HTML choices
control its payloads; `manifest.json` lists every payload's bytes and SHA-256.
Printable HTML is also previewed in the application. Map extent does not limit
the selected records or exports.

`diagnostics.js` recalculates 36 retained-event endpoint comparisons and selected
primary-lineage plots from `data/revisions.json`, independently of map filters.
Native SVG exports include scope and input hashes. Tests independently parse
the preserved GeoJSON responses.

`python scripts/build_diagnostic_coverage.py --verify-only` reconstructs the
annual summary from the complete, hash-verified 402,082-row SSN CSV. The browser
renders that summary with independent year controls; it is not derived from
the 242,288-row map subset. `python scripts/build_architecture.py` maintains
the SVG shown in Methods. Neither module adds a forecasting claim.

The new manuscript captures document this local author-review revision.
Publication requires fresh authorization. The preceding public deployment
was verified at `1c797dce7f6fe9b28e2015a9de779d9364a39ae5`.

The subsequent local UI revision adds `research-charts.js`; run
`node tests/test_research_charts.cjs` and `node tests/test_catalog_frontend.cjs`
alongside the existing checks. Histograms use width-0.2 bins without rounding the
reported magnitudes. Scatter plots contain every finite documented-kilometre pair
in the chosen exact catalogue/type group; above 3,000 pairs, up to 48 by 28 counted
cells retain all pairs without sampling. The annual series, tables and five
downloads still describe the whole filtered selection. The JSON `display_group`
identifies the graphical focus; the shared URL does not retain that presentation
choice. The report preview and download use one HTML builder. The revised UI is
local and is not yet reflected in the retained author-review Word/PDF.

Core acquisition, auditing and evidence contracts need Python 3.10 or newer and only the standard library. Tests do not need network access or a running database.

```text
python scripts/audit_sources.py --help
python scripts/prepare_public_evidence.py restore
python scripts/audit_revisions.py
python -m scripts.validate_evidence
python -m unittest discover -s tests
python scripts/build_catalogs.py --verify-only
python scripts/build_country_index.py
node tests/test_catalog_composition.cjs
python -m unittest discover -s tests -p test_country_index.py
python -m http.server 8787 --bind 127.0.0.1 --directory system/dist
```

The revision command verifies every raw response against `data/raw/revisions/manifest.json`. It refuses a length or SHA-256 mismatch. `--fetch` is only for the first acquisition and refuses to overwrite an existing manifest. The acquired cohort was selected from the current catalog, not from a complete historical event population.

The bounded original response package is retained under `research-data/comcat/`.
`prepare_public_evidence.py verify` checks all 40 response bodies and the fixed
acquisition-manifest hash. `restore` copies only those verified files to ignored
`data/raw/revisions/` without a network request and refuses to overwrite different
evidence. This restores the exact pilot inputs, rather than refetching a changed
catalogue. No historical SQL or private working documents enter the package.

The source auditor reads the historical SSN-derived SQL only in read mode. Its source directory can be selected with the command-line option shown by `--help`; skip it when those local historical files are unavailable. Generated alternatives for UTC dates are hypotheses, not observed timestamps. No SQL statement or upstream executable is run.

The frozen CSV input is versioned in `data/source_manifest.json`; `--download` obtains missing bytes and verifies their pinned hashes. The historical SQL is not redistributed or required by the revision audit.

## Rebuilding the complete explorer

The committed `system/dist` artifact is ready to serve. The offline
`build_catalogs.py --verify-only` command requires all four named catalogues,
their three providers, the default and legacy selections, eight asset hashes,
manifest/event-byte agreement, row counts, record keys and source-file mappings.
It does not download or rewrite data. The deployment workflow uploads this
committed directory after validation; it does not regenerate or clear it.

After restoring and auditing the revision pilot with the commands above, a fresh
checkout can rebuild the separate CSV diagnostic and complete website data in
this order:

```text
python scripts/audit_sources.py --download --skip-ssn
python scripts/build_system.py
python scripts/build_canada_catalog.py
python scripts/build_ssn_catalog.py
python scripts/build_catalogs.py --download
python scripts/fetch_map_assets.py
python scripts/build_catalogs.py --verify-only
python scripts/build_country_index.py
python scripts/check_links.py --scope artifact
```

`build_system.py` is the existing Mexico/revision data builder; there is no
`build_app.py`. It writes `data/events.json`, `data/manifest.json` and
`data/revisions.json` inside the artifact. It preserves the frontend, extended
map and separately packaged catalogues. Run the revision audit first: otherwise
that builder explicitly packages the pilot as unavailable.

`build_canada_catalog.py` verifies and restores the original open-licensed CSV
from `research-data/catalogs/nrcan-ca/` when no ignored raw copy exists. It
reproduces 6,613 selected records, retaining five repeated source rows and
documenting derived row keys and the unknown depth unit. It writes its catalogue
entry before `build_catalogs.py` assembles the registry. No private acquisition
receipt is required for this preserved public-input path.

`build_catalogs.py --download` retrieves only missing pinned North American
inputs, verifying the upstream Git blob, size and SHA-256; it does not execute
upstream code. The 12 CSVs produce 14,041 earthquake records from 2020–2025.
With raw caches present, omit `--download` for an offline rebuild. The original
24,994-record Mexico snapshot remains separate. The final registry has four
catalogues and three providers; exploratory data do not change the paper's frozen
diagnostic or its revision-pilot claims.

`fetch_map_assets.py` verifies Leaflet and Natural Earth source bytes and
reproduces the extended local background. It preserves original coordinates;
positive Aleutian longitudes are unwrapped only by the map client. Optional
OpenStreetMap, humanitarian OSM, USGS Topo and static NASA Blue Marble
backgrounds are runtime services selected by the
reader; builds do not fetch their tiles. Their coverage and attribution are
documented in [CATALOGS.md](CATALOGS.md).

The local country/combined-view revision adds a sidecar, not a fifth source
catalogue. `build_country_index.py` uses only the standard library, reads the
hash-verified four event packages and pinned local Natural Earth geometry, and
writes `system/dist/data/country-index.json`. The index retains one label per
package row and records the package/geometry hashes; rebuilding it leaves all
eight existing event/manifest hashes unchanged. Regenerate the index after any
intentional change to those inputs. Its point-in-polygon labels represent
coarse terrestrial country/territory containment, not nationality, nearest-place
assignment or offshore/EEZ jurisdiction. Outside, boundary/ambiguous and invalid
coordinate categories remain explicit. See [coverage and limitations](CATALOGS.md).

`system/dist/catalog-composition.js` constructs a browser-local union preserving
all 287,936 source rows and qualifying each key by its catalogue. The 2,163
identical ComCat IDs shared by the USGS packages are flagged on 4,326 rows; they
are not removed, and no fuzzy or cross-provider event matching is inferred.
Tests exercise real-package counts and hashes, source order, key collisions,
unknown fields and units, and source-specific provenance. Run:

```text
node tests/test_catalog_composition.cjs
python -m unittest discover -s tests -p test_country_index.py
node tests/test_view_state.cjs
node tests/test_catalog_frontend.cjs
node tests/test_analytics.cjs
node tests/test_system_labels.cjs
```

For country-filtered or combined views, v4 URLs and `seismic-local-query/4`
record each input's event/manifest hashes plus registry, geometry and country
index hashes. The selected source-record keys are ordered exactly as exported.
Unfiltered single-catalogue v3 views and v1/v2 restoration remain supported.
CSV adds `country_id` to single-source fields; a native SSN CSV therefore has
28 columns without rewriting its original 27-field package. Combined exports
also retain per-row source catalogue, distributor, snapshot, packaged key,
identifier semantics, depth unit and exact-USGS overlap flags. Country and
combined-view behavior is included in the published baseline `49372d0`.

## Browser descriptive results

`system/dist/analytics.js` computes summaries from the same filtered rows used
by the map and record table. Groups retain catalogue identity and exact reported
magnitude types; no scale conversion or cross-provider event reconciliation is
performed. Depth summaries use documented kilometre units. Pearson coefficients
require a known type, at least three valid pairs and nonconstant variables.
Annual counts describe selected source rows, including explicit empty calendar
bins; they do not establish catalogue completeness or absence of earthquakes.

The Analysis view produces record CSV, local-query JSON, summary CSV, analysis
and evidence JSON, and a printable HTML report. The latter retains tables,
filters, input hashes and the full analysis document, without remote scripts.
No occurrence-probability or earthquake-prediction model is implemented.
Run the pure numerical tests and the frontend export/selection checks with:

```text
node tests/test_analytics.cjs
node tests/test_catalog_frontend.cjs
node tests/test_view_state.cjs
node tests/test_system_labels.cjs
```

This source-tree extension requires its own authorized deployment before it is
described as available on the public site. Manuscript screenshots and final
Word/PDF regeneration remain separate from these code checks.

The optional historical SSN diagnostic requires its separately identified
upstream input and is not needed for the explorer, revision analysis or
evidence-contract evaluation. The browser sources are maintained directly in
`system/dist`; none of these data builders compiles or deletes them. Building
the explorer does not rebuild the private manuscript DOCX or PDF.

## Evidence semantics

`scripts/evidence_contract.py` distinguishes captured summaries from conditional retained-lineage projections. A `selected_lineage_count` is not a count of unique physical earthquakes. A producer timestamp is not an authenticated public release time. Supplying current and superseded products does not identify complete past catalog membership or preference.

Synthetic counterexamples and tests are labeled synthetic. They test software semantics and logical possibilities; they do not estimate empirical frequency or validate a past public catalog.

`python -m scripts.validate_evidence` independently ranks retained versions with
SQLite window functions and applies SQL predicates after version selection.
It checks the original 36 details at 472 event-specific retained boundaries and
ten queries (4,720 comparisons). Eight generated histories supply 24 additional
query cases with known synthetic public replay. Reports under ignored
`outputs/validation/` record original-byte hashes separately from generated
fixtures and explicitly preserve product-lineage versus public-event units.
Zero projection disagreements do not authenticate public availability or make
the histories complete. The illustrative policies are not implementations of
libcomcat, Timeline or the INGV service.

## Figures and manuscript

The expanded manuscript distinguishes four source catalogues from the original
36-event revision pilot. Its catalogue table is recalculated from the packaged
sources; adding a catalogue does not expand the revision-validation cohort.
The final interface includes three palettes and system/light/dark appearance,
removable filter indicators, record focus and an expanded map. See
[interface behavior and inspection examples](UI_FEATURES.md). Appearance and
map navigation do not change the scientific query; removing a filter does.

The current ten-figure manuscript uses the in-application architecture SVG
(`python scripts/build_architecture.py`) and genuine browser captures. Preserved
capture receipts identify view URLs, source images, crop rectangles and SHA-256
values. Four regional panels use distinct, explicitly labelled selections and a
common light theme and background; they do not represent a synchronized or
independent earthquake population. Capture only after the view and map have
finished rendering. Verify the actual image, not only its DOM metadata.

The revision workspace computes endpoint and lineage SVGs in JavaScript.
`build_diagnostic_coverage.py` separately verifies the full SSN CSV and prepares
its annual summary. The browser renders four count series and annual maxima
with common year controls. Sixteen years without source rows remain gaps;
2026 is partial. Tied annual maxima remain provenance, not independent years.
No fitted return period, scale conversion or completeness threshold is inferred.

Earlier Matplotlib figure generators remain as offline audit tools; their
outputs are not the current interface figures. Do not overwrite current capture
assets with that older pipeline. PNG DPI metadata does not add native detail.

`paper/figures/manuscript_figures.json` fixes the ten image paths and SHA-256
values. The DOCX builder requires one numbered caption and inline anchor per
image, rejects missing/repeated/out-of-order anchors, and preserves 17 unrelated
template parts byte for byte. The four editable tables have three horizontal
rules, aligned numerical cells and monospace logical/event identifiers. Short
tables are kept together, with their notes. Native Word Standard-quality PDF
export, complete text matching and every-page visual review precede replacement
of the final pair. Source, template, captures and intermediate evidence remain
private in the authoring copy; the two final manuscript files are tracked.

AI assistance in implementation and plotting code is declared in the manuscript
Methods and general declaration, including the tool and session dates. The declarations follow the [Elsevier journal AI
policy updated June 2026](https://www.elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals),
checked on 6 November 2026. Reproducible plotting and genuine captures remain
distinct from fabricated observations or generative image synthesis. No
coauthor review or editorial approval is inferred from software or layout QA.

The author-review manuscript source is local in `paper/drafts/manuscript.md`. The retained journal template and its checksum are in `paper/templates/`. `scripts/build_manuscript.py` patches a copy, preserving every unrelated package part byte-for-byte. It requires a template-distillation contract under ignored `tmp/template-contract/` and writes review artifacts to ignored `outputs/paper/`. The source, template and builder must be preserved together for regeneration. The template itself is never overwritten.

The Word/PDF render-and-review stage is separate from content generation. A generated DOCX is not visually verified until every rendered page has been inspected. This Windows environment does not bundle LibreOffice; Word-native export is used when available. No editorial submission, payment, author approval or public archival release is implied by building these files.

The delivery directory `outputs/paper/` contains only the final manuscript DOCX
and its matching PDF. Earlier versions and visual-review intermediates have
been archived separately under ignored `outputs/archive/`. The manuscript
builder writes highlights and its build report to `outputs/paper-support/`,
so regenerating support files does not clutter the delivery directory.

Manuscript drafts, generated figures and the downloaded template DOCX are local
authoring artifacts, excluded from Git. Template provenance and the authoring
scripts remain portable. Reproducing the private manuscript therefore also
requires its maintained source, the original template matching the recorded hash
and the local template-distillation contract. A code checkout does not claim to
contain unpublished manuscript material.

## Scope of interpretation

The regional rectangle is latitude 14–33 and longitude −118–−86 degrees. It includes offshore areas and neighboring countries. Different reported magnitude types are not equated. Missing uncertainty is unknown, never zero. Differences between retained solutions are not accuracy errors or demonstrated improvements. The current-selected 36-event pilot does not estimate historical threshold migration, completeness, damage or earthquake probability.
