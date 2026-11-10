# Reproducing the local audit

## Local revision after the verified 10 November 2026 publication

The public baseline verified on 10 November 2026 is
`92d07a954e8b1209b311d9ee56c815ab72f92899`. It includes Simple view, the initial
single-catalogue Historical Top 10, Historical proximity and Help/about, alongside
compressed loading, browser SQL, administrative/plate context and comparison.
The automatic four-catalogue Top 10 described below is a subsequent local
revision. It requires its own completed review and authorized publication;
code checks alone do not deploy it.

The baseline defaults to English, offers Spanish and provides twelve
workspaces: Home, Catalogue, Sources, Analysis, Revisions, Evidence/methods,
SQL, country comparison and the four regional-access tools. The four input packages still contain 287,936 source
rows; these changes add no seismic observations or revision-pilot events.
The source records, original event/manifest hashes and 36-event pilot are intact.

An unversioned entry opens all four packages on Home. Versioned links retain
their explicit selection. Source cards expose active-session verification,
full hashes, original CSV/package JSON formats and downloads. Cache status
describes memory, not a persistent offline database.

Home connects four real input selectors and the explicit combined choice to the
shared interactive catalogue map and existing result/export actions. Its CSV,
query JSON, ZIP and report actions use the active selection rather than an
illustrative workflow. Source cards describe scientific purpose, available
measurements, source-specific adaptation and limits; their technical inventory,
normalization rules and checksum details remain expandable. Neither source
selection nor a card's regional name substitutes for a geographic predicate.

The export workspace generates a stored ZIP locally. CSV, JSON and HTML choices
control its payloads; `manifest.json` lists every payload's bytes and SHA-256.
Printable HTML is also previewed in the application. Map extent does not limit
the selected records or exports.

`diagnostics.js` recalculates 36 retained-event endpoint comparisons and selected
primary-lineage plots from `data/revisions.json`, independently of map filters.
Native SVG exports include scope and input hashes. Tests independently parse
the preserved GeoJSON responses.

`revision-story.js` adds a practical reading of that same retained evidence:
earliest/latest primary-origin cards, reported parameter differences, a switch
between retained endpoints for the exact-type threshold query, and discrete
update cards. The threshold model keeps the same comparable literal-type
lineages; switching endpoints changes set membership, not catalogue acquisition.
Update-card spacing denotes order, not elapsed time. These displays do not rank
accuracy or reconstruct public preference, first issuance or historical catalogue
membership. Existing diagnostic plots remain available.

`python scripts/build_diagnostic_coverage.py --verify-only` reconstructs the
annual summary from the complete, hash-verified 402,082-row SSN CSV. The browser
renders that summary with independent year controls; it is not derived from
the 242,288-row map subset. `python scripts/build_architecture.py` maintains
the SVG shown in Methods. Neither module adds a forecasting claim.

The author-review Word/PDF pair must match the particular local build being
reviewed. Genuine new captures, matching tables and complete document verification
precede its replacement; code checks alone do not validate that pair. Publication
requires fresh authorization.

The baseline includes `research-charts.js`; run
`node tests/test_research_charts.cjs` and `node tests/test_catalog_frontend.cjs`
alongside the existing checks. Histograms use width-0.2 bins without rounding the
reported magnitudes. Scatter plots contain every finite documented-kilometre pair
in the chosen exact catalogue/type group; above 3,000 pairs, up to 48 by 28 counted
cells retain all pairs without sampling. The annual series, tables and five
downloads still describe the whole filtered selection. The JSON `display_group`
identifies the graphical focus; the shared URL does not retain that presentation
choice. The report preview and download use one HTML builder.

Core acquisition, auditing and evidence contracts need Python 3.10 or newer and
only the standard library. The browser-equivalence oracle tests also launch
Node.js and the bundled sql.js assets. Tests do not require network access or a
database server; rebuilding pinned source derivatives can require the explicitly
documented source download.

```text
python scripts/audit_sources.py --help
python scripts/prepare_public_evidence.py restore
python scripts/audit_revisions.py
python -m scripts.validate_evidence
python -m unittest discover -s tests
python scripts/build_catalogs.py --verify-only
python scripts/build_country_index.py
python scripts/build_transport_assets.py --verify-only
node tests/test_catalog_composition.cjs
node tests/test_revision_story.cjs
node tests/test_source_workbench.cjs
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

## Simplified access and historical tools in the local revision

`quick-start.js` and `history-explorer.js`, with their local styles, add no data
acquisition or catalogue. Their inputs are the same four hash-verified packages:

| Package | Archived coverage | Selected source rows |
| --- | --- | ---: |
| `usgs-na-2020-2025` | North American footprint, 2020–2025 | 14,041 |
| `usgs-mx-historical` | Mexico-region frozen paper snapshot, nominal 1900–2026 window | 24,994 |
| `nrcan-ca-historical` | Canada and surroundings, observed 1985–2019 | 6,613 |
| `ssn-mx-historical` | Direct SSN, observed 1900–6 November 2026; partial 2026 | 242,288 |

These windows are not completeness guarantees. In particular, the North American
package is a six-calendar-year archive, not a complete twentieth-century record
of Canada or the USA. All packages retain the original M >= 3.5 cartographic
selection. No new offshore nationality, official SSN/NRCan identifier or missing
magnitude type is inferred.

Simple view validates a source-specific selection and delegates its execution to
the existing catalogue loader and filter engine. A complete-footprint selection
includes unassigned/offshore rows; a country and optional recorded subdivision
apply the same existing terrestrial classes. The same filtered records feed the
shared map, `SeismicAnalytics`, and the existing CSV, analysis/query JSON, ZIP and
HTML report builders. An optional literal-type choice narrows the selection;
otherwise descriptive summaries retain separate exact-type groups. A report's
PDF option is the browser print/save dialogue, not a new PDF backend. Moving to
the full workspace keeps the applied source and predicates. Draft criteria must
be submitted before replacing the result or generating an export.

The Top 10 interface now loads all four available catalogues automatically,
starts with their full archived footprint and recomputes after country/state
changes. Source catalogue, literal type and inclusive UTC years are advanced
options. No update button is needed. A failed package prevents a partial result
from being presented as a complete four-catalogue result; verified session data
are reused without modifying source arrays.

`SeismicHistoryExplorer.computeCombinedTop(datasets, filters)` emits
`seismic-combined-reported-top10/1`. Its default `catalogueId: all`,
`magType: __all__` preserves all reported numerical magnitudes and literal types.
These heterogeneous values are neither converted nor presented as a homogeneous
Mw ranking. Each ranked row includes catalogue/provider, original or derived key,
reported type and all grouped provenance alternatives. Identical original USGS
IDs across the two USGS packages are the only grouped identities. SSN and NRCan
keys, and possible cross-agency observations of one earthquake, stay separate.

USGS identity resolution precedes year/type/geographic predicates and ranking.
Only if both source rows have valid explicit UTC `updated` values is the newer
update selected. Otherwise, and on ties, fixed priority is USGS North America
before USGS Mexico. The largest magnitude never selects the representative.
Calendar-valid UTC whole seconds are compared chronologically; fractional
seconds are compared as exact decimals, so `.0009Z` follows `.0001Z` and `.100Z`
follows the same whole second without a fraction. No millisecond truncation
creates a false tie. The Python oracle uses native datetime seconds and Decimal
fractions independently of JavaScript's zero-padded fraction strings.
All alternate magnitudes/types, coordinates, dates, updates and source hashes
remain in JSON and provenance rows of the 17-column combined CSV. This is
reproducible record selection, not a measurement-accuracy assessment.

The complete overview retains 287,936 original rows and groups 2,163 identical
USGS IDs into 285,773 candidate records. The four-source Guerrero terrestrial
selection has 23,391 candidates; advanced SSN/unknown-type selection retains the
original 21,167. These counts do not establish independent physical earthquakes.
Available periods differ: North America 2020–2025, Mexico-region USGS and direct
SSN 1900–2026 partial, NRCan 1985–2019. Full footprint retains archived offshore
rows but cannot add missing historical events such as Alaska1964.

The retained `catalogs.json.selection_rule` text describes the legacy
single-catalogue mode and is outdated as a description of current operation;
it does not execute a predicate or prohibit combined views. Current query/result
schemas and their explicit selection rules define
composition and the combined Top 10. Registry bytes and their geographic pins
are preserved, rather than rewriting scientific provenance for that old label.
Preserving those input bytes does not freeze the interface: the current code
loads four datasets, and combined results enumerate their four input evidences.
The legacy text is not a second operational selection contract.

The compatible `SeismicHistoryExplorer.computeTop(data, filters)` still emits
`seismic-historical-top10/1`. It accepts a single catalogue, inclusive UTC-year
bounds, one exact case-sensitive magnitude type, and a geographic scope. The
explicit `__missing__` group retains an absent/empty source magnitude type as
unknown; it is not a converted Mw scale. `NA` selects the union of terrestrial
`MEX`, `CAN` and `USA`; country and recorded admin-1 choices are narrower. The
separate `footprint` option retains the catalogue's offshore and other land
classes. The stable ordering is reported magnitude descending, UTC time ascending
and source key ascending, with a maximum of ten rows rather than inclusion of
every boundary tie. Filters, ranking rule, ordered source keys, geographic
evidence and package hashes travel with CSV and JSON.

`SeismicHistoryExplorer.computeRecurrence(data, filters)` emits
`seismic-historical-proximity/1`. Despite its internal function name, the product
is descriptive historical proximity. It selects one catalogue/type, inclusive
UTC years and reported magnitude >= the selected threshold (default 7; selectable
7–9). For each unordered pair of distinct retained source keys it computes
great-circle haversine distance on a sphere of radius 6,371.0088 km. Pairs are
included at distance <= 25, 50, 100 or 200 km, with 100 km the default. The
pair and nearby-context predicates apply `distance <= threshold + 1e-9 km`
before display rounding. This absolute one-micrometre tolerance is exported as
`rule.numeric_tolerance_km` for floating-point stability; it is not geographic or
epicentral uncertainty. The calculation handles the antimeridian; missing/invalid coordinates are not paired.
Source keys are checked for ambiguity rather than silently creating extra pairs.
No transitive grouping, declustering or temporal independence is inferred.

Optional nearby context is a separate, fixed 100 km operation. It measures the
minimum spherical distance from an unassigned/offshore point to finite minor
great-circle arcs of the selected generalized Natural Earth country/admin-1
boundary. Contextual rows retain their original classes and receive an explicit
selection basis and distance; existing land assigned to another country or
subdivision is not annexed. This geometric context is not jurisdiction, shoreline
accuracy or rupture extent. It does not alter ordinary country-index labels.

The pair result preserves all located selected records, every accepted direct
pair, distances, geographic selection/exclusion counts, original identifiers or
derived-key semantics, documented-kilometre depths, input hashes and method limits.
Unknown Canadian depth remains null. Maps reuse the main map's continuous display
transform on copies and do not change the coordinates used by the oracle or
exports. Changing draft criteria invalidates downloads until recalculation.
No recurrence rate, repeating rupture, fault mechanism, hazard, exposure, seismic
risk or earthquake probability is produced; an empty result does not mean safety.

Help/about in `quick-start.js` separates interface version `2026.11.10` from source
observation dates, provides twelve searchable ES/EN questions, human author and
academic contact information, and distinguishes the MIT code licence from data
and component licences. It introduces no external analytical service, Docker
container or database backend.

Run the two new local JavaScript suites from the repository root:

```text
node tests/test_quick_start.cjs
node tests/test_history_explorer.cjs
```

They cover selection/type/coverage boundaries, help content, real-package Top 10
ordering and pair membership, direct versus transitive links, finite-boundary
distances, antimeridian display copies, unknown values and complete evidence
exports. The maintained standard-library Python oracle is
`scripts/audit_historical_views.py`. It evaluates 31 cases: the original 23
(15 real-package selections and eight synthetic boundary/logic cases), plus
four real combined selections and four synthetic representative/UTC-order cases.
It independently calculates
raw-row selections, Top 10 order, haversine pairs and three-dimensional finite-arc
context distances; it also compares all 17 CSV columns, unknown depths,
derived-key semantics and unchanged input hashes. Combined checks additionally
verify exact-ID grouping, representative resolution before filters and complete
alternative provenance. All 31 cases agreed with the
JavaScript outputs in the recorded validation.

Run it on Linux or another host with Python and Node.js installed:

```text
python scripts/audit_historical_views.py --node node
```

`--node` accepts an executable name or explicit path and otherwise defaults to
`node` on PATH. No Windows runtime path is embedded. `--output-dir` overrides the
default private directory `outputs/validation/historical_tools`; relative output
paths resolve against the repository root. The JSON report
`oracle_historical_views.json` identifies inputs, checks and the declared
1e-9 km numerical boundary tolerance. It does not rewrite scientific inputs.
Genuine browser captures and complete Word/PDF review are additional gates,
not consequences of a passing code suite. No publication is implied here.

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
python scripts/build_diagnostic_coverage.py
python scripts/build_admin1_index.py --download
python scripts/build_tectonic_assets.py --download
python scripts/build_transport_assets.py
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

The country/combined-view implementation adds a sidecar, not a fifth source
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
28 columns before the optional subdivision layer loads. Once loaded, `admin1_id`
is also derived for export, without rewriting the original 27-field package.
Combined exports
also retain per-row source catalogue, distributor, snapshot, packaged key,
identifier semantics, depth unit and exact-USGS overlap flags. Country and
combined-view behavior is included in the published baseline `b503c22`.

## Verified static transport

`python scripts/build_transport_assets.py` creates deterministic gzip companions
for structured JSON/GeoJSON in `system/dist/data` and writes
`data/transport-manifest.json`. Gzip uses level 9, an empty stored filename,
mtime 0 and OS 255. Source bytes and their existing scientific hashes remain
unchanged. The transport manifest records both representations' lengths and
SHA-256 values; run this builder after intentional catalogue, geometry or summary
changes. `--verify-only` recompresses in memory and checks the preserved artifact
without rewriting it.

`asset-loader.js` verifies compressed bytes before decompression and original
bytes before parsing, reports stage/byte progress and yields between stages.
Network and HTTP 5xx failures permit at most two retries. Uncompressed JSON is
used when DecompressionStream is unavailable or a gzip companion returns
404/415. Invalid lengths, hashes or decompression fail explicitly; integrity
errors do not trigger a silent fallback. A transport manifest fixes expected
bytes, not the authenticity of its host. Loaded packages are cached in session
memory. No service worker or persistent offline cache is claimed.

```text
python scripts/build_transport_assets.py --verify-only
python -m unittest discover -s tests -p test_transport_assets.py
node tests/test_asset_loader.cjs
```

## Administrative and tectonic context

`python scripts/build_admin1_index.py --download` obtains the pinned Natural
Earth 1:10 million Admin 1 input, checking source length/SHA-256 before building
`admin1.geojson`, `admin1-index.json` and `admin1-manifest.json`. The source is
public domain; the manifest retains official documentation, version and commit.
The retained 743 first-order units cover the same 47 country classes as the
unchanged 1:50 million country index. They are not uniformly states: Mexico has
32 named entities and a separate source unnamed minor-island unit.

The documented generalization preserves every source polygon/island/hole;
polygons containing holes retain their vertices. Closed-ring simplification
uses a 0.01-degree tolerance with collapsed/orientation-changing rings falling
back to original vertices. Shared-edge topology is not asserted. Classification
is conditional on the existing country label. Edge/overlap, outside, invalid and
unavailable results remain explicit; neither locality text nor nearest-region
assignment fills a gap. These generalized de facto classes do not establish
authoritative jurisdiction, positional uncertainty or offshore nationality.
`--verify-only` requires the pinned source cache and rebuilds and compares assets locally.
The packaged index binds geometry, registry, country index, event hashes and row
order without changing source observations.

A country click opens a confirmation. Applying a subdivision updates the
scientific selection and uses v5 URLs / `seismic-local-query/5` with both
geographic layers' hashes. Ordinary country/combined v4, unfiltered single-source
v3 and legacy v1/v2 behavior remain supported. Loading a layer alone is not a
subdivision filter. Stale or incompatible geographic evidence is rejected.
Native SSN and Mexico-region views can automatically show Mexico's 33 source
units as a context layer. This retains the 32 named entities and source
minor-island unit, without silently selecting only terrestrial Mexican rows.
Offshore observations remain preserved; only an explicit country/subdivision
predicate changes their selection.

`python scripts/build_tectonic_assets.py --download` verifies pinned source
files from fraxen/tectonicplates commit
`339b0c56563c118307b1f4542703047f5f698fae`. It concatenates PB2002 plate and
boundary features without changing original geometry or properties, adding
stable identifiers and aliases. The result contains 54 plate features for 52
plate codes and 241 boundary lines. There are 65 literal source `subduction`
types and 176 unknown types; no additional class is inferred.

PB2002 is Peter Bird's static 2003 model, DOI 10.1029/2001GC000252. The GeoJSON
conversion credits Hugo Ahlenius/Nordpil and contributors under ODC-BY 1.0,
preserved in `tectonic-plates-LICENSE.txt` and the manifest. The layer supplies
geological context rather than active-fault monitoring, event-to-plate assignment,
mechanisms or hazard. Enabling it does not change query records. Its
`--verify-only` checks packaged integrity offline; with source cache present it
also reproduces and compares the assets. Run transport packaging last.

```text
python scripts/build_admin1_index.py --verify-only
python scripts/build_tectonic_assets.py --verify-only
python -m unittest discover -s tests -p test_admin1_index.py
python -m unittest discover -s tests -p test_tectonic_assets.py
node tests/test_view_state.cjs
```

## Screen-space count heatmap

`SeismicMapHeat` in `map.js` uses equal weight 1 for every selected epicentre
centre inside the current viewport, without sampling or magnitude weighting.
An 8-CSS-pixel grid accumulates the raw visible-row counts. A separable Gaussian
kernel has radius 32 CSS pixels and sigma 12 CSS pixels; its edge support is
clipped by the viewport. Colour intensity is `log1p(smoothed cell weight)` divided
by `log1p(current viewport maximum)`, not a globally fixed or geographic scale.
Zero cells remain transparent. Raw-grid count conservation is checked before
smoothing; smoothed edge mass is not claimed to be conserved.

Pan, zoom and viewport size therefore change this visual count surface and its
relative colour scale while leaving the selected records and CSV unchanged.
`query.cartography` and analysis cartography evidence retain the display method,
parameters, visible-row count and viewport separately from selection evidence.
It is not magnitude energy, density per square kilometre, completeness, hazard
or an earthquake-probability estimate. The point view remains available for
individual-record inspection.

```text
node tests/test_map_basemaps.cjs
```

## Optional SQL inside the browser

`sql-explorer.js` and `sql-worker.js` use locally bundled sql.js 1.13.0, SQLite
compiled to WebAssembly. `vendor/sqljs/provenance.json` fixes package/file hashes
and upstream version; MIT and SQLite public-domain notices remain alongside it.
There is no Docker, backend SQL service or persistent application database.
The first SQL execution creates the Worker and builds in-memory `records` and
`catalogs` from the current verified selection, not an imported SQL dump.

The interface opens with guided questions: summarize one exact catalogue/type
group, follow its annual counts, group it by country/subdivision, or inspect its
source records. Entering the SQL workspace can run the default summary; Worker
creation remains lazy until that actual execution. Guided answers use the same
read-only engine as the expandable advanced editor, not a separate numerical
implementation. Cards show count, reported-M mean and observed range, and mean
kilometre depth with valid/NULL counts. The magnitude band spans the observed
minimum/maximum; its marker is the mean, not a distribution or uncertainty band.
The schema, SQL statement, exact table and input evidence remain inspectable.

Guided queries keep exact, case-sensitive type strings, including distinct NULL
and empty-literal groups. Their annual series fills internal zero-row bins only
between the group's first and last represented UTC years; zero is not a claim
that no physical earthquakes occurred. Unknown subdivision classes remain
explicit and are not inferred from place text. Generated SQL and the guided
scope are retained in the evidence JSON. Guided record inspection uses the same
5,000-row cap and truncation notice as advanced SQL.

Rows preserve catalogue-qualified keys, original-versus-derived identifier kinds,
literal magnitude types, documented-kilometre depth or null, country/admin-1
classes and available raw fields. `original_fields` retains supplied raw/source
metadata as JSON rather than duplicating all package fields; unavailable raw
fields remain null. The source package/manifests remain the complete frozen
input. SQL changes neither source arrays nor map filters. New filters invalidate
old SQL results and require a new selection snapshot.

One SELECT/WITH statement is accepted after quote/comment-aware validation.
SQLite query-only mode, a bounded result wrapper, Worker cancellation and timeout
provide additional execution controls. The result cap is 5,000 returned rows,
with explicit truncation; 50-row display pages do not change downloads. Aggregate
queries operate on the whole imported selection. CSV contains returned values
(null becomes an empty field); JSON preserves null/types, SQL, selected keys,
input hashes and limits. Device memory still constrains large selections.

The Python SQLite oracle and browser engine share SQLite; they are not presented
as independently invented database engines. Separate raw-row predicates and
Python statistics check selection, order, nulls, metadata joins, the 659-record
`mww` case, country counts and other groups. Controller tests exercise lazy
loading, cancellation, timeout and replacement of stale snapshots. These tests
do not establish arbitrary-query performance or immunity to all resource limits.

```text
node tests/test_sql_explorer.cjs
node tests/test_sql_guided.cjs
python -m unittest discover -s tests -p test_sql_oracle.py
```

## Common-filter country comparison

`country-comparison.js` reads only the fixed USGS North America 2020–2025
catalogue. It does not change map filters or compare the longer SSN/NRCan
windows as interchangeable populations. Two distinct CAN/MEX/USA land classes
share UTC start/end years, a reported magnitude threshold and one exact known
magnitude type. The default 2020–2025, M ≥ 4.5, `mww` selection yields 15 Canadian
and 53 Mexican records.

Two country panels present count, observed range, median, magnitude mean/sample
standard deviation and documented-kilometre depth mean with its valid count.
A bilateral magnitude display uses raw counts in the same width-0.25 bins for
both countries, with left-inclusive/right-exclusive intervals. Bin edges and
counts are retained in JSON; no smoothing, probability or rate normalization is
applied. An annual line-and-point display retains the common calendar years,
including explicit zero-selected-row values. Its connecting lines aid reading
of discrete annual counts, not interpolation of seismic occurrence. Exact annual
and distribution tables are expandable. CSV/JSON contain filters, source and
geography hashes, summaries and ordered identifiers. Offshore, boundary/invalid
and other country classes are excluded. Counts are not completeness-adjusted
rates, physical absence, area-normalized activity or relative hazard. Independent
Python predicates/statistics check exact selected IDs and annual bins. No
occurrence forecast or national-population independence is inferred.

```text
node tests/test_country_comparison.cjs
python -m unittest discover -s tests -p test_country_comparison_oracle.py
```

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

The descriptive workspace is part of public baseline `b503c22`. The four new local
tools described above require their own authorized deployment. Manuscript
capture and Word/PDF verification remain separate from code checks.

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

The preceding ten-figure manuscript uses the in-application architecture SVG
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

The `b503c22` manuscript has thirteen figures, including genuine SQL,
administrative/plate-interface and common-filter country-comparison captures.
The four local regional-access tools require corresponding genuine captures and
method descriptions where appropriate. Do not substitute mock-ups for actual
interface states or attribute unreleased tools to that baseline. Capture receipts
must identify the evaluated local revision; publication status must match the
actual release after authorization.

`paper/figures/manuscript_figures.json` fixes image paths and SHA-256 values.
The DOCX builder requires one numbered caption and inline anchor per
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

Preserved CSV/JSON/GeoJSON, documented schemas, local dependencies, standard
exports and reproducible builders allow migration to another static host or
local HTTP service. This supports portability without guaranteeing future
browser compatibility, twenty-year availability or continued GitHub hosting.
Remote tiles can fail independently; local cartography remains available.

The regional rectangle is latitude 14–33 and longitude −118–−86 degrees. It includes offshore areas and neighboring countries. Different reported magnitude types are not equated. Missing uncertainty is unknown, never zero. Differences between retained solutions are not accuracy errors or demonstrated improvements. The current-selected 36-event pilot does not estimate historical threshold migration, completeness, damage or earthquake probability.
