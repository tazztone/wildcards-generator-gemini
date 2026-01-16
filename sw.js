// Service Worker for AI-Powered Wildcard Generator

// TODO: Implement versioned caching strategy with automatic cache invalidation

// TODO: Add cache size monitoring and cleanup for storage management

const CACHE_NAME = 'wildcards-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './wildcards.js',
    './css/wildcards.css',
    './config/config.json',
    './data/initial-data.yaml',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js'
];

// Install: cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Network-first for API calls
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('openrouter.ai') ||
        url.pathname.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => new Response(JSON.stringify({ error: 'Offline - API unavailable' }), {
                    headers: { 'Content-Type': 'application/json' }
                }))
        );
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request)
                .then(response => {
                    // Cache successful responses
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
            )
    );
});
