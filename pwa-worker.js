/*
Copyright 2015, 2019, 2020 Google LLC. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

// Bump SW_VERSION on every deploy that changes static asset hashes.
// The activate step deletes any cache whose name does not match, so
// stale app.bundle / chunk caches from a previous SW generation can
// never be served to a freshly loaded page (avoids ChunkLoadError loops).
const SW_VERSION = 'malka-vrs-v2';
const CACHE_NAME = `${SW_VERSION}-offline`;

// Customize this with a different URL if needed.
const OFFLINE_URL = 'static/offline.html';

self.addEventListener('install', event => {
    event.waitUntil(
    (async () => {
        const cache = await caches.open(CACHE_NAME);


        // Setting {cache: 'reload'} in the new request will ensure that the
        // response isn't fulfilled from the HTTP cache; i.e., it will be from
        // the network.
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    })()
    );

    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
    (async () => {
        // Purge any caches left over from previous SW generations. This is
        // what actually breaks the ChunkLoadError loop after a deploy: the
        // browser can no longer serve a stale app.bundle whose chunk hashes
        // are no longer present on the server.
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => {
            if (name !== CACHE_NAME) {
                return caches.delete(name);
            }
            return undefined;
        }));

        // Enable navigation preload if it's supported.
        // See https://developers.google.com/web/updates/2017/02/navigation-preload
        if ('navigationPreload' in self.registration) {
            await self.registration.navigationPreload.enable();
        }
    })()
    );

    // Tell the active service worker to take control of the page immediately.
    self.clients.claim();
});

// Allow the page to imperatively clear all caches + skip-waiting when it
// detects a ChunkLoadError. The page posts { type: 'RESET_CACHES' } and
// we nuke everything we control, then force any waiting SW to activate.
self.addEventListener('message', event => {
    if (!event.data || typeof event.data !== 'object') {
        return;
    }

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    if (event.data.type === 'RESET_CACHES') {
        event.waitUntil((async () => {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            // Inform the page it can reload once caches are gone.
            const clients = await self.clients.matchAll({ includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: 'CACHES_RESET' });
            }
        })());
    }
});

self.addEventListener('fetch', event => {
    // We only want to call event.respondWith() if this is a navigation request
    // for an HTML page.
    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                // First, try to use the navigation preload response if it's supported.
                const preloadResponse = await event.preloadResponse;

                if (preloadResponse) {
                    return preloadResponse;
                }

                // Always try the network first.
                const networkResponse = await fetch(event.request);

                return networkResponse;
            } catch (error) {
                // catch is only triggered if an exception is thrown, which is likely
                // due to a network error.
                // If fetch() returns a valid HTTP response with a response code in
                // the 4xx or 5xx range, the catch() will NOT be called.
                console.log('Fetch failed; returning offline page instead.', error);

                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(OFFLINE_URL);

                return cachedResponse;
            }
        })());
    }

    // If our if() condition is false, then this fetch handler won't intercept the
    // request. If there are any other fetch handlers registered, they will get a
    // chance to call event.respondWith(). If no fetch handlers call
    // event.respondWith(), the request will be handled by the browser as if there
    // were no service worker involvement.
});
