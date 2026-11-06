# Publishing the research explorer

The intended host is GitHub Pages for this public repository. GitHub documents [Pages availability for public repositories on GitHub Free](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). The explorer is static: HTML, CSS, JavaScript and packaged scientific JSON, with local cartography and no database or paid mapping account. Its relative URLs support a project subdirectory. No historical repository or existing site needs to change.

The workflow `.github/workflows/pages.yml` uploads **only `system/dist`**. It does not publish the repository root, `contexto`, manuscript drafts, raw local evidence, credentials or Word files. The repository and the website have different contents: the three selected continuity Markdown files can be public in Git after an authorized commit/push, while remaining outside the website artifact.

The workflow is manual (`workflow_dispatch`); pushing a commit does not publish or redeploy automatically. Each later publication remains a deliberate authorized action. All third-party Actions are pinned to verified release commit SHAs. The workflow runs the scientific contract checks and an offline artifact check before uploading; network evidence must be reviewed separately for the exact proposed push.

## Checks before the authorized push

Run `python scripts/check_links.py` for local references, packaged checksums and known private-path/credential signatures. Run `python scripts/check_links.py --network` for all literal article, documentation and artifact URLs. The report inventories the exact source/artifact hashes used. A failed automatic client stays a failure in that report; a connector/browser verification must be documented as fresh alternative evidence, or Gabriel must expressly authorize an exception for that particular push.

Generated links to current USGS event pages are separately inventoried from the typed packaged event IDs. `--dynamic-events sample --network` checks deterministic examples spanning file, network and year; `--dynamic-events all --network` visits every generated event-page route. These options do not assert that a current event is identical to the pinned observation, and a sample does not certify unvisited routes. Do not describe offline checks or sampled coverage as an exhaustive external-link audit.

Syntactic parser bases, where present in application source, are recorded separately as non-navigable values rather than silently counted as passing public links. Third-party Leaflet source-map definitions and namespace/source URLs are not application navigation; the pinned dependency hashes cover those files, while CSS resource references and the application's actual links remain checked.

Raw official responses in `research-data/comcat` retain product-content URLs as historical evidence. They are not all rendered as live website links, and this checker does not request every unexposed media URL inside those archived bodies. The package verifier checks their exact bytes and acquisition manifest. Source/query links exposed by the article, documentation and explorer remain in the link-check inventory.

Reports are local in `outputs/links/` and do not become website assets. The privacy checks recognize known path/credential patterns and enforce the artifact inventory; they are complemented by review of every file selected for the initial public commit. They are not a general guarantee about the contents of arbitrary prose.

## Authorized deployment sequence

1. Finish and review the public file selection, code licence, source-specific data notices, scientific results and link reports.
2. Obtain the express authorization required by `AGENTS.md` for the concrete commit and push. Create that commit with Gabriel's human Git author/committer identity and without assistant trailers or signatures. Check the resulting commit before the push.
3. After the authorized push, configure **this repository only** to use GitHub Actions as its Pages publishing source. GitHub documents the [publishing-source configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
4. For the authorized publication, dispatch `Publish seismic explorer` on the reviewed commit/branch. Wait for both jobs to finish successfully. Do not infer publication merely from a successful upload step.
5. Record the deployed URL returned by the successful deployment. Check that its HTML, data and map assets are reachable under the project subdirectory; then hand over that verified URL. The conventional `github.io` URL is a plan until the deployment actually succeeds.

GitHub's [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes the artifact, environment and deployment permissions. The workflow does not need write access to repository contents and does not create additional commits.
