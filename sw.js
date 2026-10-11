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
// Het downloaden van de mp3's gebeurt NIET hier maar in de pagina zelf
// (zie index.html). Reden: Chrome breekt een service worker af zodra één
// event langer dan ~5 minuten bezig is. Bij ~1800 fragmenten gebeurde dat
// steevast halverwege, zonder enige melding — de pagina kreeg geen
// "klaar"-bericht meer, maar onthield wél de laatst doorgegeven stand en
// dacht daardoor dat alles gedownload was. Offline bleek dan ineens een
// deel van de woorden te ontbreken. Zolang de app open staat kan de
// pagina gewoon doordownloaden.
//
// Deze service worker doet dus alleen nog: de app-schil cachen en alles
// cache-first serveren. Individuele mp3's die nog niet in de cache zitten
// worden bij het afspelen nooit via een mobiel netwerk opgehaald.
//
// Een nieuwe versie van deze service worker installeert zichzelf wel
// meteen, maar neemt het bewust NIET uit zichzelf over (geen skipWaiting
// in install). De pagina merkt dat er een versie klaarstaat, vraagt de
// gebruiker of hij wil bijwerken, en stuurt pas daarna "SKIP_WAITING".
const CACHE_VERSION = "cfd4773fbc24-voice2";
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

// true zolang we niet zeker weten dat het mobiel internet is. Wordt alleen
// gebruikt om te voorkomen dat een los, nog niet gedownload fragment
// tijdens het spelen alsnog over een mobiel netwerk opgehaald wordt.
function isWifiOk() {
  const c = self.navigator && self.navigator.connection;
  if (!c || !c.type) return true;
  return c.type === "wifi";
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE_NAME);
    // cache: "reload" zodat de app-schil gegarandeerd van het netwerk komt
    // en niet uit de gewone http-cache van de browser. GitHub Pages laat
    // bestanden een tijdje cachen; zonder dit kon een net geïnstalleerde
    // "nieuwe" versie alsnog de oude index.html bevatten.
    await cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: "reload" })));
    // Geen skipWaiting() hier: deze versie blijft in "waiting" staan tot de
    // gebruiker in de app op "Nu bijwerken" tikt. Zie de message-handler.
  })());
});

// De pagina vraagt om de overname zodra de gebruiker akkoord is, en kan de
// versie opvragen om die in het instellingenscherm te tonen.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (data.type === "GET_VERSION" && event.ports && event.ports[0]) {
    event.ports[0].postMessage(CACHE_VERSION);
  }
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Download-opdracht van de pagina zelf: niet onderscheppen. De pagina
  // beheert de mp3-synchronisatie en heeft de wifi-afweging al gemaakt;
  // zou deze handler hem oppakken, dan werd het verzoek hieronder
  // geblokkeerd of uit de cache beantwoord in plaats van opgehaald.
  if (event.request.headers.get("x-mp3-sync")) return;

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
