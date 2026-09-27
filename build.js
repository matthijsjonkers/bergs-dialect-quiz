// Genereert words.json: een lijst van alle mp3's in de map "mp3", als
// {id, file}. De mp3's zelf blijven gewoon losse bestanden — bij ~4000
// stuks is base64-inbakken in één HTML-bestand niet meer haalbaar
// (te groot om nog soepel te laden op een telefoon).
//
// Zet daarnaast een cache-versie (hash van de woordenlijst) in sw.js,
// zodat de service worker automatisch weet dat hij opnieuw moet cachen
// zodra je mp3's toevoegt/verwijdert en dit script opnieuw draait.
//
// Gebruik: node build.js
// Draai dit opnieuw elke keer als je mp3's toevoegt aan de map "mp3".

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const MP3_DIR = path.join(ROOT, "mp3");
const WORDS_PATH = path.join(ROOT, "words.json");
const SW_PATH = path.join(ROOT, "sw.js");
const VERSION_MARKER = "__CACHE_VERSION__";

function main() {
  const files = fs.readdirSync(MP3_DIR)
    .filter((name) => name.toLowerCase().endsWith(".mp3"))
    .sort();

  if (!files.length) {
    throw new Error("Geen mp3-bestanden gevonden in " + MP3_DIR);
  }

  const words = files.map((name) => ({
    id: path.basename(name, path.extname(name)),
    file: "mp3/" + name
  }));

  const json = JSON.stringify(words);
  fs.writeFileSync(WORDS_PATH, json, "utf8");

  const hash = crypto.createHash("sha256").update(json).digest("hex").slice(0, 12);

  let sw = fs.readFileSync(SW_PATH, "utf8");
  sw = sw.replace(/const CACHE_VERSION = "[^"]*";/, 'const CACHE_VERSION = "' + hash + '";');
  fs.writeFileSync(SW_PATH, sw, "utf8");

  console.log("words.json gegenereerd met " + words.length + " woorden.");
  console.log("sw.js cache-versie bijgewerkt naar " + hash + ".");
}

main();
