# Seismic Data Observatory

Buildless, browser-local explorer with four individually selectable catalogues
from three providers: USGS North America (2020–2025), the frozen USGS
Mexico paper snapshot, NRCan Canada and surroundings (1985–2019), and the
native SSN download (1900–6 November 2026, partial year; M≥3.5). Text
search, provider/catalogue selectors and scientific filters operate on the
selected catalogue or an explicit combined view. The verified public baseline
is `590f6e79ad6d5d78d70e286ab0c60bd4e856fdce` (8 November 2026).
This local revision adds compressed transport, guided browser queries,
administrative selection, tectonic context, count heatmaps, a functional Home
workspace and descriptive country comparison; those additions await
authorized publication. Records retain their source and are not counted as
independent physical earthquakes. Retained origin-product revisions remain a
separate 36-event pilot. This is a research audit interface, not a forecasting
or operational alert service.

Unversioned entry opens Home with all four catalogues and their 287,936 source
rows on the map, with English as the default and Spanish available. Eight
workspaces connect Home, Catalogue, Sources, Analysis, Revisions,
Evidence/methods, SQL and country comparison. Home is a working source-to-output
pipeline: four input buttons and an explicit combined choice control the live
catalogue map, while adjacent actions open results, export the selected CSV/query
JSON/ZIP, preview the printable report, or enter guided SQL and comparison.
These controls reuse the existing selection and export functions; the Home map
is the same interactive map used by Catalogue. Versioned links retain their
explicit selection. Sources provides
the stored catalogue inventory, selection/coverage, units, identifiers, package
links and SHA-256 values. Analysis derives results from the active selection:
reported magnitude summaries by catalogue and exact type, documented-km depth
summaries, annual source-row counts and conditional descriptive Pearson
associations. Unknown types and undocumented units remain explicit; no magnitude
conversion or cross-provider event reconciliation is inferred.

Source cards explain each package's scientific purpose, adaptation contract,
coverage and interpretation limits before its evidence details. The technical
inventory and source-specific normalization rules remain available below them.
Package selection, data distributor, geographic class and background are
different choices; a source-card title does not assign event nationality.

Five actions produce filtered-record CSV, local-query JSON, statistical-summary
CSV, analysis and evidence JSON, and a printable HTML report. The report preserves
tables, filters and input hashes; it can be opened and printed in a browser.
A selectable stored ZIP bundles outputs and a payload-hash manifest. The inline
HTML preview can be printed. The revision pilot draws native endpoint and lineage
SVGs from retained US origin products. Historical SSN coverage renders a verified
offline summary of the complete 402,082-row CSV with independent year controls.
These modules do not use map filters or imply earthquake probabilities.

Serve the buildless artifact locally. From the repository root run:

```text
python scripts/build_catalogs.py --verify-only
python scripts/build_country_index.py --verify-only
python scripts/build_diagnostic_coverage.py --verify-only
python scripts/build_tectonic_assets.py --verify-only
python scripts/build_transport_assets.py --verify-only
node tests/test_analytics.cjs
node tests/test_catalog_frontend.cjs
node tests/test_asset_loader.cjs
node tests/test_sql_explorer.cjs
node tests/test_sql_guided.cjs
node tests/test_country_comparison.cjs
node tests/test_revision_story.cjs
node tests/test_source_workbench.cjs
python -m http.server 8787 --bind 127.0.0.1 --directory system/dist
```

Open http://127.0.0.1:8787. No Python, Docker or database server is needed on the
deployed host. The app reads packaged JSON, with verified gzip transport where
supported, and performs filters and exports locally. The optional SQL workspace
uses a temporary SQLite database only in browser memory. Public build assets
exclude context, drafts, author contact details and the historical SSN warehouse.

`asset-loader.js` verifies compressed length/SHA-256 before decompression and
original length/SHA-256 before parsing. Progress reports transfer, verification,
decompression and parsing. At most two retries address network or HTTP 5xx
failures. If gzip is unsupported or the companion returns 404/415, the original
JSON is verified and used; integrity failures stop loading. Cached packages live
in session memory, not a service-worker cache or persistent offline database.

Each catalogue has its own manifest and SHA-256 values in
`dist/data/catalogs.json`. Unknown measurements remain unknown; the Canadian
source's undocumented depth unit is not interpreted as kilometres. Version-1
shared URLs retain the original Mexico snapshot. New shared views and local
query specifications identify the selected catalogue and input hashes.

Country/territory selection uses a hash-bound sidecar over the 47 local Natural
Earth land features, independently of distributor or background. Outside
(including sea/unrepresented land), boundary/ambiguous and invalid-coordinate
categories stay explicit. This generalized terrestrial overlay does not assign
nationality, territorial waters or EEZs, and never assigns offshore records to
the nearest country. Its source coordinates and original catalogue bytes remain
unchanged.

The combined view retains all 287,936 source rows from the four catalogues.
The two USGS packages share 2,163 exact ComCat IDs; the corresponding 4,326 rows
are flagged and retained. No fuzzy deduplication or cross-provider event identity
is inferred. Each composite key (`catalogue-id~packaged-key`) resolves to its
own original manifest and source links. CSV exposes per-row catalogue,
distributor, snapshot, packaged key, identifier semantics, depth unit,
`country_id` and exact-USGS overlap flags; absent fields remain unknown.
`source_event_id` is a packaged key, not a recovered official SSN/NRCan event ID.
Single-source CSV adds `country_id` and, when the subdivision layer has loaded,
`admin1_id`; the original package fields and bytes remain unchanged.
Country-filtered and combined views use v4 URLs and
`seismic-local-query/4`, including all source event/manifest hashes and the
registry/geometry/index hashes. Unfiltered single-catalogue v3 views and legacy
v1/v2 links remain supported.

Country clicks open a confirmation before applying the selection. A separate
Natural Earth 1:10 million index supplies 743 retained first-order units across
the same 47 country classes; these units are not all states. Its manifest fixes
the source version, generalization and hashes. Assignment is conditional on the
unchanged country label, without place-text or nearest-subdivision matching.
Outside, boundary/overlap, invalid and unavailable cases remain explicit.
Subdivision-filtered views use v5 URLs and `seismic-local-query/5`, binding both
country and subdivision geometry/index evidence. Generalized de facto geometry
does not establish authoritative current jurisdiction or location uncertainty.
For native SSN and the Mexico-region snapshot, the map can draw Mexico's 33
source units as context: 32 named entities plus the source minor-island unit.
Drawing these outlines alone does not apply a Mexico land filter. Offshore and
unassigned observations remain in the selection unless an explicit geographic
filter excludes them.

SQL creates `records` and `catalogs` from the current verified map selection in
an isolated Web Worker using bundled sql.js 1.13.0. It preserves source row keys,
exact magnitude types, nullable documented-kilometre depths, geographic classes
and available raw fields. One read-only SELECT/WITH statement is allowed;
query-only mode, cancellation and a worker timeout add execution controls.
Results have an explicit 5,000-row cap and 50-row display pages. CSV exports
returned values; JSON also preserves SQL, filters, hashes, selection keys and
truncation. Editing filters invalidates stale SQL results. SQL never changes
the map query or imports the historical SSN SQL warehouse.

The SQL workspace starts with questions rather than a code editor: summarize
the selection, count by UTC year, group by country/subdivision, or inspect source
rows. Each guided answer retains one exact catalogue and literal magnitude type;
the chosen group and generated SQL accompany its evidence. Summary cards display
source-row count, mean and observed range of reported magnitude, and mean depth
with its valid-kilometre count and explicit NULL count. The range marker is the
mean, not a fitted distribution or uncertainty interval. Internal annual zero
bins describe selected rows between the group's first and last represented
years, not an absence of physical events. The exact result table, advanced SQL
editor and complete schema remain expandable. Guided and advanced execution use
the same Worker, result cap, cancellation, timeout and downloads.

Country comparison reads the fixed USGS North America 2020–2025 package without
changing the map query. CAN/MEX/USA selections share UTC years, threshold and
one exact magnitude type. The default 2020–2025, M ≥ 4.5, `mww` selection gives
15 Canadian and 53 Mexican land-class rows. Two country panels expose counts,
observed ranges, medians and descriptive statistics with valid measurement
counts. A bilateral magnitude distribution uses common width-0.25 bins,
left-inclusive/right-exclusive, with raw counts rather than normalized rates.
An annual line-and-point display retains every common calendar year and explicit
zero-selected-row values. Exact tables and evidence are expandable; CSV/JSON
retain hashes and ordered IDs, and JSON records the common bin edges/counts.
Offshore/unassigned
records are excluded. Unevaluated completeness and unequal land areas prevent
interpreting these selected-row counts as relative hazard or physical rates.

The revision pilot also offers a practical retained-evidence view: inspect one
event's earliest/latest retained primary origins, compare their reported values,
switch the retained endpoint used by an exact-type threshold query, and read
discrete product-update cards. Card spacing is ordinal, not elapsed time; later
retained values are not ranked as more accurate. Native diagnostic plots remain
available alongside these scoped explanations. No past public catalogue or
preferred-origin history is reconstructed.

For a complete data rebuild follow the ordered commands in the
[reproduction guide](../docs/REPRODUCIBILITY.md). The existing
`scripts/build_system.py` packages Mexico and the separate revision pilot;
`build_canada_catalog.py` packages the preserved Canadian CSV;
`build_ssn_catalog.py` packages the preserved official SSN CSV;
`build_catalogs.py` packages North America and assembles the four-catalogue
registry. These data builders preserve the frontend and other catalogue files.
`build_country_index.py` then rebuilds the geographic sidecar from those fixed
packages and local map geometry. `build_admin1_index.py --download` verifies the
pinned Natural Earth subdivision input and builds its separate sidecar;
`build_tectonic_assets.py --download` preserves pinned PB2002 source geometry.
Run `build_transport_assets.py` last after intentional JSON/GeoJSON changes.
Run `node tests/test_catalog_composition.cjs`
and `python -m unittest discover -s tests -p test_country_index.py` alongside
the existing frontend and view-state tests.

The geographic map supports pan, zoom, fitting filtered records and selecting an epicenter to inspect its source record. The table provides the same record inspection through keyboard-accessible buttons. Filters apply to both the map and the table; panning only changes the visible map area, not the filtered count or CSV export.

The optional count heatmap gives every selected source row whose epicentre centre
is inside the viewport weight 1. It bins screen positions on an 8-CSS-pixel grid,
smooths with a Gaussian kernel of radius 32 CSS pixels and sigma 12 CSS pixels,
then maps `log1p` values relative to that viewport's maximum. Raw grid counts
retain all visible rows before smoothing; clipped edge kernels and viewport
normalization make the colours depend on pan, zoom and screen size. Magnitude is
not a weight. This is a visual count display, not a density per square kilometre,
catalogue-completeness estimate, hazard or probability. Query/analysis JSON records
the cartographic display evidence separately from the scientific selection.

Cartography is packaged locally: Leaflet 1.9.4 (BSD-2-Clause, notice in
`dist/vendor/leaflet/LICENSE`) and Natural Earth 1:50 million country polygons
(public domain), covering the extended North American map. The default requires
no tile service or map account. Generalized boundaries provide geographic
context; they do not classify earthquake nationality. Run
`python scripts/fetch_map_assets.py` to reproduce these pinned local assets.
Exact source URLs, transformations and hashes are in `dist/data/map_assets.json`.

The optional PB2002 layer shows static plate polygons and boundaries from Peter
Bird's 2003 model (DOI 10.1029/2001GC000252), through the pinned
fraxen/tectonicplates GeoJSON conversion. ODC-BY 1.0 requires attribution;
`dist/data/tectonic-plates-LICENSE.txt` and its manifest retain model and
conversion credits. Unknown boundary types stay unknown; literal source types
are preserved. Pacific and adjacent plate labels provide geological context,
not event-to-plate assignment, mechanisms, active-fault status or a forecast.

OpenStreetMap, humanitarian OSM, USGS Topo and NASA Blue Marble (static
August 2004 composite) are optional remote backgrounds with visible
attribution. They load after selection and can fail independently of the data;
the local background remains available. USGS Topo's detailed coverage concerns
the United States. See [coverage and service terms](../docs/CATALOGS.md).
