# Exploratory catalogues and map backgrounds

The explorer distinguishes a selected data catalogue from its map background.
Only one catalogue is active at a time. Switching backgrounds preserves its
records and filters; switching catalogues loads a separately identified source.
Reports from different catalogues are not silently merged or treated as
independent earthquakes.

## Data catalogues

- **North America, 2020–2025 — USGS ComCat.** Twelve pinned CSV files maintained
  by Actronix09 at commit `8fe055ffe635875f7290906d45f70562a7896621` contain
  14,041 earthquake records with reported magnitude at least 3.5. The main
  rectangle is latitude 14–84 and longitude −180 to −50; a second rectangle
  covers the eastern Aleutians at latitude 50–73 and longitude 170–180. These
  are spatial windows, not territorial assignments. The 770 positive-longitude
  records retain their original coordinates in downloads; world wrapping is
  applied only to map display. Source: [pinned provenance and CSVs](https://github.com/Actronix09/fuentes-alternas/tree/8fe055ffe635875f7290906d45f70562a7896621/sismos-usgs/datos/usgs/norteamerica).
- **Mexico region — paper snapshot.** The original 24,994 earthquake records,
  manifest and input hashes remain unchanged. This is the fixed regional CSV
  diagnostic described by the article. The separate 36-event retained-revision
  pilot remains explicitly separate from all catalogue selectors. Original
  version-1 shared URLs continue to identify this dataset.
- **Canada historical — Natural Resources Canada / Geological Survey of Canada.**
  The [official Open Government dataset](https://open.canada.ca/data/en/dataset/4cedd37e-0023-41fe-8eff-bea45385e469)
  supplies a downloadable CSV under the Open Government Licence–Canada.
  Coverage and exclusions are calculated from its actual bytes, rather than
  assumed from the catalogue landing-page description. It is a different
  distribution from the NEDB interactive bulletin; the Open Government terms
  are not generalized to that separate bulletin or to all NRCan products.
  The preserved CSV contains 101,365 records from 1985–2019. The explorer
  selects 6,613 records with reported magnitude at least 3.5 and excludes 94,752
  below that threshold. Five exact repeated records remain in the selection;
  these are record counts, not a count of unique physical earthquakes. No
  event-type field is supplied, so individual non-earthquake exclusions cannot
  be determined from this resource. Coverage includes surrounding and offshore
  areas; it is not a territorial assignment to Canada.

Each packaged catalogue has its own event bytes, manifest, SHA-256 values,
provider, coverage and field limitations in `system/dist/data/catalogs.json`.
The North America and Canadian additions are exploratory interface datasets;
they are not substituted for the original article's evidence or used to expand
its empirical claims. Magnitude type strings are retained exactly. Selection
using reported numeric magnitudes does not make different scales equivalent.

The Canadian CSV has no original event identifiers, revision history or
uncertainty fields. Local row keys are explicitly identified as derived; they
are not USGS identifiers or new observations. Repeated source rows remain
identifiable and are not claimed to represent independent physical events.
Depth values whose units cannot be documented remain raw values outside the
common kilometre field, rather than being silently converted or labelled.

## SSN/UNAM attribution within USGS ComCat

**SSN/UNAM · via USGS ComCat** is a visible source shortcut to a filtered view
of the fixed Mexico-region catalogue. Its technical distributor remains USGS
and its catalogue identifier remains `usgs-mx-historical`; no fourth catalogue,
third distributor or independent SSN download is introduced. The
[USGS contributor directory](https://earthquake.usgs.gov/data/comcat/contributor/)
identifies UNM as Instituto de Geofísica, UNAM. The primary
[EMSC contributor directory](https://emsc-csem.org/Earthquake_data/contributors.php)
explicitly associates UNM with Servicio Sismológico Nacional, Instituto de
Geofísica, UNAM, in Mexico City. This supports the institutional label, not a
claim that ComCat supplies the complete SSN national catalogue.

The selection is an exact case-sensitive OR over the reported `locationSource`
and `magSource` fields, accepting only the literal values `unm` and `us_unm`.
Both variants remain unchanged; no additional meaning is invented for the
`us_unm` prefix. Of the 24,994 Mexico-region records, 9,530 match the origin
field, 8,444 match the magnitude field and 8,116 match both, yielding 9,858
records in the union. Their UTC origin times span
1990-07-11T10:37:47.750Z to 2017-11-13T11:23:01.560Z. Other filters can narrow
that selection further. The North America and NRCan packages each have zero
matches in these two fields; this describes those selected fields and bytes,
not SSN network activity or national completeness.

The view uses the existing ComCat event identifiers and provenance. It does
not recover original SSN identifiers or revision history. No historical SSN
SQL is republished or imported; reuse terms for that separate historical
resource remain unresolved. Registry, packaged event bytes, reported values,
coordinates and source manifests are unchanged. The URL and JSON query
identify the attribution predicate separately from the actual distributor.

## Map backgrounds

- **Natural Earth local** is the default and works without a tile service.
  Generalized country polygons provide geographic context, not event nationality.
- **OpenStreetMap** is loaded only after selection, with visible contributor
  attribution and normal browser caching/referrers. No probe, prefetch, offline
  tile bundle or automated panning/zooming to acquire tiles is implemented.
  See the [official tile policy](https://operations.osmfoundation.org/policies/tiles/)
  and [copyright/attribution](https://www.openstreetmap.org/copyright).
- **USGS Topo** is a public National Map background whose detailed coverage
  concerns the United States. Its scope is labelled in the selector; selecting
  it does not imply that Canadian topographic detail is available. Service and
  attribution: [USGS Topo MapServer](https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer).
  See [USGS terms](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map)
  and the [official service directory](https://apps.nationalmap.gov/services/).

Remote backgrounds can fail independently of the dataset. The local background
remains available; a tile error must not be reported as an absence of earthquakes.
