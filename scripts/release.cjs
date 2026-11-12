// Runs only in the tag-push release job. Tests inject a fake gh runner: no API writes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function publishRelease({ root = path.resolve(__dirname, '..'), env = process.env, gh } = {}) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF_TYPE !== 'tag' || !env.GITHUB_REF?.startsWith('refs/tags/v')) {
    return 'Skipped: releases are published only for pushed version tags.';
  }
  const versionOf = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).version;
  const version = versionOf('manifest.json');
  const tag = `v${version}`;
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version) || versionOf('package.json') !== version
    || versionOf('package-lock.json') !== version || env.GITHUB_REF !== `refs/tags/${tag}` || env.GITHUB_REF_NAME !== tag) {
    throw new Error('Release tag must exactly match manifest, package, and lockfile versions.');
  }
  const repository = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('GITHUB_REPOSITORY must identify the target repository.');
  if (!env.GH_TOKEN) throw new Error('GH_TOKEN must be provided by the release job.');
  const zipName = `discord-reaction-ranker-${version}.zip`;
  const names = [zipName, `${zipName}.sha256`];
  const assets = names.map(name => path.join(root, 'dist', name));
  const expectedChecksum = `${digest(assets[0])}  ${zipName}`;
  if (fs.readFileSync(assets[1], 'utf8').trim() !== expectedChecksum) throw new Error('Release ZIP checksum verification failed.');

  gh ||= args => spawnSync('gh', args, {
    cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024
  });
  function run(args) {
    const result = gh([...args, '--repo', repository]);
    if (result.error) throw result.error;
    return result;
  }
  function requireSuccess(result) {
    if (result.status !== 0) throw new Error(`GitHub CLI failed: ${result.stderr || 'unknown error'}`);
    return result;
  }
  const viewed = run(['release', 'view', tag, '--json', 'tagName,isDraft,isPrerelease,publishedAt,assets']);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reaction-ranker-release-assets-'));
  try {
    if (viewed.status === 0) {
      const existing = JSON.parse(viewed.stdout);
      if (existing.tagName !== tag || existing.isDraft || existing.isPrerelease || !existing.publishedAt
        || !names.every(name => existing.assets?.some(asset => asset.name === name))) {
        throw new Error('Existing release is a draft, prerelease, or incomplete. Inspect it manually; assets will not be overwritten.');
      }
      requireSuccess(run(['release', 'download', tag, '--pattern', names[0], '--pattern', names[1], '--dir', temporary]));
      for (let i = 0; i < names.length; i++) {
        if (digest(path.join(temporary, names[i])) !== digest(assets[i])) {
          throw new Error('Existing published assets differ from this build. Inspect manually or publish a new version; assets will not be overwritten.');
        }
      }
      return `Skipped: ${tag} is already published with matching assets.`;
    }
    if (!/release not found|HTTP 404/i.test(viewed.stderr || '')) requireSuccess(viewed);
    const notes = fs.readFileSync(path.join(root, 'INSTALL.md'), 'utf8');
    // gh prepends --notes to generated release notes and verifies the tag exists.
    requireSuccess(run(['release', 'create', tag, ...assets,
      '--verify-tag', '--generate-notes', '--title', `Discord Reaction Ranker ${tag}`, '--notes', notes]));
    return `Published ${tag} with the installation ZIP and SHA-256 checksum.`;
  } finally {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temporary));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe temporary cleanup path.');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { publishRelease };
if (require.main === module) {
  try { console.log(publishRelease()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
