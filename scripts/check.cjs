const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { sensitiveTextRules, sensitiveFilename } = require('./publication-check.cjs');
const root = path.resolve(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    if (['.git', 'node_modules', 'dist', 'artifacts', '__pycache__'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Unexpected symlink: ${file}`);
    return entry.isDirectory() ? files(file) : [file];
  });
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const metadata = JSON.parse(read('package.json'));
assert.equal(manifest.version, metadata.version);
assert.equal(JSON.parse(read('package-lock.json')).version, metadata.version);
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `v${manifest.version}`, 'Tag must match manifest version');
assert.deepEqual(manifest.permissions, ['storage']);
const scripts = manifest.content_scripts.flatMap(group => group.js);
assert.equal(new Set(scripts).size, scripts.length);
assert.equal(read('core.js'), read('core-main.js'), 'MAIN and ISOLATED helpers must match');
for (const group of manifest.content_scripts) assert.deepEqual(group.matches, ['https://discord.com/*']);
for (const file of [manifest.background.service_worker, ...scripts]) assert.ok(fs.existsSync(path.join(root, file)), `Missing runtime file: ${file}`);
for (const [size, file] of Object.entries(manifest.icons)) {
  const png = fs.readFileSync(path.join(root, file));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), Number(size));
  assert.equal(png.readUInt32BE(20), Number(size));
}
const disclosure = 'This extension was created and coded using OpenAI Codex, an AI coding agent, from the maintainer’s requirements. Its initial implementation was AI-generated.';
assert.ok(read('README.md').includes(disclosure), 'Missing README AI disclosure');
assert.ok(!read('panel.js').includes('OpenAI Codex'), 'Disclosure belongs in README, not panel');
for (const file of files(root)) {
  const relative = path.relative(root, file);
  assert.ok(!sensitiveFilename(relative), `Credential/capture file: ${relative}`);
  if (/\.(js|cjs)$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8', windowsHide:true });
    assert.equal(result.status, 0, result.stderr);
  }
  if (!file.endsWith('.png')) {
    const source = fs.readFileSync(file, 'utf8');
    const detected = sensitiveTextRules(source);
    assert.equal(detected.length, 0, `Possible sensitive data in ${relative}: ${detected.join(', ')}`);
  }
  if (file.endsWith('.md')) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), `Broken documentation link in ${relative}: ${target}`);
    }
  }
}
console.log('PASS: syntax, versions, manifest, icons, disclosures, local links, and basic public-source hygiene.');
