// generate-manifest.mjs
// Naming: CISLO__ROK__image|video.ext  (rok = YYYY)
// příklady:
// 001__2024__image.jpg
// 12__2023__video.mp4

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

// Očekávaný název: NNN__YYYY__TYPE.ext
const re = /^(\d{1,})__(\d{4})__(image|video)\.[^.]+$/i;

function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`Složka assets neexistuje: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const EXCLUDE_PREFIXES = ["tape_", "cassette_", "kazeta_"];

  const files = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => !EXCLUDE_PREFIXES.some((p) => f.startsWith(p)))
    .filter((f) => !f.startsWith("."));

  const items = files
    .map((filename) => {
      const ext = path.extname(filename).toLowerCase();
      const baseType = inferTypeFromExt(ext);
      const m = filename.match(re);

      // Pokud nesedí naming convention, bereme jen image/video podle přípony
      if (!m) {
        if (baseType === "unknown") return null;

        const base = path.basename(filename, ext);
        return {
          code: `A-${base}`, // fallback (doporučeno přejmenovat dle konvence)
          title: base,
          date: "1970-01-01",
          type: baseType,
          mediaSrc: `assets/${filename}`
        };
      }

      const numRaw = m[1];              // "001" nebo "12"
      const year = m[2];                // "2024"
      const type = m[3].toLowerCase();  // image|video

      const n = parseInt(numRaw, 10);
      const code = `A-${String(n).padStart(3, "0")}`;

      // Datum dáme na 1.1. daného roku, aby to sedělo na tvůj formát (YYYY-MM-DD)
      const date = `${year}-01-01`;

      return {
        code,
        title: String(n),               // volitelné (můžeš ignorovat v app.js)
        date,
        type,
        mediaSrc: `assets/${filename}`
      };
    })
    .filter(Boolean)
    // řazení primárně podle čísla v A-XXX, sekundárně podle roku (date)
    .sort((a, b) => {
      const na = parseInt(String(a.code || "").replace(/^A-/, ""), 10);
      const nb = parseInt(String(b.code || "").replace(/^A-/, ""), 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return (a.date || "").localeCompare(b.date || "");
    });

  fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2), "utf8");
  console.log(`Manifest vygenerován: assets/archive-manifest.json (${items.length} položek)`);
}

main();
