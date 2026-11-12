const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sensitiveTextRules, sensitiveFilename } = require('../scripts/publication-check.cjs');

test('publication checks catch common credential shapes without returning their values', () => {
  const samples = [
    ['GitHub token', 'gh' + 'p_' + 'A'.repeat(36)],
    ['AWS access key', 'AK' + 'IA' + 'A'.repeat(16)],
    ['Slack token', 'xox' + 'b-' + 'a'.repeat(30)],
    ['OpenAI-style key', 'sk-' + 'proj-' + 'a'.repeat(40)],
    ['Discord token', 'mfa' + '.' + 'a'.repeat(70)],
    ['Bearer credential', 'Bearer' + ' ' + 'a'.repeat(40)],
    ['private key', ['-----BEGIN', 'PRIVATE KEY-----'].join(' ')]
  ];
  for (const [name, value] of samples) {
    const detected = sensitiveTextRules(value);
    assert.ok(detected.includes(name));
    assert.ok(detected.every(label => !label.includes(value)));
  }
  assert.deepEqual(sensitiveTextRules('test-placeholder https://discord.com/api/v9/channels/800000000000000002/post-data'), []);
});

test('publication filename checks exclude captures and key material, allow source and examples', () => {
  for (const file of ['.env', '.env.local', 'private.pfx', 'id_rsa', 'credentials.json', 'post-data-request.js', 'search-response.json', 'traffic.har', 'extension.crx']) assert.ok(sensitiveFilename(file), file);
  for (const file of ['.env.example', 'manifest.json', 'tests/fixtures/responses.cjs', 'README.md']) assert.ok(!sensitiveFilename(file), file);
});
