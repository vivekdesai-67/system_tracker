const CACHE_NAME = 'systemcall-v1';
const ASSETS = [
    '/css/design-system.css',
    '/js/magnetic-buttons.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    // Basic network-first strategy for a dynamic app
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
