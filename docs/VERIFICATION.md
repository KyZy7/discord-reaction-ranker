# Local release verification — 1.1.0

Verified November 12, 2026 on Windows with Node 26.7.0 and Python 3.14.

| Check | Result |
| --- | --- |
| Dependency lockfile (`npm ci`) | Passed; no npm dependencies |
| Source checks (syntax, manifest, icons, versions, disclosures, links, hygiene) | Passed |
| Behavior, release, and publication tests | 20 passed using entirely synthetic fixtures and a fake GitHub CLI runner |
| Edge 157.0.4341.42 | Source and extracted installation ZIP passed |
| Chrome 157.0.8103.52 | Source and extracted installation ZIP passed using the test-only CDP loader |
| Isolated source copy | Checks, behavior tests, packaging, and extracted-extension tests passed without parent workspace files |
| Screenshots | 1280×800; visually inspected synthetic demonstration with real extension panel |
| Packaging | 13 explicit runtime/license/icon/installation files, manifest at root, ZIP integrity verified, SHA-256 emitted |

Browser checks cover fetch/XHR collection, no panel-generated API calls, sorting/filtering with original ranks, names/renames, viewport layouts at 600/900/1080px plus a narrow viewport, independent scrolling, keyboard disclosure activation, long-title expansion, expanded-state retention, and refresh reset/legacy-cache removal.

The development execution sandbox required `BROWSER_NO_SANDBOX=1` for the disposable headless browser processes. No normal browser profile or installation setting was changed. All fixture page traffic was fulfilled locally. Live Discord collection was confirmed by the maintainer earlier in development; this release verification uses synthetic fixtures and does not independently certify every live Discord response variant.

Release tests verify tag/version gating, branch/PR/manual-run skips, both assets and installation notes, checksum integrity, matching-release rerun skips, and failures for drafts, incomplete/conflicting releases, and API errors. Workflow conditions and permissions were inspected locally; only the tag-push release job has write permission.

## Final publication review

- Reviewed runtime code, release workflow/helper, installation/privacy documentation, fixture provenance, and archive contents.
- Previewed Git's untracked-file selection using temporary repository metadata: 43 publishable project files; no actual project repository or index was created. Verified representative capture/credential/generated-file paths are ignored.
- Compared source candidates and ZIP text against the original private captures' IDs, author names, message text, and authorization values without printing those values. No matches were found.
- Visually checked synthetic screenshots and inspected all six PNG assets for text/EXIF metadata; none was present.
- Added heuristic checks for common token/key formats, copied credential headers, and private paths. Checks report filenames/rule names rather than matched secret values. These checks reduce accidental disclosure; they do not prove absence of every possible secret format.
- Normalized ZIP platform metadata across Windows and Linux. No extension runtime behavior was changed during this final review.

The original request/response captures remain outside this project in the parent workspace. Publish **only this project folder**, never the parent workspace. Since no project Git repository exists yet, staged files, commit history, and an actual future push could not be inspected. Recheck the index/history after initializing or importing the repository; ignore rules do not remove already tracked secrets.

GitHub Actions has been prepared but not run on GitHub. No repository or release has been created from this workspace. A matching version-tag push will publish automatically after all checks succeed. Distribution uses Developer mode; no browser-store submission is involved. Automated checks do not constitute a comprehensive human audit.
