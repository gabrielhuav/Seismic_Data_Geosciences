# Reproducing the local audit

Core acquisition, auditing and evidence contracts need Python 3.10 or newer and only the standard library. Tests do not need network access or a running database.

```text
python scripts/audit_sources.py --help
python scripts/prepare_public_evidence.py restore
python scripts/audit_revisions.py
python -m scripts.validate_evidence
python -m unittest discover -s tests
python scripts/build_catalogs.py --verify-only
python -m http.server 8787 --bind 127.0.0.1 --directory system/dist
```

The revision command verifies every raw response against `data/raw/revisions/manifest.json`. It refuses a length or SHA-256 mismatch. `--fetch` is only for the first acquisition and refuses to overwrite an existing manifest. The acquired cohort was selected from the current catalog, not from a complete historical event population.

The bounded original response package is retained under `research-data/comcat/`.
`prepare_public_evidence.py verify` checks all 40 response bodies and the fixed
acquisition-manifest hash. `restore` copies only those verified files to ignored
`data/raw/revisions/` without a network request and refuses to overwrite different
evidence. This restores the exact pilot inputs, rather than refetching a changed
catalogue. No historical SQL or private working documents enter the package.

The source auditor reads the historical SSN-derived SQL only in read mode. Its source directory can be selected with the command-line option shown by `--help`; skip it when those local historical files are unavailable. Generated alternatives for UTC dates are hypotheses, not observed timestamps. No SQL statement or upstream executable is run.

The frozen CSV input is versioned in `data/source_manifest.json`; `--download` obtains missing bytes and verifies their pinned hashes. The historical SQL is not redistributed or required by the revision audit.

## Rebuilding the complete explorer

The committed `system/dist` artifact is ready to serve. The offline
`build_catalogs.py --verify-only` command requires all three named catalogues,
their two providers, the default and legacy selections, six asset hashes,
manifest/event-byte agreement, row counts, record keys and source-file mappings.
It does not download or rewrite data. The deployment workflow uploads this
committed directory after validation; it does not regenerate or clear it.

After restoring and auditing the revision pilot with the commands above, a fresh
checkout can rebuild the separate CSV diagnostic and complete website data in
this order:

```text
python scripts/audit_sources.py --download --skip-ssn
python scripts/build_system.py
python scripts/build_canada_catalog.py
python scripts/build_catalogs.py --download
python scripts/fetch_map_assets.py
python scripts/build_catalogs.py --verify-only
python scripts/check_links.py --scope artifact
```

`build_system.py` is the existing Mexico/revision data builder; there is no
`build_app.py`. It writes `data/events.json`, `data/manifest.json` and
`data/revisions.json` inside the artifact. It preserves the frontend, extended
map and separately packaged catalogues. Run the revision audit first: otherwise
that builder explicitly packages the pilot as unavailable.

`build_canada_catalog.py` verifies and restores the original open-licensed CSV
from `research-data/catalogs/nrcan-ca/` when no ignored raw copy exists. It
reproduces 6,613 selected records, retaining five repeated source rows and
documenting derived row keys and the unknown depth unit. It writes its catalogue
entry before `build_catalogs.py` assembles the registry. No private acquisition
receipt is required for this preserved public-input path.

`build_catalogs.py --download` retrieves only missing pinned North American
inputs, verifying the upstream Git blob, size and SHA-256; it does not execute
upstream code. The 12 CSVs produce 14,041 earthquake records from 2020–2025.
With raw caches present, omit `--download` for an offline rebuild. The original
24,994-record Mexico snapshot remains separate. The final registry has three
catalogues and two providers; exploratory data do not change the paper's frozen
diagnostic or its revision-pilot claims.

`fetch_map_assets.py` verifies Leaflet and Natural Earth source bytes and
reproduces the extended local background. It preserves original coordinates;
positive Aleutian longitudes are unwrapped only by the map client. Optional
OpenStreetMap and USGS Topo backgrounds are runtime services selected by the
reader; builds do not fetch their tiles. Their coverage and attribution are
documented in [CATALOGS.md](CATALOGS.md).

The optional historical SSN diagnostic requires its separately identified
upstream input and is not needed for the explorer, revision analysis or
evidence-contract evaluation. The browser sources are maintained directly in
`system/dist`; none of these data builders compiles or deletes them. Building
the explorer does not rebuild the private manuscript DOCX or PDF.

## Evidence semantics

`scripts/evidence_contract.py` distinguishes captured summaries from conditional retained-lineage projections. A `selected_lineage_count` is not a count of unique physical earthquakes. A producer timestamp is not an authenticated public release time. Supplying current and superseded products does not identify complete past catalog membership or preference.

Synthetic counterexamples and tests are labeled synthetic. They test software semantics and logical possibilities; they do not estimate empirical frequency or validate a past public catalog.

`python -m scripts.validate_evidence` independently ranks retained versions with
SQLite window functions and applies SQL predicates after version selection.
It checks the original 36 details at 472 event-specific retained boundaries and
ten queries (4,720 comparisons). Eight generated histories supply 24 additional
query cases with known synthetic public replay. Reports under ignored
`outputs/validation/` record original-byte hashes separately from generated
fixtures and explicitly preserve product-lineage versus public-event units.
Zero projection disagreements do not authenticate public availability or make
the histories complete. The illustrative policies are not implementations of
libcomcat, Timeline or the INGV service.

## Figures and manuscript

`python scripts/make_figures.py` regenerates traceable PNG, PDF and SVG figures. Install matplotlib in the chosen scientific environment first. This run used the Codex bundled Python 3.12.14 and matplotlib 3.11.2 in the ignored `tmp/paper_deps` directory. Hashes, subsets and versions are recorded in `paper/figures/figures_manifest.json`.

The author-review manuscript source is local in `paper/drafts/manuscript.md`. The retained journal template and its checksum are in `paper/templates/`. `scripts/build_manuscript.py` patches a copy, preserving every unrelated package part byte-for-byte. It requires a template-distillation contract under ignored `tmp/template-contract/` and writes review artifacts to ignored `outputs/paper/`. The source, template and builder must be preserved together for regeneration. The template itself is never overwritten.

The Word/PDF render-and-review stage is separate from content generation. A generated DOCX is not visually verified until every rendered page has been inspected. This Windows environment does not bundle LibreOffice; Word-native export is used when available. No editorial submission, payment, author approval or public archival release is implied by building these files.

The delivery directory `outputs/paper/` contains only the final manuscript DOCX
and its matching PDF. Earlier versions and visual-review intermediates have
been archived separately under ignored `outputs/archive/`. The manuscript
builder writes highlights and its build report to `outputs/paper-support/`,
so regenerating support files does not clutter the delivery directory.

Manuscript drafts, generated figures and the downloaded template DOCX are local
authoring artifacts, excluded from Git. Template provenance and the authoring
scripts remain portable. Reproducing the private manuscript therefore also
requires its maintained source, the original template matching the recorded hash
and the local template-distillation contract. A code checkout does not claim to
contain unpublished manuscript material.

## Scope of interpretation

The regional rectangle is latitude 14–33 and longitude −118–−86 degrees. It includes offshore areas and neighboring countries. Different reported magnitude types are not equated. Missing uncertainty is unknown, never zero. Differences between retained solutions are not accuracy errors or demonstrated improvements. The current-selected 36-event pilot does not estimate historical threshold migration, completeness, damage or earthquake probability.
