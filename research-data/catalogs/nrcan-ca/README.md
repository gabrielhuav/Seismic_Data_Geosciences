# NRCan historical catalogue snapshot

Original English CSV of **Earthquakes in Canada**, distributed by Natural Resources Canada / Geological Survey of Canada. [Official dataset](https://open.canada.ca/data/en/dataset/4cedd37e-0023-41fe-8eff-bea45385e469) · [Official resource](https://ftp.maps.canada.ca/pub/nrcan_rncan/Earthquakes_Tremblement-de-terre/canadian-earthquakes_tremblements-de-terre-canadien/eqarchive-en.csv).

The resource is explicitly listed under the [Open Government Licence – Canada 2.0](https://open.canada.ca/open-government-licence-canada). Contains information licensed under the Open Government Licence – Canada. Source: Natural Resources Canada / Geological Survey of Canada, Earthquakes in Canada. No official status or government endorsement is implied. The project's software MIT licence does not replace this data licence.

The original 8,178,598 bytes are preserved, SHA-256 `f10b91ddbc683406e2f1a642aa8a15fba3d1b46eef3a775f2798cfdc75a31241`. The source contains 101,365 records from 1985–2019; the explorer selects 6,613 records with reported magnitude ≥3.5. It preserves magnitude types and repeated rows. Original event IDs, event types and uncertainty/revision metadata are absent. All displayed record keys are locally derived. No territorial classification, magnitude conversion or independent-event count is inferred.

The source does not document a depth unit in the CSV or linked layer metadata. `raw_depth` retains the literal source value; the common depth field is null and does not participate in kilometre filters. See `manifest.json` for the complete transformation contract. Acquisition headers and the licence-inspection evidence remain local, outside the web artifact.
