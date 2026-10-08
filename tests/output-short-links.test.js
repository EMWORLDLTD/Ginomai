'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { once } = require('node:events');

test('short output routes retain each destination and support existing URLs', async t => {
  const { server } = require('../server');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const destinations = {
    '/live': '/display.html?target=obs',
    '/livestream': '/display.html?target=livestream',
    '/projector': '/display.html?target=sanctuary',
    '/stage': '/display.html?target=stage',
    '/overlay': '/display.html?target=livestream&layout=lt',
    '/auto': '/display.html?target=auto',
    '/remote': '/index.html?remote=1'
  };
  for (const [route, destination] of Object.entries(destinations)) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 302, route);
    assert.equal(response.headers.get('location'), destination);
    const output = await fetch(base + route);
    assert.equal(output.status, 200, route);
    assert.equal(new URL(output.url).pathname + new URL(output.url).search, destination);
    await output.arrayBuffer();
  }
  const extra = await fetch(base + '/overlay/?preview=1&target=stage', { method: 'HEAD', redirect: 'manual' });
  assert.equal(extra.headers.get('location'), '/display.html?target=livestream&layout=lt&preview=1');
  assert.equal((await fetch(base + '/display.html?target=livestream&layout=lt', { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(base + '/server.js')).status, 403);
});

test('hub copy, preview, QR, and clipboard fallback use readable output links', async () => {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const functionSource = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  const copied = [], opened = [], elements = new Map();
  for (const id of ['url-sanctuary', 'url-livestream', 'url-auto', 'url-remote', 'hub-qr-url-text', 'hub-qr-img']) elements.set(id, {});
  const context = vm.createContext({
    window: { location: { origin: 'http://localhost:8500', pathname: '/index.html', port: '8500', protocol: 'http:' }, open(url) { opened.push(url); } },
    customLanIp: '192.168.1.175', serverBoundPort: 8500,
    navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
    showToast() {},
    document: {
      getElementById(id) { return elements.get(id) || null; },
      createElement() { return { style: {}, select() { copied.push(this.value); }, remove() {} }; },
      body: { appendChild() {} }, execCommand() { return true; }
    }
  });
  vm.runInContext([
    functionSource('function getBaseDisplayUrl(', 'function openBroadcastHub('),
    functionSource('function getRemoteControlUrl(', 'function updateLanIpHost('),
    functionSource('function openOutputLink(', 'function openRemoteControl('),
    functionSource('function copyOutputLink(', '// Stage Preview Controls')
  ].join('\n'), context);
  const routes = { obs: 'live', sanctuary: 'projector', stage: 'stage', '?target=livestream&layout=lt': 'overlay' };
  for (const [target, name] of Object.entries(routes)) {
    await vm.runInContext(`copyOutputLink(${JSON.stringify(target)})`, context);
    assert.equal(copied.pop(), `http://192.168.1.175:8500/${name}`);
    vm.runInContext(`openOutputLink(${JSON.stringify(target)})`, context);
    assert.equal(opened.pop(), `http://localhost:8500/${name}`);
  }
  vm.runInContext('updateOutputLinksModal(customLanIp)', context);
  assert.equal(elements.get('url-sanctuary').value, 'http://192.168.1.175:8500/projector');
  assert.equal(elements.get('url-remote').value, 'http://192.168.1.175:8500/remote');
  assert.equal(elements.get('hub-qr-url-text').textContent, 'http://192.168.1.175:8500/remote');
  assert.match(elements.get('hub-qr-img').src, /data=http%3A%2F%2F192\.168\.1\.175%3A8500%2Fremote$/);
  context.navigator.clipboard = null;
  vm.runInContext('copyOutputLink("stage")', context);
  assert.equal(copied.pop(), 'http://192.168.1.175:8500/stage');
  context.window.location = { protocol: 'file:', origin: 'null', port: '', pathname: '/app/index.html', href: 'file:///app/index.html' };
  assert.equal(vm.runInContext('getOutputUrl("sanctuary")', context), 'file:///app/display.html?target=sanctuary');
});
