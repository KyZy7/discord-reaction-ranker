# Contributing

Use synthetic examples. Never commit credentials, copied authenticated requests, HAR files, real server captures, private screenshots, or personal data.

`npm run check` includes heuristic publication checks for common credential formats, copied headers, private paths, and sensitive filenames. They report rule names without printing matched values. Inspect staged files before publishing too: ignore rules do not protect already tracked files or existing history.

## Checks

Use Node 22.15+ and Python 3.10+. No npm dependencies or runtime build step.

```sh
npm ci
npm run check
npm test
npm run test:browser
npm run package
npm run verify:release
```

Set `BROWSER_PATH` to Edge, Chrome, Chromium, or Chrome for Testing. Discovery checks standard Edge locations and PATH. Current regular Chrome uses the test-only `Extensions.loadUnpacked` DevTools loader; `BROWSER_CDP_ONLY=1` forces this mode for renamed Chrome executables. `EDGE_PATH` is an alias; `BROWSER_DEBUG=1` prints loader diagnostics.

Browser tests use a disposable profile with locally fulfilled synthetic responses. Missing browsers fail the test; they are not reported as passed/skipped compatibility checks. Preserve the default renderer sandbox; use `BROWSER_NO_SANDBOX=1` only if your isolated development environment requires it. Normal extension use changes no sandbox settings.

## Architecture

- `observer.js` runs in MAIN, preserves native fetch/XHR behavior, clones only matching successful responses, and posts normalized observations.
- `core.js` recognizes endpoints, normalizes, validates, merges, and sorts. `core-main.js` is deliberately identical under a different filename: reusing a script path across worlds caused browser injection to be skipped. Tests enforce synchronization and distinct paths.
- `panel.js` validates page messages in ISOLATED, keeps page-local rankings, filters after sorting, and renders text safely in a closed shadow root. Row construction is separate from collection/render updates.
- `forum-names.js` watches sidebar changes. `background.js` serializes name-storage writes across tabs. No post data is persisted.

Keep permissions limited to `storage` and scripts to `https://discord.com/*`. No remote scripts, analytics, automated pagination, credentials, or account automation. Page messages are not authenticated against other page scripts; they must never become security-sensitive commands.

## Assets and package testing

`icons/source.svg` is the original design. `npm run icons` reproduces PNGs using Python's standard library.

Generate 1280×800 real-extension screenshots over the synthetic demo backdrop:

```powershell
$env:SCREENSHOT_DIR = 'docs/images'
npm run test:browser
Remove-Item Env:SCREENSHOT_DIR
```

Fixtures in `tests/fixtures` are invented from scratch. Do not substitute private captures. To verify a ZIP, extract it into a temporary folder, set `EXTENSION_PATH` to that folder, then run the browser test from the source checkout. Runtime files load exclusively from the extracted package; fixtures stay in the harness.

## Changes and provenance

Explain behavior changes and checks performed. Keep the README AI disclosure accurate. AI assistance is welcome when disclosed; generated changes need the same review as other contributions. Do not claim a comprehensive human audit from automated checks.
