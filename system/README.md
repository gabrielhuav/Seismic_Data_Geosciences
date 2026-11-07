# Seismic Data Observatory

Buildless, browser-local explorer with four individually selectable catalogues
from three providers: USGS North America (2020–2025, the default), the frozen USGS
Mexico paper snapshot, NRCan Canada and surroundings (1985–2019), and the
native SSN download (1900–6 November 2026, partial year; M≥3.5). Text
search, provider/catalogue selectors and scientific filters operate on the
selected catalogue or an explicit combined view. The local country/combined-view
revision described here requires separate publication verification before it
can be reported as deployed. Records retain their source and are not counted as
independent physical earthquakes. Retained origin-product revisions remain a
separate 36-event pilot. This is a research audit interface, not a forecasting
or operational alert service.

The committed artifact is ready to serve. From the repository root run:

```text
python scripts/build_catalogs.py --verify-only
python scripts/build_country_index.py
python -m http.server 8787 --bind 127.0.0.1 --directory system/dist
```

Open http://127.0.0.1:8787. No Python, Docker or database is needed on the deployed server. The app reads only packaged JSON and performs filters and exports locally. Public build assets exclude context, drafts, author contact details and the historical SSN warehouse.

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
Single-source CSV adds only `country_id` (28 columns for native SSN's 27-field
package). Country-filtered and combined views use v4 URLs and
`seismic-local-query/4`, including all source event/manifest hashes and the
registry/geometry/index hashes. Unfiltered single-catalogue v3 views and legacy
v1/v2 links remain supported.

For a complete data rebuild follow the ordered commands in the
[reproduction guide](../docs/REPRODUCIBILITY.md). The existing
`scripts/build_system.py` packages Mexico and the separate revision pilot;
`build_canada_catalog.py` packages the preserved Canadian CSV;
`build_ssn_catalog.py` packages the preserved official SSN CSV;
`build_catalogs.py` packages North America and assembles the four-catalogue
registry. These data builders preserve the frontend and other catalogue files.
`build_country_index.py` then rebuilds the geographic sidecar from those fixed
packages and local map geometry. Run `node tests/test_catalog_composition.cjs`
and `python -m unittest discover -s tests -p test_country_index.py` alongside
the existing frontend and view-state tests.

The geographic map supports pan, zoom, fitting filtered records and selecting an epicenter to inspect its source record. The table provides the same record inspection through keyboard-accessible buttons. Filters apply to both the map and the table; panning only changes the visible map area, not the filtered count or CSV export.

Cartography is packaged locally: Leaflet 1.9.4 (BSD-2-Clause, notice in
`dist/vendor/leaflet/LICENSE`) and Natural Earth 1:50 million country polygons
(public domain), covering the extended North American map. The default requires
no tile service or map account. Generalized boundaries provide geographic
context; they do not classify earthquake nationality. Run
`python scripts/fetch_map_assets.py` to reproduce these pinned local assets.
Exact source URLs, transformations and hashes are in `dist/data/map_assets.json`.

OpenStreetMap, humanitarian OSM, USGS Topo and NASA Blue Marble (static
August 2004 composite) are optional remote backgrounds with visible
attribution. They load after selection and can fail independently of the data;
the local background remains available. USGS Topo's detailed coverage concerns
the United States. See [coverage and service terms](../docs/CATALOGS.md).
