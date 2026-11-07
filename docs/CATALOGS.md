# Exploratory catalogues and map backgrounds

The explorer distinguishes data distributor, catalogue, geographic
country/territory overlay and map background. Country selection and the explicit
combined view were released in code commit
`49372d02198a614a07dda1a3ecbb8a21d754ff68`. Switching backgrounds preserves records and
filters. Individually selected catalogues retain their separate source evidence;
the combined view preserves that evidence per row. Reports from different
catalogues are not silently deduplicated or treated as independent earthquakes.

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
- **Mexico, direct SSN download — 1900–6 November 2026.** The native
  [SSN catalogue](http://www2.ssn.unam.mx:8080/catalogo/) (DOI
  `10.21766/SSNMX/EC/MX`) is a separate distribution, identified by provider
  `ssn` and catalogue `ssn-mx-historical`. Its unchanged CSV contains 402,082
  source records, all magnitudes and depths. The map package selects all
  242,288 records with reported numeric magnitude at least 3.5 and valid native
  UTC/coordinates, without a further temporal cut. It excludes 142,145 records
  below 3.5 and 17,649 with the literal magnitude `no calculable`; those records
  remain in the full raw CSV. The 71,317,664-byte map JSON loads on demand.
  The selected observed bounds are latitude 10.271–38.0923 and longitude
  −120.595–−85.5467. These coordinates do not establish national membership.

Each packaged catalogue has its own event bytes, manifest, SHA-256 values,
provider, coverage and field limitations in `system/dist/data/catalogs.json`.
The North America and Canadian inputs support exploratory catalogue demonstrations;
they do not enlarge the separate retained-revision cohort or reconcile overlapping
observations. Magnitude type strings are retained exactly. Selection
using reported numeric magnitudes does not make different scales equivalent.

The Canadian CSV has no original event identifiers, revision history or
uncertainty fields. Local row keys are explicitly identified as derived; they
are not USGS identifiers or new observations. Repeated source rows remain
identifiable and are not claimed to represent independent physical events.
Depth values whose units cannot be documented remain raw values outside the
common kilometre field, rather than being silently converted or labelled.

## Schema alignment and normalization rules

Integration uses source-specific adapters and schema alignment rather than
scientific homogenization. Preserved CSV bytes are checked against their source
manifests before columns are mapped to the common record interface: identifier,
UTC origin time, coordinates, reported magnitude, documented depth and provenance.
Finite numeric values are parsed without converting magnitude scales. Source
categorical strings retain their case and meaning. Missing numeric measurements
remain `null`; an original empty text cell can remain `""`. The SSN adapter
initializes unavailable fields as `null`, whereas the USGS and NRCan adapters can
retain empty source text. Composition supplies `null` for columns absent from a
source's schema and preserves existing nulls and empty strings. Thus a common field name does not imply equal measurement
semantics or a universal replacement of missing values.

| Catalogue input | UTC origin-time rule | Depth rule | Identity and categorical fields |
| --- | --- | --- | --- |
| USGS Mexico | Preserve the supplied timestamp string; the source audit checks zoned instants | Reported kilometres; absent numeric values remain `null` | Original ComCat ID; exact magnitude-type, agency and status strings retained; raw event type selects `earthquake` |
| USGS North America | Require explicitly UTC source times and retain their supplied strings | Reported kilometres; missing numeric values remain `null` | Original ComCat ID; repeated IDs within this package are rejected; exact reported type/status strings retained |
| NRCan Canada | Parse the explicit zero-offset timestamp and emit ISO 8601 with `Z` | Common `depth` is `null`; retain `raw_depth` because its unit is undocumented | Content-derived row key plus occurrence suffix; exact magnitude-type case retained; unavailable event type/status stay unreported |
| Direct SSN | Combine explicitly labelled `Fecha UTC` and `Hora UTC` as ISO 8601 with `Z`; retain raw UTC and local strings separately | Source-documented kilometres; observed zero stays zero | Content-derived row key plus occurrence suffix and source ordinal; absent magnitude type remains `null`; literal `verificado`/`revisado` statuses are not translated to ComCat categories |

SSN and NRCan row keys use a collision-checked prefix of the SHA-256 of the original
cells and an occurrence suffix computed in source order before magnitude selection.
These keys identify source rows, not original agency event identifiers. All repeated
source rows remain distinguishable. A combined key is qualified as
`catalogue-id~packaged-key`, retaining the packaged key separately in
`source_event_id` and its meaning in `source_identifier_kind`.

The provenance relationship is a metadata lookup:
`catalogue-qualified row → catalogue registry entry → catalogue manifest → source file and SHA-256`.
The row's `file` identifies the file entry within its own manifest, so identically
named files in different catalogues do not become the same evidence. Source rights,
coverage, snapshot and hash links remain attached to that catalogue. The geographic
index is joined separately by the unchanged package hash and row order; it adds a
derived label without rewriting measurements.

This process performs no cross-provider event `JOIN`, spatial/temporal matching,
fuzzy deduplication or automatic statistical correlation. Only identical ComCat IDs
shared by the two USGS packages are flagged, and both rows remain available.
Magnitude filtering does not convert measurements to `Mw` or establish scale
equivalence. Any statistical association must be computed separately for a declared,
compatible subset; source co-occurrence does not establish correlation or independent
validation.

## Geographic country/territory selection and combined view

`data/country-index.json` contains one geographic label per source-package row,
in the same order. Its catalogue descriptors retain the event-package SHA-256;
the sidecar also identifies the pinned local `data/basemap.geojson` by SHA-256.
Rebuild it after rebuilding both catalogues and map assets with
`python scripts/build_country_index.py`. It does not rewrite catalogue bytes,
source identifiers, coordinates, magnitudes or source manifests.

The predicate tests epicentre containment in the 47 retained Natural Earth
1:50 million terrestrial country/territory features. Stable region keys use
validated ISO codes or a Natural Earth-derived fallback. It is a coarse map
overlay, not a claim of earthquake nationality, authoritative political
boundaries, territorial seas or exclusive economic zones. The category
`outside` includes sea and any land outside the retained polygons; `boundary`
keeps polygon-edge and ambiguous multiple matches separate; `invalid` preserves
invalid-coordinate classification explicitly. The all-country setting retains
every category. Generalized coastlines can affect near-shore classification.
No country is inferred from a reported nearby locality, source agency or the
nearest coast, and a country filter does not silently capture that country's
offshore seismicity.

The all-catalogue view retains **287,936 rows**: 14,041 USGS North America,
24,994 USGS Mexico, 6,613 NRCan and 242,288 direct SSN. These are source-record
counts, not a unique earthquake count. The two USGS packages contain 39,035
rows with 36,872 distinct ComCat identifiers: 2,163 identifiers occur in both
packages and their 4,326 rows receive exact-ID overlap flags. All rows remain
available. No cross-provider spatial/temporal linkage or fuzzy deduplication is
performed; unflagged records can still describe the same physical event.

A composite `id` qualifies each package key by catalogue using `~`. The original
package key remains `source_event_id`, with `source_identifier_kind` identifying
official ComCat IDs versus derived SSN/NRCan row keys. Each row retains its
`catalog_id`, `data_provider`, `source_snapshot`, per-record `depth_unit` and
`country_id`; source-specific raw fields and unknowns are preserved. Inspectors
and source links use the original catalogue rather than fabricating USGS routes
from derived or composite keys. Files with the same name in different manifests
remain separate provenance records, with separate rights and hashes.

Country-filtered or combined shared views use v4 URLs and
`seismic-local-query/4`. Their JSON identifies the registry, geometry, geographic
index and each source's event/manifest hashes, predicates, ordered result keys
and field semantics. Unfiltered single-catalogue v3 views and legacy v1/v2 links
remain supported. Single-catalogue CSV adds `country_id` without modifying the
source package (28 exported fields for native SSN, including its original 27).
The combined CSV additionally exposes per-row provenance and exact-USGS overlap
flags. Changing a base map has no effect on these predicates or exports.

## Direct SSN source, provenance and reproducibility

The preserved source is
`research-data/catalogs/ssn-mx/ssn_19000101_20261106.csv`: 45,950,120 unchanged
bytes, SHA-256
`0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993`.
The package includes its manifest, catalogue entry, README and observed SSN
legal-page text in `TERMS.txt`. Rebuild it offline with
`python scripts/build_ssn_catalog.py`, then run
`python scripts/build_catalogs.py` to refresh the registry while retaining the
other catalogues. Validate every registered event and manifest hash with
`python scripts/build_catalogs.py --verify-only`; the registry contains four
catalogues from three distributors, with North America still the default and
the original Mexico snapshot still the version-1 shared-link target.

The native CSV labels its first date/time pair UTC; the adapter combines those
columns into ISO 8601 with `Z` and preserves all four original UTC/local strings.
It does not infer an offset from local time. The source explicitly documents
depth in kilometres, and observed zero depths remain zero. Magnitude type,
event type, original event identifier, solution authors, uncertainties and
update timestamp are not supplied and remain null. No magnitude-scale
conversion is applied. `place` is the unchanged locality reference, which the
source explicitly says is only a reference to a nearby populous locality;
it does not assign a state, country or tectonic zone. The literal `verificado`
and `revisado` statuses are preserved, without treating them as an archive of
revisions or an update time.

The 27-field package also retains a one-based `source_record` and seven
`raw_*` fields. Each URL-safe `ssn-local-…` key is derived from the SHA-256 of
all ten original cells and the exact-row occurrence number in raw source
order, before selection. Prefix collisions are checked, and repeated rows
would be retained with separate keys; this input has no exact repeated rows.
These keys identify source records rather than original SSN events.

The four source-header lines and seven footer notes are retained in the
manifest. The header reports generation on 6 November 2026 at 13:57:07 in
centre-Mexico local time. One preserved record reports a later native local
origin time, 14:31:07 (20:31:07 UTC). The download-file last-write observation
is separately labelled filesystem metadata. This discrepancy is flagged;
neither time is repaired or claimed to establish a trusted publication clock
or atomic snapshot. The 2026 year is partial. Sixteen calendar years already
have no source records; they are not physical zero-event years or gaps caused
by the M≥3.5 filter. This download does not establish a completeness year,
independence from ComCat, revision history, earthquake prediction, ground-motion
hazard or damage.

The original CSV nonprofit reproduction notice is preserved together with the
data-specific **USO DE DATOS SÍSMICOS / TÉRMINOS DE LIBRE USO** observed on the
[SSN legal page](http://www.ssn.unam.mx/aviso-legal/). Those specific terms state
any-purpose use with source credit, preservation of meaning, no institutional
endorsement and separate third-party rights. Both notices remain visible in
the preserved source/terms and manifest; no Creative Commons or SPDX licence
is invented. The repository's software MIT licence does not relicense SSN
observations. The terms' request for a paper copy after publication does not
send an email automatically. No SSN/UNAM logo or endorsement is claimed.

## SSN/UNAM attribution within USGS ComCat

**SSN/UNAM · via USGS ComCat** is a visible source shortcut to a filtered view
of the fixed Mexico-region catalogue. Its technical distributor remains USGS
and its catalogue identifier remains `usgs-mx-historical`. That shortcut itself
does not create a new catalogue or distributor; the separate direct SSN
download described above has its own provider and provenance. The
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
resource remain unresolved. This attribution predicate leaves all four
catalogue event/manifest pairs unchanged. The URL and JSON query
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
- **OSM Humanitarian** uses OSM France's public service for moderate, non-profit
  use with visible attribution; its [usage terms](https://www.openstreetmap.fr/usage/)
  remain applicable. Tiles load only for the chosen visible map.
- **NASA Blue Marble** is the static August 2004 MODIS composite with relief and
  bathymetry from [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/), not current
  imagery or seismic evidence. The public time-independent Web Mercator layer
  has native zoom through level 8. NASA GIBS/ESDIS credits remain visible.

Remote backgrounds can fail independently of the dataset. The local background
remains available; a tile error must not be reported as an absence of earthquakes.
