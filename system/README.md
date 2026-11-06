# Seismic Data Observatory

Buildless, browser-local explorer with three individually selectable catalogues
from two providers: USGS North America (2020–2025, the default), the frozen USGS
Mexico paper snapshot, and NRCan Canada and surroundings (1985–2019). Text
search, provider/catalogue selectors and scientific filters operate on the
selected catalogue. Records are not merged across providers or counted as
independent physical earthquakes. Retained origin-product revisions remain a
separate 36-event pilot. This is a research audit interface, not a forecasting
or operational alert service.

The committed artifact is ready to serve. From the repository root run:

```text
python scripts/build_catalogs.py --verify-only
python -m http.server 8787 --bind 127.0.0.1 --directory system/dist
```

Open http://127.0.0.1:8787. No Python, Docker or database is needed on the deployed server. The app reads only packaged JSON and performs filters and exports locally. Public build assets exclude context, drafts, author contact details and the historical SSN warehouse.

Each catalogue has its own manifest and SHA-256 values in
`dist/data/catalogs.json`. Unknown measurements remain unknown; the Canadian
source's undocumented depth unit is not interpreted as kilometres. Version-1
shared URLs retain the original Mexico snapshot. New shared views and local
query specifications identify the selected catalogue and input hashes.

For a complete data rebuild follow the ordered commands in the
[reproduction guide](../docs/REPRODUCIBILITY.md). The existing
`scripts/build_system.py` packages Mexico and the separate revision pilot;
`build_canada_catalog.py` packages the preserved Canadian CSV;
`build_catalogs.py` packages North America and assembles the three-catalogue
registry. These data builders preserve the frontend and other catalogue files.

The geographic map supports pan, zoom, fitting filtered records and selecting an epicenter to inspect its source record. The table provides the same record inspection through keyboard-accessible buttons. Filters apply to both the map and the table; panning only changes the visible map area, not the filtered count or CSV export.

Cartography is packaged locally: Leaflet 1.9.4 (BSD-2-Clause, notice in
`dist/vendor/leaflet/LICENSE`) and Natural Earth 1:50 million country polygons
(public domain), covering the extended North American map. The default requires
no tile service or map account. Generalized boundaries provide geographic
context; they do not classify earthquake nationality. Run
`python scripts/fetch_map_assets.py` to reproduce these pinned local assets.
Exact source URLs, transformations and hashes are in `dist/data/map_assets.json`.

OpenStreetMap and USGS Topo are optional remote backgrounds with visible
attribution. They load after selection and can fail independently of the data;
the local background remains available. USGS Topo's detailed coverage concerns
the United States. See [coverage and service terms](../docs/CATALOGS.md).
