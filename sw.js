// Service worker: lets the home-screen app open instantly, with or without signal.
// - The app page is served from the cache straight away (no waiting for the
//   network, which on a weak signal can take a minute). In the background the
//   latest page is fetched together with every file it loads; only when all of
//   them are stored does it replace the cached copy, so the next launch gets the
//   new version and can never find a file missing. Open pages are told so they
//   can offer to reload.
// - Built files (hashed names), icons, fonts: cache first.
// - privacy.html and terms.html are never cached as the app page.
// - Supabase and rate requests are never cached here; the app keeps its own
//   copy of the data and queues new expenses while offline.
const CACHE = 'travelspend-v1';
const BASE = '/travel.spd/';
const SHELL = [BASE + 'manifest.webmanifest', BASE + 'icons/apple-touch-icon.png', BASE + 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => refreshApp())
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/** The app files a page loads (scripts, styles, preloads), as same-site paths. */
function filesOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"]+)"/g)) {
    const u = m[1];
    if (u.startsWith(BASE) && !/\.(html|webmanifest)$/.test(u)) out.add(u);
  }
  return [...out];
}

let refreshing = null;
/**
 * Fetches the latest app page and stores it with all its files. Returns true
 * when the cached page changed (a new version is ready for the next launch).
 */
function refreshApp() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const res = await fetch(BASE, { cache: 'no-store' });
    if (!res.ok) return false;
    const html = await res.clone().text();
    const c = await caches.open(CACHE);
    const old = await c.match(BASE);
    if (old && (await old.text()) === html) return false;
    const files = filesOf(html);
    // Every file first: if one can't be fetched, keep the old version
    for (const f of files) if (!(await c.match(f))) await c.add(f);
    await c.put(BASE, res);
    const keep = new Set(files.map((f) => new URL(f, self.location.origin).href));
    for (const req of await c.keys()) {
      if (req.url.includes('/_expo/static/') && !keep.has(req.url)) await c.delete(req);
    }
    return !!old;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function tellPagesUpdated() {
  for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'APP_UPDATED' });
}

// Older pages still send the files they loaded; caching the page covers that now
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    event.waitUntil(refreshApp().then((changed) => changed && tellPagesUpdated()).catch(() => {}));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    // Legal pages and other real files: straight from the network
    if (/\.[a-z0-9]+$/i.test(url.pathname)) return;
    event.respondWith(
      (async () => {
        const cached = await caches.match(BASE);
        const update = refreshApp()
          .then((changed) => changed && tellPagesUpdated())
          .catch(() => {});
        if (cached) {
          event.waitUntil(update);
          return cached;
        }
        // First visit: nothing stored yet
        try {
          return await fetch(req);
        } catch (e) {
          await update;
          return (await caches.match(BASE)) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.includes('/_expo/') || url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
