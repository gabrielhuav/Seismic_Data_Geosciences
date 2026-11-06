# Seismic Data Observatory

Buildless, browser-local explorer for a pinned ComCat extract and retained origin-product revisions. It is an audit interface, not earthquake forecasting software.

From the repository root run `python scripts/build_system.py`, then `python -m http.server 8787 --bind 127.0.0.1 --directory system/dist`.

Open http://127.0.0.1:8787. No Python, Docker or database is needed on the deployed server. The app reads only packaged JSON and performs filters and exports locally. Public build assets exclude context, drafts, author contact details and the historical SSN warehouse.

The source audit must run before building. Revision results are included when the local revision audit has completed. Rebuild after either input changes. Input SHA-256 values and pinned URLs are included in the downloadable manifest.

The geographic map supports pan, zoom, fitting filtered records and selecting an epicenter to inspect its source record. The table provides the same record inspection through keyboard-accessible buttons. Filters apply to both the map and the table; panning only changes the visible map area, not the filtered count or CSV export.

Cartography is packaged locally: Leaflet 1.9.4 (BSD-2-Clause, notice in `dist/vendor/leaflet/LICENSE`) and Natural Earth 1:50 million country polygons (public domain). It requires no tile service, API key or paid map account. The generalized boundaries provide geographic context; they do not classify earthquake nationality. Run `python scripts/fetch_map_assets.py` once to prepare the pinned assets. Exact source URLs, versions, transformations and SHA-256 hashes are recorded in `dist/data/map_assets.json`.
