# Article figures and functional views

Local candidate 2026.11.12.3 retains eighteen working targets: sixteen caption targets for nine figures and two additional views. The published version remains 2026.11.11.2 until a separately authorized deployment. Open the
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
| 5A | [Guerrero · SSN · 19,963 rows](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=regional-a&lang=en) |
| 5B | [California · USGS · 551 rows](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=regional-b&lang=en) |
| 5C | [Yukon · NRCan · 225 rows](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=regional-c&lang=en) |
| 5D | [Alaska · all selected · 1,112 rows](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=regional-d&lang=en) |
| Additional | [SSN Guerrero descriptives](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=5&lang=en) |
| 6 | [Guerrero enlarged map and PB2002 context](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=6&lang=en) |
| 7 | [USGS Canada/Mexico comparison](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=7&lang=en) |
| Additional | [Simple view](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=8&lang=en) |
| 8 | [Four-catalogue Top10](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=9a&lang=en) |
| 9 | [SSN Guerrero proximity](https://gabrielhuav.github.io/Seismic_Data_Geosciences/?figure=9b&lang=en) |

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

The desktop figures use a1920×1080 viewport and genuine English captures;
the live architecture uses1920×1400 to retain its complete frame.
Rectangular crops and external panel labels retain observed controls and data.
Different viewport sizes reflow the same interface; pixel identity across screen
sizes is not claimed. Source rows, snapshots, magnitude types and geographic
classification are unchanged. Separate panels have separate links.

Run `node tests/test_article_views.cjs` to validate all targets, geographic hashes,
English settings and selected row counts against the packaged inputs. Word
hyperlink relationships and PDF URI annotations must contain the same sixteen
caption targets; all eighteen application routes remain functional. All pages of the exported PDF require visual review after rebuilding.

Stable route IDs preserve earlier article links; they need not equal the current manuscript figure number. Regional targets request 2000–2026 but retain actual coverage limits (California 2020–2025; Alaska 739 USGS rows in 2020–2025 plus 373 NRCan rows in 2000–2019; Yukon 2000–2019; SSN through partial 2026). No source rows were added to fill missing years. The enlarged Guerrero target now selects 203 SSN land rows at M≥4.5 in 2000–2026.


In release2026.11.11.2, Figure1 mounts the same interactive map inside the architecture frame. Its four source buttons load that map in place; no iframe or second catalogue engine/download is required. Initial access waits for verified data, the design asset and rendering, with transfer progress and explicit retry on failure. Figure2 draws heat below PB2002 boundaries with a white halo and independent legend; Figure3 enlarges magnitude-shade keys. Figure6 uses a stronger descriptive-results hierarchy.

Revision12November2026 removes the descriptive and Simple-view images from the manuscript while preserving their working routes. Top10 and proximity are separate figures8and9. Home heat overlays every visible selected epicentre with a separate catalogue/magnitude legend; concentration weights and scientific selections are unchanged. Legends are enlarged in the application before recapture.

Readability revision 12 November 2026: heat-view USGS Mexico symbols and the map source key use warm orange; source shapes and within-hue magnitude lightness remain. The four regional routes enable the real Large map key control (also available manually), captured at 1280×1080. Figure4A restores zoom5.25. Guerrero explains M as reported magnitude and the collision-avoiding M≥5.5/24-label/zoom≥6 rule; six labels fit the captured203-row view. The four-source Top10 keeps Canada in its default geographic frame without changing the ranking and separates labels by at least104CSSpx when space permits. Historical proximity positions visible plate names inside their model polygons and updates them on pan/zoom. These are presentation changes, not new observations or risk estimates.

Latest local revision 2026.11.12.3 supersedes the previous Top10 label layout:
short leaders (36–90 CSSpx search radii) connect badges to unchanged red
epicentres. Mexico detail contains nine of ten ranked records; a functional
continental overview retains all ten including Alaska. The All ranked records
button restores the full map without changing ranking or exports. All four
Figure4 profiles enable the real Large map key;4D fits selected records.
Regional Alaska uses the selectable warm catalogue palette, persisted as
pointColor=warm. The Guerrero note distinguishes land containment from SSN
locality references outside the generalized polygon. Individual Word panels
each have an immediately following English functional-view hyperlink.
