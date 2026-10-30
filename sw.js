// Offline support: the app shell is cached on install, fonts are cached the
// first time they load. The cache is named after the version in js/version.js:
// bump that when shipping changes to cached files.

importScripts('js/version.js');
const CACHE = `dartscore-v${self.DARTSCORE_VERSION}`;

const APP_SHELL = [
	'./',
	'index.html',
	'manifest.json',
	'css/styles.css',
	'js/app.js',
	'js/board.js',
	'js/checkout.js',
	'js/clock.js',
	'js/config.js',
	'js/dartboard.js',
	'js/doubles.js',
	'js/feedback.js',
	'js/game.js',
	'js/history.js',
	'js/match.js',
	'js/modes.js',
	'js/one21.js',
	'js/stats.js',
	'js/storage.js',
	'js/version.js',
	'images/icons/icon-192.png',
	'images/icons/icon-512.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
	event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', event => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	const sameOrigin = url.origin === self.location.origin;
	if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;

	// Serve from cache straight away, refresh it in the background.
	event.respondWith(
		caches.open(CACHE).then(async cache => {
			const cached = await cache.match(request, { ignoreSearch: sameOrigin });
			const network = fetch(request)
				.then(response => {
					if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
					return response;
				})
				.catch(() => cached);
			if (cached) {
				event.waitUntil(network);
				return cached;
			}
			return network;
		}),
	);
});
