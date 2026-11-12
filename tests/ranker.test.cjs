const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const { search, post } = require('./fixtures/responses.cjs');
const guildId = '800000000000000001';
const forumId = '800000000000000002';
const key = `${guildId}/${forumId}`;
const searchUrl = `https://discord.com/api/v9/channels/${forumId}/threads/search?offset=25`;
const postUrl = `https://discord.com/api/v9/channels/${forumId}/post-data`;
function loadCore(extra = {}) {
  const sandbox = vm.createContext({ URL, ...extra });
  vm.runInContext(read('core.js'), sandbox);
  return sandbox;
}
const { DiscordReactionCore: core } = loadCore();
const batches = (data, url, time = 100) => core.normalize(data, core.endpoint(url), guildId, time);
const empty = () => ({ version: 1, forums: {} });
function ingest(state, data, url, time) {
  for (const batch of batches(data, url, time)) core.merge(state, core.validate(batch));
  return state;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('fixtures: both formats, coverage, deduplication and either arrival order', () => {
  const searchOnly = ingest(empty(), search, searchUrl, 100);
  assert.equal(core.ranked(searchOnly.forums[key]).length, 25);
  assert.equal(core.ranked(searchOnly.forums[key]).filter(t => t.message).length, 22);
  assert.equal(searchOnly.forums[key].searchTotal, 188);
  const postOnly = ingest(empty(), post, postUrl, 100);
  const postRows = core.ranked(postOnly.forums[key]);
  assert.equal(postRows.length, 10);
  assert.equal(postRows.filter(t => t.message).length, 9);
  assert.deepEqual(Array.from(postRows.slice(0, 3), t => t.message.total), [290, 264, 232]);
  const a = ingest(searchOnly, post, postUrl, 100);
  const b = ingest(postOnly, search, searchUrl, 100);
  assert.equal(core.ranked(a.forums[key]).length, 35);
  assert.equal(core.ranked(a.forums[key]).filter(t => t.message).length, 31);
  assert.equal(JSON.stringify(core.ranked(a.forums[key])), JSON.stringify(core.ranked(b.forums[key])));
  const before = JSON.stringify(a);
  ingest(a, post, postUrl, 100);
  ingest(a, search, searchUrl, 100);
  assert.equal(JSON.stringify(a), before);
});

test('replacement, stale observations, zero reactions and unavailable messages', () => {
  const state = ingest(empty(), post, postUrl, 100);
  const id = Object.keys(post.threads)[0];
  const changed = structuredClone(post);
  changed.threads[id].first_message.reactions = [{ emoji: { name: '🔥' }, count: 7, count_details: { normal: 5, burst: 2 } }];
  ingest(state, changed, postUrl, 200);
  assert.equal(state.forums[key].threads[id].message.total, 7);
  ingest(state, post, postUrl, 100);
  assert.equal(state.forums[key].threads[id].message.total, 7);
  changed.threads[id].first_message = null;
  ingest(state, changed, postUrl, 300);
  assert.equal(state.forums[key].threads[id].message.total, 7);
  changed.threads[id].first_message = { id, channel_id: id, content: '' };
  ingest(state, changed, postUrl, 400);
  assert.equal(state.forums[key].threads[id].message.total, 0);
  assert.equal(state.forums[key].threads[id].message.preview, '');
});

test('metadata-only observations preserve messages; ordering ties and server/forum separation', () => {
  const state = ingest(empty(), search, searchUrl, 100);
  const data = structuredClone(search);
  data.first_messages = [];
  data.threads[0].name = 'Updated title';
  ingest(state, data, searchUrl, 200);
  const id = data.threads[0].id;
  assert.equal(state.forums[key].threads[id].title, 'Updated title');
  assert.ok(state.forums[key].threads[id].message);
  const otherForum = '800000000000000003';
  const otherServer = '800000000000000004';
  const batch = core.validate(batches(post, postUrl)[0]);
  core.merge(state, { ...batch, forumId: otherForum });
  core.merge(state, { ...batch, guildId: otherServer });
  assert.equal(Object.keys(state.forums).length, 3);
  const rows = core.ranked({ threads: { b: { id: '222222222222222222', message: { total: 0 } }, a: { id: '111111111111111111', message: { total: 0 } }, c: { id: '100000000000000000', message: null } } });
  assert.deepEqual(Array.from(rows, r => r.id), ['111111111111111111', '222222222222222222', '100000000000000000']);
});

test('endpoint allowlist and bridge validation exclude extra fields and bad data', () => {
  assert.equal(core.endpoint(searchUrl).forumId, forumId);
  for (const url of ['https://example.com' + new URL(searchUrl).pathname, postUrl + '/other', 'https://discord.com/api/v9/users/@me', 'bad']) assert.equal(core.endpoint(url), null);
  const batch = structuredClone(batches(post, postUrl)[0]);
  batch.authorization = 'not forwarded';
  batch.threads[0].message.total = 999999;
  const validated = core.validate(batch);
  assert.equal(validated.authorization, undefined);
  assert.equal(validated.threads[0].message.total, 232);
  batch.threads[0].message.reactions[0].count = -1;
  assert.equal(core.validate(batch), null);
  assert.equal(core.validate({ ...batch, guildId: '__proto__' }), null);
  assert.equal(core.validate({ ...batch, threads: new Array(1001) }), null);
  assert.equal(batches({ threads: null }, postUrl).length, 0);
});

function observerHarness(fetchImpl) {
  class XHR extends EventTarget {
    open(method, url) { if (url === 'throw') throw new Error('native open'); this.url = url; return 'native return'; }
    complete(data, type = '', status = 200) {
      this.status = status; this.responseType = type;
      this.responseText = typeof data === 'string' ? data : JSON.stringify(data);
      this.response = data;
      this.dispatchEvent(new Event('load'));
    }
  }
  const sent = [];
  const sandbox = loadCore({ XMLHttpRequest: XHR, location: { pathname: `/channels/${guildId}/${forumId}` } });
  // The page world has its own physical helper entry to avoid browser file deduplication.
  vm.runInContext(read('core-main.js'), sandbox);
  sandbox.window = { fetch: fetchImpl, postMessage: (value, origin) => sent.push({ value, origin }) };
  vm.runInContext(read('observer.js'), sandbox);
  return { sandbox, sent, XHR };
}

test('fetch preserves promise, request arguments, response body and errors', async () => {
  const response = new Response(JSON.stringify(search));
  const nativePromise = Promise.resolve(response);
  const calls = [];
  const h = observerHarness(function (...args) { calls.push({ self: this, args }); return nativePromise; });
  const options = {};
  Object.defineProperty(options, 'headers', { get() { throw new Error('observer read headers'); } });
  const result = h.sandbox.window.fetch(searchUrl, options);
  assert.equal(result, nativePromise);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[1], options);
  assert.equal(calls[0].self, h.sandbox.window);
  assert.deepEqual(await (await result).json(), search);
  for (let n = 0; n < 15 && !h.sent.length; n++) await flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].value.batch.threads.length, 25);
  assert.equal(h.sent[0].origin, 'https://discord.com');
  const failure = new Error('network');
  const rejected = Promise.reject(failure);
  const failing = observerHarness(() => rejected);
  assert.equal(failing.sandbox.window.fetch(postUrl), rejected);
  await assert.rejects(rejected, e => e === failure);
  await flush();
  assert.equal(failing.sent.length, 0);
});

test('fetch malformed JSON, failed responses and unsupported URLs do not publish', async () => {
  for (const [response, url] of [[new Response('{bad'), postUrl], [new Response('{}', { status: 403 }), postUrl], [new Response(JSON.stringify(post)), 'https://discord.com/api/v9/users/@me']]) {
    const h = observerHarness(() => Promise.resolve(response));
    assert.equal(await h.sandbox.window.fetch(url), response);
    for (let n = 0; n < 5; n++) await flush();
    assert.equal(h.sent.length, 0);
  }
  const h = observerHarness(() => { throw new TypeError('native fetch'); });
  assert.throws(() => h.sandbox.window.fetch(postUrl), /native fetch/);
});

test('XHR observes text/json, handles reuse, malformed JSON and native open failures', () => {
  const h = observerHarness(() => {});
  const xhr = new h.XHR();
  let pageLoads = 0;
  xhr.addEventListener('load', () => pageLoads++);
  assert.equal(xhr.open('GET', searchUrl), 'native return');
  xhr.complete(search);
  assert.equal(h.sent.length, 1);
  xhr.open('POST', postUrl);
  xhr.complete(post, 'json');
  assert.equal(h.sent.length, 2);
  xhr.open('POST', postUrl);
  xhr.complete('{bad');
  xhr.complete(post, 'json', 500);
  xhr.open('GET', 'https://discord.com/api/v9/users/@me');
  xhr.complete(post, 'json');
  assert.equal(h.sent.length, 2);
  assert.equal(pageLoads, 5);
  assert.throws(() => xhr.open('GET', 'throw'), /native open/);
});

function storageHarness(initial = {}) {
  let stored = structuredClone(initial);
  const listeners = [];
  const local = {
    async get(key) { return { [key]: structuredClone(stored[key]) }; },
    async remove(key) { delete stored[key]; },
    async set(values) {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { newValue: structuredClone(value) };
        stored[key] = structuredClone(value);
      }
      for (const listener of listeners) listener(changes, 'local');
    }
  };
  let worker;
  const sender = { id: 'test-extension', tab: { url: `https://discord.com/channels/${key}` } };
  const chrome = {
    storage: { local, onChanged: { addListener(fn) { listeners.push(fn); } } },
    runtime: {
      id: sender.id,
      onMessage: { addListener(fn) { worker = fn; } },
      sendMessage(request) { return new Promise(resolve => worker(request, sender, resolve)); }
    }
  };
  function restart() {
    const context = vm.createContext({ chrome });
    context.importScripts = file => vm.runInContext(read(file), context);
    vm.runInContext(read('background.js'), context);
  }
  restart();
  return { chrome, restart, snapshot: () => structuredClone(stored) };
}

test('background serializes forum-name updates across worker restarts without storing rankings', async () => {
  const h = storageHarness();
  const otherKey = `${guildId}/800000000000000003`;
  const replies = await Promise.all([{ key, name: 'First' }, { key: otherKey, name: 'Second' }]
    .map(item => h.chrome.runtime.sendMessage({ type: 'forumNames', names: [item] })));
  assert.ok(replies.every(r => r.ok));
  assert.equal(h.snapshot().forumNames[key], 'First');
  assert.equal(h.snapshot().forumNames[otherKey], 'Second');
  h.restart();
  await h.chrome.runtime.sendMessage({ type: 'forumNames', names: [{ key, name: 'Renamed' }] });
  assert.equal(h.snapshot().forumNames[key], 'Renamed');
  assert.equal(h.snapshot().forumNames[otherKey], 'Second');
  assert.equal(h.snapshot().rankingState, undefined);
});

class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.style = {}; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  attachShadow() { this.shadow = new FakeNode('shadow'); return this.shadow; }
}
function panelHarness(storage, pageState) {
  const document = { documentElement: new FakeNode('html'), createElement: tag => new FakeNode(tag) };
  const events = {};
  const window = { addEventListener(name, fn) { events[name] = fn; } };
  const context = loadCore({ chrome: storage.chrome, document, window, location: { pathname: `/channels/${key}` },
    setTimeout: () => 1, MutationObserver: class { observe() {} } });
  vm.runInContext(read('forum-names.js'), context);
  vm.runInContext(read('panel.js'), context);
  const shadow = document.documentElement.children[0].shadow;
  function nodes(node = shadow) { return [node, ...node.children.flatMap(child => nodes(child))]; }
  if (pageState) {
    for (const forum of Object.values(pageState.forums)) events.message({ source: window, origin: 'https://discord.com',
      data: { marker: 'discord-reaction-ranker:v1', batch: { ...forum, threads: Object.values(forum.threads) } } });
  }
  return { nodes, window, events };
}

test('panel renders/searches page-local data; new pages start empty and delete the legacy cache', async () => {
  const state = ingest(empty(), search, searchUrl, 100);
  ingest(state, post, postUrl, 100);
  const first = Object.values(state.forums[key].threads)[0];
  first.title = '<img src=x onerror=alert(1)>';
  const otherKey = `${guildId}/800000000000000003`;
  core.merge(state, { ...batches(post, postUrl)[0], forumId: otherKey.split('/')[1] });
  const h = storageHarness({ rankingState: state });
  const panel = panelHarness(h, state);
  await flush();
  const find = tag => panel.nodes().find(n => n.tag === tag);
  const section = find('section');
  assert.equal(section.hidden, true);
  const toggle = panel.nodes().find(n => n.className === 'toggle');
  toggle.listeners.click();
  assert.equal(section.hidden, false);
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  assert.ok(panel.nodes().some(n => n.textContent.includes(first.title)));
  assert.equal(panel.nodes().filter(n => n.tag === 'img').length, 0);
  assert.ok(panel.nodes().some(n => n.textContent === '35 discovered · 31 ranked · 4 unavailable'));
  assert.equal(panel.nodes().find(n => n.tag === 'option').textContent, 'Unknown forum');
  assert.equal(panel.nodes().find(n => n.tag === 'option').title, `Forum ${forumId} · Server ${guildId}`);
  assert.match(find('a').href, /^https:\/\/discord.com\/channels\/\d+\/\d+$/);
  const select = find('select');
  select.value = otherKey;
  select.listeners.change();
  assert.ok(panel.nodes().some(n => n.textContent === '10 discovered · 9 ranked · 1 unavailable'));
  assert.equal(panel.nodes().filter(n => n.tag === 'button').length, 1);
  assert.equal(h.snapshot().rankingState, undefined);
  const reloaded = panelHarness(h);
  await flush();
  assert.ok(reloaded.nodes().some(n => n.textContent === '0 discovered · 0 ranked · 0 unavailable'));
  assert.ok(panel.nodes().some(n => n.textContent === '10 discovered · 9 ranked · 1 unavailable'), 'Other pages must not clear this page');
});

test('forum names persist, rename independently and preserve collected threads', async () => {
  const h = storageHarness();
  const batch = batches(post, postUrl)[0];
  const otherGuild = '800000000000000004';
  const otherKey = `${otherGuild}/${forumId}`;
  const state = empty();
  core.merge(state, batch);
  core.merge(state, { ...batch, guildId: otherGuild });
  const name = 'demo-projects 📁';
  await h.chrome.runtime.sendMessage({ type: 'forumNames', names: [{ key, name }, { key: otherKey, name }] });
  h.restart();
  assert.equal(h.snapshot().forumNames[key], name);
  await h.chrome.runtime.sendMessage({ type: 'forumNames', names: [{ key, name: 'Renamed 🎮' }] });
  assert.equal(h.snapshot().forumNames[key], 'Renamed 🎮');
  assert.equal(h.snapshot().forumNames[otherKey], name);
  assert.equal(h.snapshot().rankingState, undefined);
  const panel = panelHarness(h, state);
  await flush();
  assert.deepEqual(panel.nodes().filter(n => n.tag === 'option').map(n => n.textContent), ['Renamed 🎮', name]);
  const bad = await h.chrome.runtime.sendMessage({ type: 'forumNames', names: [{ key: '__proto__', name: 'bad' }] });
  assert.equal(bad.error, 'Invalid forum names');
});

test('search filters title, author and preview while preserving reaction order and original ranks', async () => {
  const state = empty();
  core.merge(state, {
    guildId, forumId, observedAt: 100,
    threads: [
      { id: '111111111111111111', title: 'Unrelated', message: { total: 100, author: 'Other', preview: '', reactions: [{ emoji: '🔥', count: 100 }], observedAt: 100 } },
      { id: '222222222222222222', title: 'Helmet mod', message: { total: 90, author: 'Other', preview: '', reactions: [{ emoji: '🔥', count: 90 }], observedAt: 100 } },
      { id: '333333333333333333', title: 'Uniform', message: { total: 80, author: 'Helmet Maker', preview: '', reactions: [{ emoji: '🔥', count: 80 }], observedAt: 100 } },
      { id: '444444444444444444', title: 'Equipment', message: { total: 70, author: 'Other', preview: 'Updated helmet textures', reactions: [{ emoji: '🔥', count: 70 }], observedAt: 100 } },
      { id: '555555555555555555', title: 'Helmet unavailable', message: null }
    ]
  });
  const h = storageHarness({ rankingState: state });
  const panel = panelHarness(h, state);
  await flush();
  const input = panel.nodes().find(n => n.tag === 'input');
  const titles = () => panel.nodes().filter(n => n.className === 'title').map(n => n.textContent);
  input.value = '  HELMET  ';
  input.listeners.input();
  assert.deepEqual(titles(), ['2. Helmet mod', '3. Uniform', '4. Equipment', 'Helmet unavailable']);
  assert.ok(panel.nodes().some(n => n.textContent.startsWith('4 of 5 collected threads match')));
  input.value = 'no matching post';
  input.listeners.input();
  assert.equal(titles().length, 0);
  assert.ok(panel.nodes().some(n => n.textContent.startsWith('No collected threads match')));
  input.value = '';
  input.listeners.input();
  assert.equal(titles().length, 5);
  assert.equal(titles()[0], '1. Unrelated');
});

test('panel bridge rejects foreign messages and forwards only normalized data', async () => {
  const h = storageHarness();
  const panel = panelHarness(h);
  const batch = batches(post, postUrl)[0];
  const event = { source: panel.window, origin: 'https://discord.com', data: { marker: 'discord-reaction-ranker:v1', batch } };
  panel.events.message({ ...event, origin: 'https://example.com' });
  panel.events.message({ ...event, source: {} });
  panel.events.message({ ...event, data: { ...event.data, batch: { ...batch, guildId: 'bad' } } });
  await flush();
  assert.equal(h.snapshot().rankingState, undefined);
  panel.events.message(event);
  await flush();
  assert.equal(h.snapshot().rankingState, undefined);
  assert.ok(panel.nodes().some(n => n.textContent === '10 discovered · 9 ranked · 1 unavailable'));
});

test('manifest restricts execution to Discord and requests storage only', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  const paths = manifest.content_scripts.flatMap(content => content.js);
  assert.equal(new Set(paths).size, paths.length, 'Never reuse a content-script path across worlds: Edge can skip the second injection');
  assert.equal(read('core-main.js').replace(/\r\n/g, '\n').trim(), read('core.js').replace(/\r\n/g, '\n').trim(), 'Keep the two helper entry files identical');
  for (const content of manifest.content_scripts) {
    assert.deepEqual(content.matches, ['https://discord.com/*']);
    assert.equal(content.run_at, 'document_start');
    for (const file of content.js) assert.ok(fs.existsSync(path.join(root, file)));
  }
});
