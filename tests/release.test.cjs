const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { publishRelease } = require('../scripts/release.cjs');
const env = { GITHUB_EVENT_NAME:'push', GITHUB_REF_TYPE:'tag', GITHUB_REF:'refs/tags/v1.1.0', GITHUB_REF_NAME:'v1.1.0', GITHUB_REPOSITORY:'demo/ranker', GH_TOKEN:'test-placeholder' };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ranker-release-test-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive:true, force:true });
  });
  for (const name of ['manifest.json', 'package.json', 'package-lock.json']) fs.writeFileSync(path.join(root, name), JSON.stringify({ version:'1.1.0' }));
  fs.mkdirSync(path.join(root, 'dist'));
  const zipName = 'discord-reaction-ranker-1.1.0.zip';
  fs.writeFileSync(path.join(root, 'dist', zipName), 'synthetic package bytes');
  const hash = crypto.createHash('sha256').update('synthetic package bytes').digest('hex');
  fs.writeFileSync(path.join(root, 'dist', `${zipName}.sha256`), `${hash}  ${zipName}\n`);
  fs.writeFileSync(path.join(root, 'INSTALL.md'), 'Enable Developer mode and select Load unpacked.');
  return { root, zipName };
}
const ok = stdout => ({ status:0, stdout:JSON.stringify(stdout), stderr:'' });
const missing = () => ({ status:1, stderr:'release not found' });

test('release skips branch pushes, PRs, and manual runs without invoking GitHub', () => {
  for (const overrides of [{ GITHUB_EVENT_NAME:'pull_request' }, { GITHUB_EVENT_NAME:'workflow_dispatch' }, { GITHUB_REF_TYPE:'branch', GITHUB_REF:'refs/heads/main' }]) {
    assert.match(publishRelease({ env:{ ...env, ...overrides }, gh:() => assert.fail('Must not call GitHub') }), /^Skipped/);
  }
});
test('release rejects mismatched tags/versions and corrupt checksums before API calls', t => {
  const { root } = fixture(t);
  const gh = () => assert.fail('Must not call GitHub');
  assert.throws(() => publishRelease({ root, env:{ ...env, GITHUB_REF_NAME:'v2.0.0' }, gh }), /exactly match/);
  for (const file of ['manifest.json', 'package.json', 'package-lock.json']) {
    fs.writeFileSync(path.join(root, file), '{"version":"2.0.0"}');
    assert.throws(() => publishRelease({ root, env, gh }), /exactly match/);
    fs.writeFileSync(path.join(root, file), '{"version":"1.1.0"}');
  }
  fs.writeFileSync(path.join(root, 'dist', 'discord-reaction-ranker-1.1.0.zip'), 'changed');
  assert.throws(() => publishRelease({ root, env, gh }), /checksum/);
});
test('new tag publishes both assets with verified tag, generated notes, and installation instructions', t => {
  const { root, zipName } = fixture(t);
  const calls = [];
  const gh = args => { calls.push(args); return args[1] === 'view' ? missing() : ok({}); };
  assert.match(publishRelease({ root, env, gh }), /^Published/);
  assert.equal(calls.length, 2);
  const create = calls[1];
  for (const item of ['create', '--verify-tag', '--generate-notes', path.join(root, 'dist', zipName), path.join(root, 'dist', `${zipName}.sha256`)]) assert.ok(create.includes(item));
  assert.match(create[create.indexOf('--notes') + 1], /Developer mode/);
  assert.ok(!create.includes('--draft') && !create.includes('--prerelease'));
});
test('rerun skips matching published assets; conflicts/drafts/incomplete releases fail without writes', t => {
  const { root, zipName } = fixture(t);
  const release = { tagName:'v1.1.0', isDraft:false, isPrerelease:false, publishedAt:'2026-01-01', assets:[{ name:zipName }, { name:`${zipName}.sha256` }] };
  for (const override of [{ isDraft:true }, { assets:[] }, { isPrerelease:true }, { publishedAt:null }]) {
    assert.throws(() => publishRelease({ root, env, gh:args => {
      assert.equal(args[1], 'view'); return ok({ ...release, ...override });
    } }), /Inspect it manually/);
  }
  for (const corrupt of [false, true]) {
    const gh = args => {
      if (args[1] === 'view') return ok(release);
      assert.equal(args[1], 'download');
      const directory = args[args.indexOf('--dir') + 1];
      for (const name of [zipName, `${zipName}.sha256`]) fs.copyFileSync(path.join(root, 'dist', name), path.join(directory, name));
      if (corrupt) fs.writeFileSync(path.join(directory, zipName), 'different remote bytes');
      return ok({});
    };
    if (corrupt) assert.throws(() => publishRelease({ root, env, gh }), /differ/);
    else assert.match(publishRelease({ root, env, gh }), /^Skipped/);
  }
});
test('authentication/API errors stop publication', t => {
  const { root } = fixture(t);
  assert.throws(() => publishRelease({ root, env, gh:() => ({ status:1, stderr:'HTTP 403: denied' }) }), /403/);
});
