/* Cache the shell so the app opens on a tablet with no wi-fi.
   Bump CACHE when any shell file changes. */
const CACHE = 'tidyup-v9';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/idb.js',
  './js/store.js',
  './js/chime.js',
  './js/icons.js',
  './js/qr.js',
  './js/kid.js',
  './js/parent.js',
  './js/backup.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
