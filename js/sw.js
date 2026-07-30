
// ============================================================
// StudyStudio — Service Worker
// Caches the app shell (HTML/CSS/JS/icons/manifest) so the app
// still loads with no network connection. Everything else
// (Gemini/Groq API calls, KaTeX CDN, Google Fonts, YouTube embeds)
// is explicitly left to the network — this is a study-tools shell,
// not an offline AI proxy, and trying to cache third-party API
// responses would be both useless (they're per-request) and risky
// (stale cached API keys/quotas make no sense to serve back).
//
// Bump CACHE_VERSION whenever any shell file changes so clients
// pick up the new version instead of serving a stale cached copy
// forever — the activate handler below deletes any old-versioned
// cache automatically.
// ============================================================

const CACHE_VERSION = 'studystudio-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/themes.css',
  './js/config.js',
  './js/api.js',
  './js/utils.js',
  './js/themes.js',
  './js/srs.js',
  './js/scores.js',
  './js/export.js',
  './js/deck.js',
  './js/socratic.js',
  './js/maker.js',
  './js/side-tutor.js',
  './js/gwa.js',
  './js/planner.js',
  './js/notes.js',
  './js/pomodoro.js',
  './js/watch.js',
  './js/dashboard.js',
  './js/settings.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
  );
  // Activate this version immediately rather than waiting for every
  // open tab to close — a study app benefits more from "always the
  // latest shell on next reload" than from strict tab-versioning.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever intervene for same-origin GET requests. Anything to
  // another origin (AI provider APIs, KaTeX/font CDNs, YouTube) goes
  // straight to the network untouched — this worker has no opinion
  // about third-party traffic at all.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          // Keep the shell cache warm with whatever the network last
          // returned, so the next offline load reflects the latest
          // successfully-fetched version of each file.
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached); // offline and not cached: nothing we can do

      // Cache-first for instant offline loads; network still runs in
      // the background to refresh the cache for next time.
      return cached || networkFetch;
    })
  );
});
