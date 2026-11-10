// Level UP offline helper (a "service worker"). It keeps a copy of the app's own files on the device so Level UP can
// open with no signal. Rules, kept deliberately simple:
//  - Only this site's own files are kept. Google sign-in and the Level UP server are NEVER touched or stored.
//  - The page itself (index.html) and config.js: fetched fresh whenever there is a connection; the saved copy is used
//    only when the network fails or takes longer than 4 seconds. So an update shows up on the next online visit.
//  - Program files in assets/ have a unique name per version, so a saved copy is always correct. Copies no longer
//    used by the current page are removed.
const LEVEL_UP_CACHE = 'levelup-app-v1';
const NETWORK_WAIT_MS = 4000;

function scopePath() {
  return new URL(self.registration.scope).pathname;
}

function assetUrlsIn(html, base) {
  const out = new Set();
  const re = /(?:src|href)="(\.\/assets\/[^"]+|assets\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.add(new URL(m[1], base).href);
  return out;
}

async function rememberPage(response, url) {
  const cache = await caches.open(LEVEL_UP_CACHE);
  const html = await response.clone().text();
  await cache.put(url, response.clone());
  // Keep only the program files this version of the page uses.
  const keep = assetUrlsIn(html, url);
  for (const req of await cache.keys()) {
    if (new URL(req.url).pathname.indexOf(scopePath() + 'assets/') === 0 && !keep.has(req.url)) await cache.delete(req);
  }
  // Make sure every program file the page needs is saved (the first visit happens before this helper is active).
  await Promise.all([...keep].map(async (href) => { if (!(await cache.match(href))) { try { await cache.add(href); } catch { /* next visit */ } } }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const root = new URL(self.registration.scope).href;
      const page = await fetch(root, { cache: 'no-store' });
      if (page.ok) await rememberPage(page, root);
      const cache = await caches.open(LEVEL_UP_CACHE);
      await cache.addAll(['config.js', 'manifest.webmanifest', 'icon.svg'].map((p) => new URL(p, root).href));
    } catch { /* offline during install: the next online visit fills the cache */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.indexOf('levelup-app-') === 0 && key !== LEVEL_UP_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirst(request, cacheKey, isPage) {
  try {
    const response = await withTimeout(fetch(request, { cache: 'no-store' }), NETWORK_WAIT_MS);
    if (response.ok) {
      if (isPage) await rememberPage(response, cacheKey);
      else await (await caches.open(LEVEL_UP_CACHE)).put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(LEVEL_UP_CACHE);
    const saved = (await cache.match(cacheKey)) || (isPage ? await cache.match(new URL(self.registration.scope).href) : undefined);
    if (saved) return saved;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(LEVEL_UP_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(scopePath()) !== 0) return; // never Google, never the server
  const path = url.pathname.slice(scopePath().length);
  if (path.indexOf('test/') === 0) return; // the Phase 0 diagnostic page is always live
  const key = url.origin + url.pathname; // the part after # never reaches the network anyway
  if (request.mode === 'navigate' || path === '' || path === 'index.html') { event.respondWith(networkFirst(request, url.origin + scopePath(), true)); return; }
  if (path.indexOf('assets/') === 0) { event.respondWith(cacheFirst(request)); return; }
  event.respondWith(networkFirst(request, key, false));
});
