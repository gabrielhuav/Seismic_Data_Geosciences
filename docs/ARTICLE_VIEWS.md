# Article figures and functional views

Release2026.11.10.3 adds fourteen reproducible article targets. Open the
[figure index](https://gabrielhuav.github.io/Seismic_Data_Geosciences/article-figures.html)
or a link in a Word/PDF figure caption. These routes require this release to be
deployed; the older published interface does not implement them.

| Figure | Functional target |
| --- | --- |
| 1 | [Implemented design](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=1&lang=en) |
| 2 | [Four-source Home heat view](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=2&lang=en) |
| 3 | [SSN Atlas](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=3&lang=en) / [NRCan Time and coverage](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=3-time&lang=en) |
| 4A | [SSN partial2026, M≥4.5](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=4a&lang=en) |
| 4B | [USGS USA land](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=4b&lang=en) |
| 4C | [NRCan Canada land](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=4c&lang=en) |
| 4D | [Combined2010–2025, M≥4.5](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=4d&lang=en) |
| 5 | [SSN Guerrero descriptives](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=5&lang=en) |
| 6 | [Guerrero enlarged map and PB2002 context](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=6&lang=en) |
| 7 | [USGS Canada/Mexico comparison](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=7&lang=en) |
| 8 | [Simple view](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=8&lang=en) |
| 9A | [Four-catalogue Top10](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=9a&lang=en) |
| 9B | [SSN Guerrero proximity](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=9b&lang=en) |

`system/dist/article-views.js` is the maintained preset source. A target specifies
the catalogue and pinned snapshot, geographic index hashes where applicable,
filters, section, map position, English, blue/light appearance, and any separate
guided/history controls. The normal browser engines load verified original data
and compute the result. No target displays a screenshot instead of a working
result. Figure1 is explicitly an explanatory architecture diagram; its source,
map and output areas link to functional workspaces.

The figure identifier remains in the URL during initial restoration and reload.
Editing filters, navigating to another view or manipulating the map exits the
article preset, so later edits are not mislabelled as the original figure.
The figure index reapplies the original state. Source and computation failure
produces an explicit error rather than a fabricated substitute.

The desktop figures use a1920×1080 viewport and genuine English captures.
Rectangular crops and external panel labels retain observed controls and data.
Different viewport sizes reflow the same interface; pixel identity across screen
sizes is not claimed. Source rows, snapshots, magnitude types and geographic
classification are unchanged. Separate panels have separate links.

Run `node tests/test_article_views.cjs` to validate all targets, geographic hashes,
English settings and selected row counts against the packaged inputs. Word
hyperlink relationships and PDF URI annotations must contain the same fourteen
targets. All pages of the exported PDF require visual review after rebuilding.
