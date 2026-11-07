// Service worker: lets the home-screen app open with no signal.
// - Pages: network first, falling back to the cached app page.
// - Built files (hashed names), icons, fonts: cache first.
// - Supabase and rate requests are never cached here; the app keeps its own
//   copy of the data and queues new expenses while offline.
const CACHE = 'travelspend-v1';
const BASE = '/travel.spd/';
const SHELL = [BASE, BASE + 'manifest.webmanifest', BASE + 'icons/apple-touch-icon.png', BASE + 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// The page reports the bundle files it loaded, so the very first visit is
// enough to work offline afterwards. Older bundles are dropped.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'CACHE_URLS') return;
  const urls = event.data.urls.filter((u) => typeof u === 'string' && u.startsWith(BASE));
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await Promise.all(urls.map((u) => c.add(u).catch(() => {})));
      const keep = new Set(urls.map((u) => new URL(u, self.location.origin).href));
      for (const req of await c.keys()) {
        if (req.url.includes('/_expo/static/') && !keep.has(req.url)) await c.delete(req);
      }
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Static legal pages are not the app shell: never cache them as BASE
          if (!/\/(privacy|terms)\.html$/.test(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(BASE, copy));
          }
          return res;
        })
        .catch(() => caches.match(BASE)),
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
