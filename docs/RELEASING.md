# Automatic GitHub Releases

Use this project directory as the GitHub repository root; parent workspace files are not part of the project. Distribution uses Developer mode → **Load unpacked** in Edge and Chrome. No browser-store account or submission is involved.

## Verify and package

1. Update `manifest.json`, `package.json`, the lockfile, changelog, privacy effective version, and version-specific documentation together.
2. Run `npm ci`, `npm run check`, `npm test`, and browser checks on Edge and Chrome. Record actual versions/results, including any isolated-test sandbox override.
3. Run `npm run package`. Python's standard library creates a deterministic, allowlisted ZIP and SHA-256 checksum in `dist/`. The ZIP contains runtime files, icons, the MIT license, and `INSTALL.md`, with `manifest.json` at its root.
4. Run `npm run verify:release` to copy the source into an isolated temporary directory, check/test/package it, extract its ZIP, and browser-test that extracted installation. Alternatively, set `EXTENSION_PATH` to your own extracted folder. No parent-workspace files are needed.
5. Check that the source, screenshots, and ZIP contain no real-server data, credentials, copied requests, private machine paths, or unexpected files. Never package the entire parent workspace. `.gitignore` does not replace inspecting what you publish.

## Publish a version

Create the public repository and push this project's source/workflow first. Enable GitHub Actions for the repository if necessary. The workflow uses its built-in `GITHUB_TOKEN`; no personal access token or additional secret is required. Repository/organization policy must allow the release job's `contents: write` permission.

After reviewing a version, commit its source and push the matching tag:

```sh
git tag v1.1.0
git push origin v1.1.0
```

The tag must equal `v` plus the exact version in the manifest, package, and lockfile. Pushing that tag automatically:

1. Runs source and behavior checks on Windows/Linux.
2. Tests the source and extracted installation ZIP in Edge and Chrome.
3. Packages and uploads the ZIP/checksum as an immutable workflow artifact.
4. Downloads that artifact in the release job and verifies the ZIP checksum.
5. Publishes a normal GitHub Release with both assets, generated release notes, and the bundled Developer mode installation instructions.

Only the release job has `contents: write`. It requires a pushed version tag and depends on successful packaging, which depends on every preceding check. Branch pushes, pull requests, and manual workflow runs do not publish. Concurrent releases of the same tag are serialized.

## Reruns and failures

A rerun checks an existing published release's ZIP and checksum byte-for-byte against this build and skips matching releases without modifying assets. Drafts, prereleases, missing assets, or differing published files fail with instructions to inspect manually. Authentication, permission, and API errors fail rather than being treated as a missing release.

If asset upload fails during creation, GitHub may leave a draft or incomplete release. Inspect that release manually before rerunning; this workflow deliberately does not overwrite or repair published assets. For changed code/assets, publish a new version/tag instead of moving an existing release tag.

GitHub Releases also show automatic source archives. Users should select the explicitly attached `discord-reaction-ranker-VERSION.zip`, extract it into a permanent folder, then follow [INSTALL.md](../INSTALL.md). Unpacked installations update manually by replacing files and reloading the extension and Discord.

The release helper's tests use a fake GitHub CLI runner and perform no network writes. Actual GitHub publication is verified on the first tag push after repository setup; it has not been exercised from this local workspace.
