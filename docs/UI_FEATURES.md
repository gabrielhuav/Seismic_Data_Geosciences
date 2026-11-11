# Explorer interaction contract

The explorer supports a single pinned catalogue or an explicit combined view.
The verified public baseline is `92d07a954e8b1209b311d9ee56c815ab72f92899`
(10 November 2026), including the initial four regional-access tools. The
automatic four-catalogue Top 10 below is a subsequent local revision, requiring
its own completed review and authorized publication. Documentation alone is not
evidence that this subsequent revision has been deployed.

## Simplified access and historical tools

**Simple view** starts with three large task buttons: historical map, descriptive
statistics and personal report. Each opens a short form for a single catalogue,
its complete footprint or a Mexico/Canada/USA land class, and an optional state or
province with recorded rows. Years and minimum reported magnitude can be adjusted;
the literal magnitude type is optional. When all types are selected, statistics
remain separated by catalogue and exact type, with an explicit unknown-type group.
The form shows the source's actual coverage; SSN 2026 is a partial year.

Submitting this form applies the ordinary catalogue/filter engine rather than a
second data-selection implementation. Its map is the same movable map card used
by Home and Catalogue. The simplified statistical display uses the existing
descriptive summary, including documented-kilometre sample counts and unknowns.
Its annual counts are source rows, not occurrence rates. Switching to the complete
workspace retains the applied selection. Editing criteria requires another
submission before they replace the displayed result.

The report path reuses existing record CSV, analysis/query-evidence JSON, ZIP,
downloadable HTML and printable report-preview actions. PDF is produced by the
browser print dialog from that report; no server-side or autonomous PDF generator
is implied. Exports reapply the stored selection and reject unavailable or invalid
data. None of the four input packages is rewritten.

**Historical Top 10** automatically loads all four preserved catalogues and
displays a result from their full footprint, including archived offshore rows.
Country/state are the two simple controls; changes recompute automatically.
Catalogue, literal magnitude type and UTC years remain in a closed advanced
panel. A load failure offers retry and does not silently rank a partial set.

The result orders reported numerical magnitudes, not a homogeneous Mw scale or
the strongest earthquakes ever. Every row displays source and exact type, with
unknown types explicit. Results have at most ten rows, using magnitude descending,
UTC time ascending, source key ascending and catalogue-qualified key as final
tie-breaker. Boundary ties do not expand the list. Numbered map markers and
source-coloured swatches use the same ranked rows as table and CSV/JSON.

Only identical original USGS IDs in the two USGS catalogues are grouped. If both
rows have valid UTC `updated` timestamps, the later update supplies the
representative; absence/invalidity or ties use fixed North America-before-Mexico
priority. This resolution precedes all filters and never selects by largest
magnitude. Both original values, types, coordinates, updates and hashes remain
inspectable. UTC ordering validates calendar seconds and compares fractional
seconds exactly, including submillisecond values; source formatting cannot
reverse chronology or create false update ties. Alternatives are also
exported as provenance rows. SSN/NRCan and possible observations
of one physical event across agencies are not reconciled and can occupy multiple
ranks. Coverage remains archive-specific; footprint cannot restore unarchived
events such as Alaska1964. Advanced single-source/type selection remains available.

**Historical proximity** identifies direct pairs of large reported epicentres in
one catalogue and exact type, with default M >= 7 and distance <= 100 km. It uses
inclusive haversine distance with spherical radius 6,371.0088 km; selectable pair
radii are 25, 50, 100 and 200 km. Pair and nearby-context boundary comparisons use
`distance <= threshold + 1e-9 km` before display rounding; this one-micrometre
absolute tolerance stabilizes numerical arithmetic, not geographic uncertainty.
Every unordered pair of distinct source keys is
evaluated. There are no transitive clusters: A close to B and B close to C does
not imply A close to C. The initial SSN-footprint view keeps its missing magnitude
type explicit. Other catalogues, periods, countries and recorded subdivisions
remain selectable, including honest empty outcomes.

An optional country/subdivision context adds unassigned or offshore rows within
100 km of the selected generalized land boundary. The minimum distance is to
finite minor great-circle segments of the pinned Natural Earth polygons; it is
not distance to an infinite line or a nearest-city lookup. Existing country and
subdivision classes are preserved, and land already assigned to a different
country or subdivision is not annexed. The complete catalogue footprint is a
separate choice. The map, pair table and CSV/JSON expose source keys, dates,
reported values, distances, criteria, methods and input hashes. Maps reuse the
main map's continuous antimeridian display transform on copies of the geometry;
source coordinates and calculations remain unchanged. **Fit records** restores
the selected extent.

These pairs are archive observations, not verified repeating ruptures, causal
sequences, fault recurrence intervals, completeness-adjusted rates, earthquake
probabilities, ground-shaking hazard or seismic risk. Aftershocks and same-day
records are retained without an independence claim. SSN/NRCan derived row keys do
not become official physical-event IDs. A zero-pair result does not establish
safety. Unapplied criteria disable downloads of stale results.

**Help and about** provides interface version `2026.11.10`, the human authors,
academic contact `ghurtadoa@ipn.mx`, repository/issue links, twelve searchable
ES/EN questions and answers, and licence information. Code is MIT-licensed;
SSN/UNAM, NRCan, USGS and third-party component/data rights remain separate. The
interface version is distinct from each frozen catalogue's observation dates.
The local files `quick-start.js` and `history-explorer.js` implement these views
without Docker, a backend database or a new remote data service. Local code and
independent raw-data checks precede real-browser and manuscript verification.

## Research workflow views in the verified baseline

The navigation adds **Home**, **Sources** and **Analysis** alongside the catalogue,
retained revisions and evidence/methods views. A bare URL opens Home; existing
version-1/2/3/4 links without a tab keep their catalogue behavior. New tab names
round-trip through the same URL/query protocols and do not change source selection,
filters, map extent, source values or result ordering.

Home explains the source → query → analysis → export workflow and the actual static
architecture. It identifies navigable historical snapshots rather than a real-time
event feed. Sources lists the four packaged catalogues from three distributors,
their counts, year coverage, reported-magnitude selection, key/unit semantics,
package/manifest download links and package SHA-256. Selecting a row loads that
catalogue into the existing map and record table. Its integration explanation
distinguishes structural mapping from magnitude harmonization and event linkage:
raw missing strings remain unchanged; absent common fields stay null; Canadian raw
depth is not labelled kilometres; only exact shared ComCat IDs receive overlap flags.

Analysis computes descriptive results from `state.filtered` using the pure
`SeismicAnalytics` module. It shows selected source-record counts, annual bins,
and arithmetic magnitude/depth summaries by catalogue and exact reported magnitude
type. Unknown types remain a separate numerical group with an explicit limitation,
not an inferred homogeneous scale. Pearson magnitude–depth coefficients require a
known exact magnitude type, one catalogue, documented kilometre depths and at least
three nonconstant pairs. Unknown/insufficient cases display no coefficient.
Correlation does not reconcile events between sources or establish causality.

The same selection produces five deliverable actions: the existing record CSV and
local-query JSON, a descriptive-summary CSV, a `seismic-analysis-report/1` JSON,
and an HTML report that can be opened and printed in a browser. Report JSON embeds
the existing query document, retaining all source input hashes and ordered result
keys, plus the numerical summary and interpretation limits. The HTML report carries
the same tables, predicates, hashes and evidence document; it is not a fabricated
PDF export or a hazard report. Browser computations do not replace the separately
prepared retained-revision audit. No earthquake probabilities or occurrence
forecasts are implemented in this revision.

Scientific exports are disabled while source bytes are loading or predicates are
invalid. In that state the analysis view clears stale values. Language, theme and
appearance changes relabel/redraw the view without changing the selected records.

The frontend checks exercise navigation/query preservation, source inventory,
real-data summary agreement, matching report/query IDs and input hashes, CSV/JSON/
HTML generation, and explicit empty-result behavior. Pure analytics tests verify
the numerical methods and field/scale boundaries independently.
Interface preferences, map extent, record selection and expanded-map mode do not
change the filter, reported coordinates, CSV, row counts or underlying evidence.

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
  agency, maximum depth, missing-horizontal-error selection, SSN/UNAM attribution
  and country/territory overlay selection.
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
NRCan and direct SSN/UNAM. Four catalogues remain individually selectable;
the combined option displays their source records together without treating the
sum as independent earthquakes. An unversioned entry opens all four catalogues
on Home; versioned links preserve their explicit catalogue selection. Selecting
SSN loads or reuses its verified package; its exact byte size is
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

Single-catalogue scientific links without a country predicate write protocol
`v=3`, with `unmOnly=1` only when active.
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

## Country selection and combined records

Data distributor, catalogue, geographic country/territory overlay and map
background are separate choices. Selecting a country does not select the
country's national agency: a USGS record can lie in Mexico, and an NRCan record
can lie outside Canada. The country predicate applies to the active catalogue
or to every source record in the combined view, using the same reported
epicentre coordinates as the map.

`data/country-index.json` is a reproducible sidecar tied to the unchanged event
package SHA-256 and row order of each catalogue. It uses the pinned local
Natural Earth 1:50 million terrestrial polygons, comprising 47 country/territory
features. Valid unique ISO codes are used where available, with stable Natural
Earth-derived fallback keys for unavailable or unsuitable ISO values. It is a
cartographic containment classification, not event nationality, political
recognition, an exclusive economic zone, territorial waters or authoritative
border adjudication. Generalized coasts can classify a near-shore epicentre
differently from a higher-resolution shoreline. No nearest locality, nearest
country or reporting-agency inference assigns offshore records to a country.

The selector retains explicit `outside`, `boundary` and `invalid` categories:
outside the retained land polygons (including sea and unrepresented land),
polygon boundaries or ambiguous multiple containment, and invalid coordinates.
The all-country choice includes those categories. A land-country selection
does not silently include offshore records. Empty selections remain visible as
zero selected source records; the underlying package is not truncated.

The combined option retains all **287,936 source rows** from the four packages.
There is no spatial/temporal fuzzy matching or deduplication. The two USGS
packages have **2,163 identical ComCat identifiers** in common; their **4,326
rows** are flagged with `shared_event_id` and `duplicate_group`, while remaining
separate records. That flag does not determine whether native SSN, NRCan or
other unflagged rows refer to the same physical earthquake. Counts, histogram
bars and plotted markers describe the selected source records.

Composite row keys use `catalogue-id~packaged-key`. The inspector resolves the
original catalogue, original packaged key, manifest, source file and source
rights rather than generating links from the composite key. CSV includes
`catalog_id`, `data_provider`, `source_snapshot`, `source_event_id`,
`source_identifier_kind`, per-record `depth_unit`, `country_id` and the exact-USGS
overlap flags. `source_event_id` is the retained package key; for SSN and NRCan,
`source_identifier_kind: derived_row_key` makes clear that it is not an original
agency event identifier. Missing source fields remain null. Canadian depths
with undocumented units do not become kilometres in a mixed-source view.

Country-filtered and combined views use URL protocol **v4** and query schema
`seismic-local-query/4`. Single-catalogue views without the country predicate
retain their existing v3 form; v1/v2/v3 restoration remains supported. Query
JSON records the geographic predicate, registry/geometry/index hashes and each
input catalogue's event and manifest hashes, coverage and field semantics. Its
ordered result keys match the selected map/table/CSV rows. A single SSN CSV adds
`country_id` to its 27 source-package fields; the original packaged bytes and
their hashes remain unchanged. Mixed-source exports retain source-specific
raw fields rather than harmonizing clocks, status vocabularies or magnitude
types.

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
node tests/test_analytics.cjs
node tests/test_view_state.cjs
node tests/test_catalog_frontend.cjs
node tests/test_catalog_composition.cjs
node tests/test_map_basemaps.cjs
node tests/test_system_labels.cjs
node tests/test_quick_start.cjs
node tests/test_history_explorer.cjs
python -m unittest discover -s tests -p test_country_index.py
```

The behavior scripts cover blocked storage,
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

Composition tests additionally verify collision-free qualified keys, unchanged
source fields, per-source hashes, source-row order, explicit nulls and exact
USGS overlap flags against the real packages. Country-index tests cover
geometric edge cases and the index's association with the original package
bytes and row order. Neither set of tests establishes source accuracy or
independent physical earthquakes.

Final visual review and manuscript screenshots use the completed interface in a
real browser. The historical water and public-works projects were inspected as
interaction references and remain unchanged.

The two new local suites cover simplified-form validation, available regional
choices, source coverage and help content, plus Top 10 ordering, literal-type and
unknown-depth preservation, direct-pair selection, geodesic edge cases, contextual
offshore inclusion, antimeridian display copies and complete CSV/JSON evidence.
The maintained Python oracle `scripts/audit_historical_views.py` independently
checks pair distances, three-dimensional finite-boundary context, Top 10 order,
all 17 CSV columns and unchanged input hashes. Its 31 cases retain the original
23 (15 real-package selections and eight synthetic boundary/logic cases), adding
four real combined selections and four synthetic representative/UTC-order cases. All agreed
with the JavaScript outputs, including USGS exact-ID alternatives and resolution
before attribute filters. Run it with standard-library Python and Node.js:

```text
python scripts/audit_historical_views.py --node node
```

`--node` also accepts an explicit executable path; its default discovers `node`
on PATH. `--output-dir` selects a private report directory, defaulting to
`outputs/validation/historical_tools`. The JSON report records source hashes and
the 1e-9 km numerical boundary tolerance. A recorded code run does not replace
visual or physical-device testing.


## Candidate 2026.11.11.1

Home and Atlas provide taller real maps. Hue and shape continue to identify the
source; within a hue, reported-M lightness bands are <3, 3–<5, 5–<7 and ≥7.
The <3 band is currently unoccupied because the retained packages start at 3.5;
the display never invents small earthquakes or magnitude-scale equivalence.
Descriptive cards, the 0.2-M histogram and annual counts share the same engine.
Comparison and Simple view use a consistent responsive presentation. On small
screens the main header scrolls away rather than obscuring the results.

Every live map, including Top 10 and Proximity, exposes the same five backgrounds:
local Natural Earth, OSM, humanitarian OSM, USGS Topo and static NASA Blue Marble.
Remote failures return to local context. Map providers do not change selections.
Top 10 offsets only overlapping rank labels, with leader lines to the original
epicentres; source coordinates and exports remain unchanged.

A coordinate panel shows latitude/longitude and approximate Natural Earth land
context. Locality lookup is an explicit, cached Nominatim request, limited to one
request per 1.1 seconds, without mousemove requests or background scans. It sends
the selected map point, not device geolocation. OSM returns approximate mapped
localities, not guaranteed exact addresses. The external service did not respond
in the local browser check; coordinates and land context were verified. Neither
lookup results nor live service availability are part of frozen seismic evidence.
Policy: https://operations.osmfoundation.org/policies/nominatim/

For original USGS identifiers and reported M≥6, map popups link to official
ShakeMap and DYFI views, where available. Derived SSN/NRCan keys never become USGS
identifiers, and no fuzzy event matching is attempted. These links expose official
estimated intensity/felt reports; no wave propagation, felt radius or attenuation
model is generated. The catalogues alone do not identify where a quake was felt.
Reference: https://earthquake.usgs.gov/data/shakemap/


## Live architecture and readable overlays (2026.11.11.2)

The Methods/figure1 architecture contains the shared working map; source controls keep the map in the frame and retain catalogue colour/shape. A startup screen reports real transfer bytes, verification and rendering; interaction starts after completion, with retry on failure. No duplicate map application or iframe is loaded. Heat renders in its own lower pane, below PB2002 halo boundaries and labels; model context remains separate from record concentration. Magnitude tones have larger swatches and explicit intervals. Guided descriptive results emphasize the principal measure and retain original calculations and counts.
