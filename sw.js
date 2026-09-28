// Service worker: cachet de app-schil + alle losse mp3's zodat de quiz
// daarna 100% offline werkt (nodig voor ~4000 fragmenten — te veel om,
// zoals eerder, als base64 in één HTML-bestand te bakken).
//
// CACHE_VERSION wordt door build.js automatisch vervangen door een hash
// van words.json, zodat een nieuwe/gewijzigde woordenlijst vanzelf een
// nieuwe cache-versie triggert (oude cache wordt in activate() opgeruimd).
const CACHE_VERSION = "cfd4773fbc24-icon2";
const CACHE_NAME = "bergs-quiz-" + CACHE_VERSION;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./words.json"
];

async function broadcast(message) {
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  clientsList.forEach((client) => client.postMessage(message));
}

// Voert fn uit voor elk item, met maximaal `limit` gelijktijdig — voorkomt
// dat we bij duizenden mp3's alles in één keer tegelijk gaan opvragen.
function mapLimit(items, limit, fn) {
  return new Promise((resolve) => {
    let index = 0;
    let active = 0;
    let doneCount = 0;

    function next() {
      if (doneCount >= items.length) { resolve(); return; }
      while (active < limit && index < items.length) {
        const item = items[index++];
        active++;
        fn(item).catch(function () {}).then(function () {
          active--;
          doneCount++;
          next();
        });
      }
    }
    next();
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);

    const wordsRes = await fetch("./words.json");
    const words = await wordsRes.json();

    let done = 0;
    const total = words.length;
    broadcast({ type: "cache-progress", done: 0, total: total, finished: false });

    await mapLimit(words, 6, async (word) => {
      const res = await fetch(word.file);
      if (res.ok) await cache.put(word.file, res);
      done++;
      if (done % 10 === 0 || done === total) {
        broadcast({ type: "cache-progress", done: done, total: total, finished: false });
      }
    });

    broadcast({ type: "cache-progress", done: total, total: total, finished: true });
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      return await fetch(event.request);
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
