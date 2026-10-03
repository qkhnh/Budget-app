// sw.js
// Makes the app work offline.
// - On install it saves the app files on the phone.
// - Online: always fetch the newest file and refresh the saved copy (so updates just work).
//   GitHub Pages lets browsers reuse a file for 10 minutes, so every fetch asks GitHub whether the
//   file changed ('no-cache'); unchanged files come back as a tiny "not modified" answer.
// - Offline: serve the saved copy.
// Budget data is NOT stored here. It lives in localStorage, which this file never touches.

const CACHE = 'budget-shell';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './ui.js',
  './views.js',
  './sheets.js',
  './styles.css',
  './budget-core.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  const fresh = SHELL.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req.url, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
