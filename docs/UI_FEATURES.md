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
  agency, maximum depth and missing-horizontal-error selection.
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

The first three scripts currently provide 27 checks, including blocked storage,
system-mode changes, six theme/mode contrast combinations, immutable scientific
selection under appearance changes, all removable filters, linked record location,
expanded-map Escape/focus restoration, ES/EN filter-option localisation without
altering raw codes or selection, catalogue races and hash failures. Contrast
checks cover principal text pairs at 4.5:1 and focus/marker pairs at 3:1; these
checks do not constitute a full accessibility conformance audit. The label check
covers both interface languages and referenced HTML identifiers.

Final visual review and manuscript screenshots use the completed interface in a
real browser. The historical water and public-works projects were inspected as
interaction references and remain unchanged.
