// Genereert de PWA-iconen (icon-192.png / icon-512.png): een simpel
// rood/groen vlak, zelfde kleuren als het buzzerpaneel in de app.
// Draai dit script eenmalig (de iconen hoeven niet opnieuw gemaakt te
// worden als je alleen mp3's toevoegt).

const fs = require("fs");
const path = require("path");
const { makePng } = require("./png-writer");

const RED = [0xb2, 0x31, 0x27];
const GREEN = [0x1e, 0x8a, 0x4c];

function pixelAt(x, y, size) {
  return y < size / 2 ? RED : GREEN;
}

[192, 512].forEach((size) => {
  const buf = makePng(size, size, (x, y) => pixelAt(x, y, size));
  const outPath = path.join(__dirname, "icon-" + size + ".png");
  fs.writeFileSync(outPath, buf);
  console.log("Geschreven: " + outPath + " (" + buf.length + " bytes)");
});
