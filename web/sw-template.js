'use strict';
const VERSION = __VERSION__;
const CORE = __CORE__;
const CACHE = 'ginomai-web-' + VERSION;
const BASE = new URL('./', self.location.href);
const paths = new Set(CORE.map(file => new URL(file, BASE).pathname));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE.map(file => new URL(file, BASE).href))));
  // Updates wait until the service's controller and output have closed.
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('ginomai-web-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin) return;
  if (url.pathname === BASE.pathname) url.pathname += 'index.html';
  if (!paths.has(url.pathname)) return;
  url.search = '';
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(url.href)) || fetch(event.request);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_STATUS') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const missing = [];
    for (const file of CORE) if (!await cache.match(new URL(file, BASE).href)) missing.push(file);
    event.ports[0]?.postMessage({ready: missing.length === 0, version: VERSION, missing});
  })());
});
