// Versioned app-shell cache. Content and audio live in IndexedDB, never here.
const VERSION = "p6-2026-11-12-2";
const CACHE = `german-trainer-${VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./js/app.js",
  "./js/audio.js",
  "./js/backup.js",
  "./js/db.js",
  "./js/exam-format.js",
  "./js/exam.js",
  "./js/findings.js",
  "./js/main.js",
  "./js/matching.js",
  "./js/mercury.js",
  "./js/metrics.js",
  "./js/migrate.js",
  "./js/pack-import.js",
  "./js/planner.js",
  "./js/progress.js",
  "./js/readiness.js",
  "./js/scoring.js",
  "./js/session.js",
  "./js/settings.js",
  "./js/srs.js",
  "./js/state.js",
  "./js/zip.js",
  "./js/ui/components.js",
  "./js/ui/dom.js",
  "./js/ui/exam-run.js",
  "./js/ui/exercise.js",
  "./js/ui/grammar.js",
  "./js/ui/more.js",
  "./js/ui/schreiben.js",
  "./js/ui/session.js",
  "./js/ui/simulator.js",
  "./js/ui/sprechen.js",
  "./js/ui/timer.js",
  "./js/ui/today.js",
  "./js/ui/train.js",
  "./js/ui/vocab.js",
  "./js/ui/vocab-card.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(request)),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
