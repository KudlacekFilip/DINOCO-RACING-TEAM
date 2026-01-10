import fs from "node:fs";
import path from "node:path";

const ASSETS_DIR = path.join(process.cwd(), "assets");
const OUT_FILE = path.join(ASSETS_DIR, "archive-manifest.json");

// Povolené přípony
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

function inferTypeFromExt(ext) {
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "unknown";
}

// Očekávaný název: NN__YYYY-MM-DD__TYPE.ext
const re = /^(\d{2,})__(\d{4}-\d{2}-\d{2})__(image|video|text)\.[^.]+$/i;

function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`Složka assets neexistuje: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const EXCLUDE_PREFIXES = ["tape_", "cassette_", "kazeta_"];

const files = fs
  .readdirSync(ASSETS_DIR)
  .filter(f => !EXCLUDE_PREFIXES.some(p => f.startsWith(p)));
  

  const items = files
    .filter((f) => !f.startsWith("."))
    .map((filename) => {
      const ext = path.extname(filename).toLowerCase();
      const baseType = inferTypeFromExt(ext);

      const m = filename.match(re);

      // Když nesedí naming convention, zkusíme aspoň typ z přípony
      if (!m) {
        // ignoruj věci co nejsou obraz/video
        if (baseType === "unknown") return null;

        return {
          title: path.basename(filename, ext), // fallback: celý název bez ext
          date: "1970-01-01",
          type: baseType,
          mediaSrc: `assets/${filename}`
        };
      }

      const num = m[1];      // "01"
      const date = m[2];     // "2026-01-01"
      const type = m[3].toLowerCase(); // image|video|text

      // text položka může být bez média – pokud ale má soubor, necháme ho jako mediaSrc
      const mediaSrc = type === "text" ? "" : `assets/${filename}`;

      return {
        title: num,
        date,
        type,
        mediaSrc
      };
    })
    .filter(Boolean)
    // seřazení: podle čísla (NN) primárně, pak datum
    .sort((a, b) => {
      const na = parseInt(a.title, 10);
      const nb = parseInt(b.title, 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return (a.date || "").localeCompare(b.date || "");
    });

  fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2), "utf8");
  console.log(`Manifest vygenerován: assets/archive-manifest.json (${items.length} položek)`);
}

main();
