# Captured ComCat evidence

`comcat/` preserves the original responses and acquisition manifest for the
current-selected 2017 and 2022 pilot. It contains 36 event-detail responses and
four cohort count/query responses, acquired on 5 November 2026. The bodies are
byte-identical to the original captures; hashes identify the supplied evidence,
without authenticating capture time or claiming a complete past public catalogue.

Run from the repository root:

```text
python scripts/prepare_public_evidence.py verify
python scripts/prepare_public_evidence.py restore
python scripts/audit_revisions.py
python -m scripts.validate_evidence
python -m unittest discover -s tests
```

Restoration verifies every response and refuses to replace different existing
evidence. It copies only the explicitly listed files to ignored
`data/raw/revisions/`; it does not contact a live service. A new live response
cannot replace these captures when reproducing the reported analysis.

The separate 46-file CSV diagnostic is identified by pinned upstream URLs and
SHA-256 hashes in `data/source_manifest.json`. Its missing bytes can be acquired
and verified through `scripts/audit_sources.py --download`; see that command's
help for the independent historical-source options. Historical SSN-derived SQL,
imputed impacts, local author documents and private working files are excluded.

Data attribution remains with the U.S. Geological Survey and the contributing
networks and product authors identified in each response. The project MIT
licence applies to its new software and documentation; it does not relicense
third-party observations, product contents, journal material or cartography.
Original public operator aliases/contact metadata may occur inside product
metadata. No linked binary attachments have been downloaded into this package.
See [source-specific rights](../docs/LICENSING.md).
