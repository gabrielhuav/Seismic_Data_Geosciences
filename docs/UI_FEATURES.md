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
- External OpenStreetMap and USGS Topo tiles keep their source colours. Changing
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

The **Data source / Fuente de datos** selector offers USGS, NRCan and the visible
shortcut **SSN/UNAM · via USGS ComCat**. There are still two distributors and
three packaged catalogues. The shortcut selects `usgs-mx-historical`, resets its
ordinary filters to the catalogue defaults, then applies `unmOnly: true`. It
selects 9,858 of the unchanged 24,994 Mexico-region records. The distributor
remains `usgs`; this is not an independent SSN catalogue.

The predicate is the exact case-sensitive union of
`locationSource in {"unm", "us_unm"}` and
`magSource in {"unm", "us_unm"}`. A row matching both is counted once. No
substring, case folding, network code, place name or inferred agency activates
it, and neither source variant is rewritten. The active catalogue selector is
limited to Mexico while this view is selected. The compact notice identifies
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
`predicate_rules.unmOnly`. Source data and the catalogue registry are unchanged.

## Expanded map and keyboard access

- **Expand map** creates a reversible map overlay. Other interface regions become
  inert, focus stays inside the map controls, and Escape closes the overlay and
  restores the prior focus. Native record dialogs retain their own focus handling.
- A skip link leads to a focusable main region; labelled controls, visible focus
  indicators, live status messages, native details and a table alternative remain
  available. Larger touch targets are used for coarse pointers.
- Reduced-motion preferences disable interface transitions and Leaflet zoom,
  fade and marker animations. Record centring and map fitting are non-animated.

## Verification

Run from the repository root:

```text
node tests/test_preferences.cjs
node tests/test_view_state.cjs
node tests/test_catalog_frontend.cjs
node tests/test_system_labels.cjs
```

The first three scripts currently provide 32 checks, including blocked storage,
system-mode changes, six theme/mode contrast combinations, immutable scientific
selection under appearance changes, all removable filters, linked record location,
expanded-map Escape/focus restoration, ES/EN filter-option localisation without
altering raw codes or selection, exact attribution semantics, v1/v2/v3 URL
compatibility, query provenance, catalogue races, hash failures and retry. Contrast
checks cover principal text pairs at 4.5:1 and focus/marker pairs at 3:1; these
checks do not constitute a full accessibility conformance audit. The label check
covers both interface languages and referenced HTML identifiers.

Final visual review and manuscript screenshots use the completed interface in a
real browser. The historical water and public-works projects were inspected as
interaction references and remain unchanged.
