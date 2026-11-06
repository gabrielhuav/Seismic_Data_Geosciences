# Explorer interaction contract

The research explorer uses one pinned catalogue at a time. Interface preferences,
map extent, record selection and expanded-map mode do not change the filter,
reported coordinates, CSV, row counts or underlying evidence.

## Appearance

- Three interface accents: green (the original appearance), blue and maroon.
- System, light and dark modes. System mode reacts to changes in the operating
  system preference. The local `preferences.js` runs in the document head before
  styles are loaded, so a saved dark appearance is applied before first paint.
- The project-specific local-storage key is
  `seismic-observatory:appearance:v1`. Malformed or unavailable storage falls back
  safely; appearance controls continue to work. Other projects' keys are untouched.
- Interface surfaces, native controls, focus indicators, the local Natural Earth
  map, epicentres, selection rings, labels, popups and annual histogram use semantic
  colours. Reported depth classes and magnitude semantics remain unchanged.
- External map tiles keep their source colours. Changing
  appearance neither reloads those layers nor requests additional remote services.
- Theme and mode are presentation preferences, excluded from scientific URLs and
  query JSON. Saved scientific views take priority over local presentation state.

## Filtering and linked records

- Every filter differing from the active catalogue's defaults has a removable
  chip: search, both year bounds, both magnitude bounds, magnitude type, origin
  agency, maximum depth, missing-horizontal-error selection and SSN/UNAM attribution.
- Removing a chip restores that control's catalogue default. If restoring one
  range bound would invert the range, both bounds of that range are restored.
- Search and filters remain unavailable while a catalogue is loading. Provider
  and catalogue selectors remain available, and the last selection wins.
- Numeric controls apply on input with a short debounce. Exports are disabled
  immediately on edits and remain disabled for blank or invalid values, so the
  exported selection cannot differ from the values currently written in controls.
- **See on map** is available from each table row and event details. It centres
  the map, draws a selection ring, highlights the corresponding table row and
  opens that row's table page. It does not change any filter or count.
- A detail record excluded by the current filters can still be inspected through
  a saved URL; its map button is disabled and the reason is shown.

## Data sources and SSN/UNAM attribution

The **Data source / Fuente de datos** selector offers three distributors: USGS,
NRCan and direct SSN/UNAM. Four catalogues remain separate; their counts are not
added together. The initial selection remains USGS North America. Selecting
SSN requests and verifies its larger package on demand; its exact byte size is
reported during loading when supplied by the registry. Scientific controls and
exports remain disabled until the hash-checked package is ready.

The direct `ssn-mx-historical` catalogue packages the M >= 3.5 cartographic
selection from the official CSV, covering 1900–2026. The source CSV contains
402,082 records; 242,288 enter this magnitude selection, 17,649 have no calculable
magnitude and 142,145 are below 3.5. These exclusions and the raw/derived hashes
are explicit in the manifest. The selection is not a completeness claim, a live
feed or a conversion to Mw. A visible note distinguishes the all-magnitude CSV,
the selected package and the latest origin actually included in that package.

Native UTC and local date/time columns are preserved separately. A native SSN
record has a derived local key and its original data-row ordinal; it does not
gain an original event ID, magnitude type, event type, author, uncertainty,
summary-update timestamp or revision history. Its status remains the source's
literal value. In particular, `verificado` is not rewritten to ComCat `reviewed`.
Documented depth is in km. The UNM source-code statistic reads **Not reported**,
because absent per-solution author fields cannot establish that count.

The inspector shows the raw UTC/local/magnitude/depth/status strings in an
expandable section, identifies the raw CSV by SHA-256, and links the official
catalogue query, catalogue DOI, preserved complete CSV and packaged manifest. The
preserved CSV link uses the repository's `main` path from `public_copy_path`,
not a nonexistent Pages route; byte hashes identify its required content. The
candidate link requires publication/link verification before it can be reported
as publicly available. A catalogue landing page is
not labelled as a downloadable raw CSV. USGS event-page routes are generated only
for USGS records. CSV export includes every packaged raw field without converting
local clocks or status labels. Query JSON preserves source header/footer,
requested window, source-declared clocks, separately labelled filesystem timing,
selection/exclusions and transformations when present in that manifest.

The distinct shortcut **SSN/UNAM · via USGS · 1990–2017** retains its existing
`ssn-unam` selector value. It selects `usgs-mx-historical`, resets its
ordinary filters to the catalogue defaults, then applies `unmOnly: true`. It
selects 9,858 of the unchanged 24,994 Mexico-region records. The distributor
remains `usgs`; this is not an independent SSN catalogue.

The predicate is the exact case-sensitive union of
`locationSource in {"unm", "us_unm"}` and
`magSource in {"unm", "us_unm"}`. A row matching both is counted once. No
substring, case folding, network code, place name or inferred agency activates
it, and neither source variant is rewritten. The active catalogue selector is
limited to Mexico while this shortcut is selected. The compact notice identifies
the matching records' 1990–2017 coverage and the frozen, partial scope.

The advanced checkbox and its removable chip express the same predicate.
Removing the chip clears only that predicate and returns the source selector to
USGS; other filters remain in force. Removing it from the default shortcut view
restores all 24,994 Mexico records. Selecting ordinary USGS, selecting NRCan or
resetting filters also clears the attribution selection. During loading,
controls and exports stay unavailable; a failed package can be retried with
the intended attribution selection, and a later source choice wins a load race.

Scientific links now write protocol `v=3`, with `unmOnly=1` only when active.
Version-1 links retain Mexico and version-2 links retain their selected
catalogue. Neither older protocol can activate the new predicate, even if an
`unmOnly` parameter is supplied. A v3 attribution request for a different
catalogue is rejected rather than reinterpreted. Query JSON uses
`seismic-local-query/3`, identifies the actual USGS distributor, catalogue and
all three asset hashes, and records the two-field OR and literal codes under
`predicate_rules.unmOnly`. The native SSN selection has `provider: ssn` and
`unmOnly: false`; it is restored independently through the same v3 protocol and
query schema. Neither the scientific query nor a map background implies
independent observations or author identity across these related catalogues.

## Expanded map and keyboard access

- **Expand map** creates a reversible map overlay. Other interface regions become
  inert, focus stays inside the map controls, and Escape closes the overlay and
  restores the prior focus. Native record dialogs retain their own focus handling.
- A prominent **Return to system (Esc) / Volver al sistema (Esc)** button stays
  fixed at the top of the expanded map. It reuses the original toggle and focus
  restoration. The in-map base selector remains available while outside controls
  are inert; its selection is synchronized with the ordinary base selector.
- A skip link leads to a focusable main region; labelled controls, visible focus
  indicators, live status messages, native details and a table alternative remain
  available. Larger touch targets are used for coarse pointers.
- Reduced-motion preferences disable interface transitions and Leaflet zoom,
  fade and marker animations. Record centring and map fitting are non-animated.

## Cartographic backgrounds

These five map choices are separate from catalogue distributors and source
attribution. They do not load additional earthquake records or alter exports.
Natural Earth remains the local default and the fallback after repeated remote
tile errors. Remote tiles are requested only for the selected visible view, with
normal browser caching, no probes, no prefetch buffer and no offline downloads.

| Base | Coverage and use |
| --- | --- |
| Natural Earth | Local generalized geographic context, with colours adapted to the interface mode. |
| OpenStreetMap | Global street cartography under the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/), with visible contributor attribution. |
| OSM Humanitarian | Global Humanitarian OpenStreetMap Team style served by OSM France. Its [usage policy](https://www.openstreetmap.fr/usage/) permits public, non-profit sites with moderate traffic and visible attribution; service availability is not guaranteed. |
| USGS Topo | The National Map, with topographic detail focused on the USA and variable detail elsewhere. [USGS terms](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map) and source acknowledgements remain applicable. |
| NASA Blue Marble | A static August 2004 MODIS composite with relief and bathymetry, served by [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/). It provides global historical context, not current imagery or earthquake measurements. Native tiles end at level 8; higher map zoom enlarges those tiles. NASA GIBS/ESDIS acknowledgement remains visible. |

The NASA choice uses the documented public Web Mercator WMTS service and a
time-independent layer. The [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
and layer-specific credits apply; no NASA logo or endorsement is implied.

Esri services are not included as an assumed account-free entitlement. Current
[Esri basemap service documentation](https://developers.arcgis.com/rest/basemap-styles/get-started/)
requires an account and authentication. Access to a legacy anonymous endpoint
alone does not establish the required terms for this deployment. No account,
subscription, credential or paid service is created by the explorer.

## Verification

Run from the repository root:

```text
node tests/test_preferences.cjs
node tests/test_view_state.cjs
node tests/test_catalog_frontend.cjs
node tests/test_map_basemaps.cjs
node tests/test_system_labels.cjs
```

The four behavior scripts currently provide 45 checks, including blocked storage,
system-mode changes, six theme/mode contrast combinations, immutable scientific
selection under appearance changes, all removable filters, linked record location,
expanded-map Escape/focus restoration, ES/EN filter-option localisation without
altering raw codes or selection, exact attribution semantics, v1/v2/v3 URL
compatibility, native SSN raw-clock/status exports and provenance, catalogue
races, hash failures and retry. Map
checks additionally cover all five URL choices, zero remote tile layers on
startup, native zoom limits, in-map selector synchronization, keyboard event
propagation, attribution and recovery to the local base. These tests use bounded
map/DOM stubs and make no network requests; remote imagery availability is checked
separately in the real browser. Contrast
checks cover principal text pairs at 4.5:1 and focus/marker pairs at 3:1; these
checks do not constitute a full accessibility conformance audit. The label check
covers both interface languages and referenced HTML identifiers.

Final visual review and manuscript screenshots use the completed interface in a
real browser. The historical water and public-works projects were inspected as
interaction references and remain unchanged.
