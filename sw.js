const CACHE = 'dartliga-pwa-v1.9.3';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=1.9.3',
  './app.js?v=1.9.3',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request, {cache:'no-store'});
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : Response.error());
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  if (url.origin === self.location.origin && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') {
        caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      }
      return response;
    }))
  );
});
