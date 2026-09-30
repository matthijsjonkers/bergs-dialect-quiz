// Service worker: cachet de app-schil + alle losse mp3's zodat de quiz
// daarna 100% offline werkt (nodig voor ~4000 fragmenten — te veel om,
// zoals eerder, als base64 in één HTML-bestand te bakken).
//
// CACHE_VERSION wordt door build.js automatisch vervangen door een hash
// van words.json, zodat een nieuwe/gewijzigde woordenlijst vanzelf een
// nieuwe cache-versie triggert (oude core-cache wordt in activate() opgeruimd).
//
// De mp3's zelf staan in een aparte, NIET-geversioneerde cache
// (MP3_CACHE_NAME). Zo hoeven al gedownloade woorden niet opnieuw
// opgehaald te worden telkens als er een nieuwe woordenlijst is (dat zou
// onnodig veel mobiele data kosten).
//
// Mp3's worden alleen gedownload op verzoek van de pagina (bericht
// "sync-mp3s"), en de pagina stuurt dat verzoek alleen als er wifi is
// gedetecteerd. Als de verbinding tijdens het downloaden wisselt naar
// mobiel, stopt de synchronisatie. Individuele mp3's die nog niet in de
// cache zitten worden bij het afspelen ook nooit via mobiel netwerk
// opgehaald.
const CACHE_VERSION = "cfd4773fbc24-mp3sync5";
const CORE_CACHE_NAME = "bergs-quiz-core-" + CACHE_VERSION;
const MP3_CACHE_NAME = "bergs-quiz-mp3s";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon/icon_192.png",
  "./icon/icon_512.png",
  "./words.json"
];

async function broadcast(message) {
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  clientsList.forEach((client) => client.postMessage(message));
}

// true zolang we niet zeker weten dat het mobiel internet is — de pagina
// heeft de trigger voor sync-mp3s al gegeven op basis van een bevestigde
// wifi-verbinding; dit is alleen een extra check om te stoppen als de
// verbinding tijdens het downloaden wisselt naar mobiel.
function isWifiOk() {
  const c = self.navigator && self.navigator.connection;
  if (!c || !c.type) return true;
  return c.type === "wifi";
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
    const cache = await caches.open(CORE_CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.indexOf("bergs-quiz-core-") === 0 && k !== CORE_CACHE_NAME)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

let syncRunning = false;

async function syncMp3s(force) {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const mp3Cache = await caches.open(MP3_CACHE_NAME);
    const wordsRes = await fetch("./words.json");
    const words = await wordsRes.json();

    let done = 0;
    let failed = 0;
    let stoppedForCellular = false;
    const total = words.length;
    broadcast({ type: "cache-progress", done: 0, total: total, finished: false });

    await mapLimit(words, 6, async (word) => {
      if (!force && !isWifiOk()) { stoppedForCellular = true; return; }
      try {
        const already = await mp3Cache.match(word.file);
        if (!already) {
          const res = await fetch(word.file);
          if (res.ok) {
            await mp3Cache.put(word.file, res);
          } else {
            failed++;
          }
        }
      } catch (e) {
        failed++;
      }
      done++;
      if (done % 10 === 0 || done === total) {
        broadcast({ type: "cache-progress", done: done, total: total, finished: false });
      }
    });

    // Alleen echt "klaar" als alles gelukt is — niet elk mislukt fragment
    // stilletjes negeren, anders lijkt het net alsof offline gebruik werkt
    // terwijl er losse woorden ontbreken in de cache.
    broadcast({
      type: "cache-progress",
      done: done,
      total: total,
      finished: !stoppedForCellular && failed === 0,
      stoppedForCellular: stoppedForCellular,
      failed: failed
    });
  } finally {
    syncRunning = false;
  }
}

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "sync-mp3s") return;
  const promise = syncMp3s(!!event.data.force);
  if (event.waitUntil) event.waitUntil(promise);
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const isMp3 = event.request.url.indexOf("/mp3/") !== -1;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    // Niet gecachet mp3 en geen (bevestigde) wifi: niet via mobiel netwerk
    // ophalen om geen mobiele data te verbruiken.
    if (isMp3 && !isWifiOk()) {
      return new Response(null, { status: 503, statusText: "Wifi vereist om dit woord op te halen" });
    }

    try {
      return await fetch(event.request);
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
