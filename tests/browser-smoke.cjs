// Real Chromium-family browser smoke test in a disposable profile. All page traffic is fulfilled
// locally through DevTools: no Discord login, credentials, or live API calls.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sourceRoot = path.resolve(__dirname, '..');
const root = process.env.EXTENSION_PATH ? path.resolve(process.env.EXTENSION_PATH) : sourceRoot;
const { search, post } = require('./fixtures/responses.cjs');
const browserExecutable = require('./browser-path.cjs').browserPath();
const cdpOnly = process.env.BROWSER_CDP_ONLY === '1' || /^chrome(?:\.exe)?$/i.test(path.basename(browserExecutable));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-ranker-browser-'));
  const child = spawn(browserExecutable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    ...(cdpOnly ? [] : [`--disable-extensions-except=${root}`, `--load-extension=${root}`]),
    '--enable-unsafe-extension-debugging', '--no-first-run',
    ...(process.env.BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), '--disable-gpu', '--disable-background-networking', 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  let socket;
  let call;
  let launchError;
  child.on('error', error => { launchError = error; });
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 150; i++) await pause(100);
    if (launchError) throw launchError;
    if (!fs.existsSync(portFile)) throw new Error('Browser did not start its test debugging endpoint');
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const waiting = new Map();
    const listeners = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = waiting.get(message.id);
        if (!pending) return;
        waiting.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const callback of listeners.get(message.method) || []) callback(message.params, message.sessionId);
      }
    };
    call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { waiting.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 10000);
      waiting.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params, sessionId }));
    });
    const on = (method, callback) => {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(callback);
    };
    // Recent regular Chrome builds ignore --load-extension. Prefer its official
    // test-only CDP loader where available; Edge/Chromium can use the flags above.
    try {
      const loaded = await call('Extensions.loadUnpacked', { path: root });
      if (process.env.BROWSER_DEBUG) console.log('CDP loaded extension:', loaded);
      await pause(500);
    }
    catch (error) { if (process.env.BROWSER_DEBUG) console.log('CDP loader:', error.message); }
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const errors = [];
    on('Runtime.exceptionThrown', params => errors.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text));
    await call('Runtime.enable', {}, sessionId);
    await call('Page.enable', {}, sessionId);
    await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
    let requests = 0;
    on('Fetch.requestPaused', async (params, session) => {
      const url = new URL(params.request.url);
      // Count API calls, excluding browser-initiated favicon/document loads.
      if (url.pathname.startsWith('/api/')) requests++;
      let body = fs.readFileSync(path.join(__dirname, 'fixtures/demo.html'), 'utf8');
      let contentType = 'text/html; charset=utf-8';
      if (url.pathname.includes('/threads/search')) {
        body = JSON.stringify(search);
        contentType = 'application/json';
      } else if (url.pathname.endsWith('/post-data')) {
        body = JSON.stringify(post);
        contentType = 'application/json';
      }
      try {
        await call('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: contentType }], body: Buffer.from(body).toString('base64') }, session);
      } catch (error) { errors.push(error.message); }
    });
    const contexts = new Map();
    on('Runtime.executionContextCreated', params => contexts.set(params.context.id, params.context));
    await call('Page.navigate', { url: 'https://discord.com/channels/800000000000000001/800000000000000002' }, sessionId);
    await pause(1000);
    const evaluate = async (expression, contextId) => {
      const result = await call('Runtime.evaluate', { expression, contextId, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    console.log('Browser:', (await call('Browser.getVersion')).product);
    const extensionContext = [...contexts.values()].find(c => c.name === 'Discord Reaction Ranker');
    if (!extensionContext && process.env.BROWSER_DEBUG) console.log('Contexts:', [...contexts.values()].map(c => ({ name:c.name, origin:c.origin })));
    assert.ok(extensionContext, 'Extension did not load. Try current Edge/Chrome, Chromium, or Chrome for Testing with BROWSER_PATH.');
    assert.equal(await evaluate('typeof globalThis.DiscordReactionCore', extensionContext.id), 'object');
    await evaluate(`fetch('/api/v9/channels/800000000000000002/threads/search').then(r => r.json())`);
    await evaluate(`new Promise((resolve,reject) => { const x = new XMLHttpRequest(); x.open('POST','/api/v9/channels/800000000000000002/post-data'); x.onload=()=>resolve(x.status); x.onerror=reject; x.send('{}'); })`);
    let collected = false;
    for (let i = 0; i < 50; i++) {
      const current = await domNodes();
      if (current.some(n => n.nodeValue === '35 discovered · 31 ranked · 4 unavailable')) { collected = true; break; }
      await pause(100);
    }
    assert.ok(collected, 'Real browser bridge must collect both responses');
    const stored = await evaluate(`chrome.storage.local.get('rankingState')`, extensionContext.id);
    assert.equal(stored.rankingState, undefined, 'Rankings must not be persisted');
    const core = require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8') + '; DiscordReactionCore', { URL });
    const fixtureState = { forums: {} };
    for (const [file, suffix] of [['search-response.json', 'threads/search'], ['post-data-response.json', 'post-data']]) {
      const data = JSON.parse(JSON.stringify(file === 'search-response.json' ? search : post));
      for (const batch of core.normalize(data, { forumId: '800000000000000002', kind: suffix }, '800000000000000001')) core.merge(fixtureState, batch);
    }
    const forum = fixtureState.forums['800000000000000001/800000000000000002'];
    assert.deepEqual(errors, [], 'Browser must not report script errors');

    async function domNodes() {
      const { root: document } = await call('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
      const flatten = node => [node, ...(node.children || []).flatMap(flatten), ...(node.shadowRoots || []).flatMap(flatten)];
      return flatten(document);
    }
    const textOf = nodes => nodes.filter(n => n.nodeType === 3).map(n => n.nodeValue).join('\n');
    async function screenshot(name) {
      if (!process.env.SCREENSHOT_DIR) return;
      await call('Emulation.setDeviceMetricsOverride', { width:1280, height:800, deviceScaleFactor:1, mobile:false }, sessionId);
      const image = await call('Page.captureScreenshot', { format:'png', captureBeyondViewport:false }, sessionId);
      const directory = path.resolve(process.env.SCREENSHOT_DIR);
      fs.mkdirSync(directory, { recursive:true });
      fs.writeFileSync(path.join(directory, name), Buffer.from(image.data, 'base64'));
    }
    async function waitForNames(expected) {
      for (let i = 0; i < 40; i++) {
        const current = await domNodes();
        const names = current.filter(n => n.nodeName === 'OPTION').map(n => textOf(n.children || []));
        if (JSON.stringify(names) === JSON.stringify(expected)) return current;
        await pause(100);
      }
      assert.fail(`Dropdown names did not become ${JSON.stringify(expected)}`);
    }
    async function act(node, functionDeclaration, args = []) {
      assert.ok(node, 'Panel control must exist');
      const { object } = await call('DOM.resolveNode', { nodeId: node.nodeId }, sessionId);
      const result = await call('Runtime.callFunctionOn', { objectId: object.objectId,
        functionDeclaration, arguments: args.map(value => ({ value })), returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    }
    let nodes = await waitForNames(['demo-projects 📁']);
    const option = nodes.find(n => n.nodeName === 'OPTION');
    assert.ok(option.attributes.includes('Forum 800000000000000002 · Server 800000000000000001'));
    assert.match(textOf(nodes), /35 discovered · 31 ranked · 4 unavailable/);
    const toggle = nodes.find(n => n.nodeName === 'BUTTON' && n.attributes?.includes('toggle'));
    const countBefore = requests;
    await act(toggle, 'function() { this.click(); }');
    nodes = await domNodes();
    assert.ok(nodes.some(n => n.nodeName === 'BUTTON' && n.attributes?.includes('aria-expanded') && n.attributes.includes('true')));
    assert.equal(requests, countBefore, 'Opening the panel must not initiate requests');
    await screenshot('overview.png');

    // Measure the real shadow-DOM layout rather than only inspecting CSS strings.
    for (const [width, height] of [[1280, 600], [1280, 900], [1280, 1080], [360, 600]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      nodes = await domNodes();
      const layout = await act(nodes.find(n => n.nodeName === 'SECTION'), `function() {
        const bounds = this.getBoundingClientRect();
        const header = this.querySelector('header');
        const list = this.querySelector('.list');
        const top = header.getBoundingClientRect().top;
        list.scrollTop = 100;
        const result = {height:bounds.height, width:bounds.width, top:bounds.top,
          bottom:bounds.bottom, listHeight:list.clientHeight, scrolled:list.scrollTop,
          headerMoved:header.getBoundingClientRect().top !== top,
          aboutOpen:this.querySelector('.about').open,
          detailsOpen:this.querySelector('article details').open};
        list.scrollTop = 0;
        return result;
      }`);
      assert.ok(Math.abs(layout.height - (height - 90)) < 1, JSON.stringify(layout));
      assert.ok(layout.top >= 0 && layout.bottom <= height, 'Panel must fit the viewport');
      assert.ok(layout.width <= width - 32, 'Panel must fit a narrow viewport');
      assert.ok(layout.listHeight > layout.height * 0.55, 'Most panel space should be available for results');
      assert.ok(layout.scrolled > 0 && !layout.headerMoved, 'Only the results should scroll');
      assert.equal(layout.aboutOpen, false);
      assert.equal(layout.detailsOpen, false);
    }
    await call('Emulation.setDeviceMetricsOverride', { width:1280, height:900, deviceScaleFactor:1, mobile:false }, sessionId);
    nodes = await domNodes();
    const firstDisclosure = nodes.find(n => n.nodeName === 'DETAILS' && n.attributes?.includes('data-row-key'));
    const collapsedTitle = await act(firstDisclosure, `function() {
      const title = this.closest('article').querySelector('.title');
      title.textContent = 'A long thread title with many words '.repeat(20);
      return {height:title.clientHeight, fullHeight:title.scrollHeight, lineHeight:parseFloat(getComputedStyle(title).lineHeight)};
    }`);
    assert.ok(collapsedTitle.height <= collapsedTitle.lineHeight * 2 + 1 && collapsedTitle.fullHeight > collapsedTitle.height, 'Collapsed titles must clamp to two lines');
    // Activate native summary with the keyboard and keep that row open through rerenders.
    await call('Page.bringToFront', {}, sessionId);
    await act(firstDisclosure, `function() { this.querySelector('summary').focus(); }`);
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', text:'\r', windowsVirtualKeyCode:13 }, sessionId);
    await call('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 }, sessionId);
    assert.equal(await act(firstDisclosure, 'function() { return this.open; }'), true, 'Details must support keyboard activation');
    const expandedTitle = await act(firstDisclosure, `function() { const title=this.closest('article').querySelector('.title'); return {height:title.clientHeight, fullHeight:title.scrollHeight}; }`);
    assert.ok(expandedTitle.height > collapsedTitle.height && expandedTitle.height >= expandedTitle.fullHeight, 'Expanded rows must show the full title');
    const expandedKey = firstDisclosure.attributes[firstDisclosure.attributes.indexOf('data-row-key') + 1];
    await evaluate(`fetch('/api/v9/channels/800000000000000002/post-data').then(r => r.json())`);
    await pause(50);
    nodes = await domNodes();
    const updatedDisclosure = nodes.find(n => n.nodeName === 'DETAILS' && n.attributes?.includes(expandedKey));
    assert.equal(await act(updatedDisclosure, 'function() { return this.open; }'), true, 'Incoming observations must preserve expanded details');
    const countAfterUpdate = requests;

    const inputSearch = async query => {
      const current = await domNodes();
      await act(current.find(n => n.nodeName === 'INPUT'), `function(query) { this.value = query; this.dispatchEvent(new Event('input')); }`, [query]);
      return domNodes();
    };
    nodes = await inputSearch(' MOD ');
    const expectedTitles = Object.values(forum.threads)
      .sort((a, b) => Number(Boolean(b.message)) - Number(Boolean(a.message))
        || (b.message?.total ?? 0) - (a.message?.total ?? 0) || a.id.localeCompare(b.id))
      .map((row, index) => ({ ...row, rank: index + 1 }))
      .filter(row => [row.title, row.message?.author, row.message?.preview].some(text => (text || '').toLowerCase().includes('mod')))
      .map(row => `${row.message ? `${row.rank}. ` : ''}${row.title || row.message?.preview || `Thread ${row.id}`}`);
    assert.ok(expectedTitles.length > 1, 'Fixture search should exercise ordered results');
    assert.deepEqual(nodes.filter(n => n.nodeName === 'DIV' && n.attributes?.includes('title')).map(n => textOf(n.children || [])), expectedTitles);
    await screenshot('search.png');
    nodes = await inputSearch('no-such-thread-xyz');
    assert.match(textOf(nodes), /No collected threads match your search/);
    nodes = await inputSearch('');
    assert.equal(nodes.filter(n => n.nodeName === 'ARTICLE').length, 35);
    assert.equal(await act(nodes.find(n => n.nodeName === 'DETAILS' && n.attributes?.includes(expandedKey)), 'function() { return this.open; }'), true, 'Search changes must preserve expanded details');
    assert.equal(requests, countAfterUpdate, 'Searching must not initiate requests');

    // A second forum uses the same captured post-data shape, separated by URL.
    await evaluate(`fetch('/api/v9/channels/800000000000000003/post-data').then(r => r.json())`);
    nodes = await waitForNames(['demo-projects 📁', 'Unknown forum']);
    const afterBrowse = requests;
    // Same display name, different IDs; sidebar changes are observed automatically.
    await evaluate(`(() => { const a = document.createElement('a'); a.href='/channels/800000000000000001/800000000000000003'; a.textContent='demo-projects 📁'; document.querySelector('nav').append(a); })()`);
    nodes = await waitForNames(['demo-projects 📁', 'demo-projects 📁']);
    await evaluate(`document.querySelector('#forum-link .name__fixture').textContent='renamed-projects 🎮'`);
    nodes = await waitForNames(['renamed-projects 🎮', 'demo-projects 📁']);
    await act(nodes.find(n => n.nodeName === 'SELECT'), `function(key) { this.value = key; this.dispatchEvent(new Event('change')); }`, ['800000000000000001/800000000000000003']);
    nodes = await domNodes();
    assert.match(textOf(nodes), /10 discovered · 9 ranked · 1 unavailable/);
    assert.equal(nodes.filter(n => n.nodeName === 'BUTTON').length, 1, 'Only the panel toggle should remain');
    await act(nodes.find(n => n.nodeName === 'SELECT'), `function(key) { this.value = key; this.dispatchEvent(new Event('change')); }`, ['800000000000000001/800000000000000002']);
    nodes = await domNodes();
    assert.match(textOf(nodes), /35 discovered · 31 ranked · 4 unavailable/);
    assert.equal(requests, afterBrowse, 'Switching forums must not initiate requests');
    // Navigating away/removing the sidebar must retain saved names and data.
    await evaluate(`history.pushState({}, '', '/channels/800000000000000001/800000000000000003'); document.querySelector('nav').remove()`);
    nodes = await waitForNames(['renamed-projects 🎮', 'demo-projects 📁']);
    const beforeReload = requests;
    assert.equal(beforeReload, afterBrowse, 'Name discovery must not initiate requests');
    // Simulate the legacy extension's persistent cache before migrating/reloading.
    await evaluate(`chrome.storage.local.set({ rankingState: ${JSON.stringify({ version: 1, forums: fixtureState.forums })} })`, extensionContext.id);
    await call('Page.reload', {}, sessionId);
    nodes = await waitForNames(['No forums collected yet']);
    assert.match(textOf(nodes), /0 discovered · 0 ranked · 0 unavailable/, 'Refresh must start empty');
    const reloadedContext = [...contexts.values()].filter(c => c.name === 'Discord Reaction Ranker').at(-1);
    const afterRefresh = await evaluate(`chrome.storage.local.get('rankingState')`, reloadedContext.id);
    assert.equal(afterRefresh.rankingState, undefined, 'Legacy cache must be removed');
    await evaluate(`fetch('/api/v9/channels/800000000000000003/post-data').then(r => r.json())`);
    // The second forum has no sidebar link in the reloaded fixture, so its saved name is reused.
    nodes = await waitForNames(['demo-projects 📁']);
    assert.match(textOf(nodes), /10 discovered · 9 ranked · 1 unavailable/, 'Only newly observed threads should appear');
    assert.deepEqual(errors, [], 'Browser must not report script errors');
    console.log('PASS: browser verified viewport layouts (600/900/1080px + narrow), scrolling, title expansion, keyboard Details, expanded-state retention, collection/search/order, names, refresh reset, and forum switching. No panel API requests.');
  } finally {
    if (call && socket?.readyState === WebSocket.OPEN) {
      try { await call('Browser.close'); } catch { /* Closing may terminate the socket first. */ }
    }
    socket?.close();
    if (child.exitCode === null) child.kill();
    const relativeProfile = path.relative(path.resolve(os.tmpdir()), path.resolve(profile));
    assert.ok(relativeProfile && !relativeProfile.startsWith('..') && !path.isAbsolute(relativeProfile), 'Cleanup must stay within the temporary directory');
    for (let i = 0; i < 20; i++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; }
      catch { await pause(100); }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
