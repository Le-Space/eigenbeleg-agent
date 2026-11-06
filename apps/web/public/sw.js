// SPDX-License-Identifier: AGPL-3.0-or-later
// The service worker: the whole app offline, nothing else. As in Le Space
// Belege (src/service-worker.js there), it caches only this page's own files:
// never a response from a data source (they carry addresses), never a
// document. On install it loads every file of the build (PRECACHE: the page,
// its script and the PDF code, the fonts, icons, manifest), so the installed
// app starts and draws documents without having been used online first;
// reading a chain still needs the network. A new version waits until every tab
// of the page is closed or reloaded, so a running document is never cut off.
//
//   the page (navigation)   network first, the cached copy when offline
//   ./assets/* (hashed)      cache first: a hashed file never changes
//   other own files          network first (icons, manifest, social cards)

// Filled in by the build (apps/web/vite.config.js): every file of dist/, and a
// version that changes with them, so a new build gets a fresh cache.
const PRECACHE = /** @type {string[]} */ ([]);
const CACHE = 'eigenbeleg-dev';
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const scope = new URL(sw.registration.scope);

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.length ? PRECACHE : ['./', './manifest.webmanifest', './favicon.svg'])));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key.startsWith('eigenbeleg-') && key !== CACHE) await caches.delete(key);
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
	const hashed = url.pathname.startsWith(`${scope.pathname}assets/`);
	event.respondWith(hashed ? cacheFirst(req) : networkFirst(req));
});

/** @param {Request} req */
async function cacheFirst(req) {
	const cache = await caches.open(CACHE);
	const hit = await cache.match(req);
	if (hit) return hit;
	const res = await fetch(req);
	if (res.ok) await cache.put(req, res.clone());
	return res;
}

/** @param {Request} req */
async function networkFirst(req) {
	const cache = await caches.open(CACHE);
	try {
		const res = await fetch(req);
		if (res.ok) await cache.put(req.mode === 'navigate' ? './' : req, res.clone());
		return res;
	} catch {
		const hit = await cache.match(req.mode === 'navigate' ? './' : req);
		if (hit) return hit;
		throw new Error('offline and not cached');
	}
}
