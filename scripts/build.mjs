#!/usr/bin/env node
/**
 * Build-Skript fuer die HA Radio Card.
 *
 * Die Karte ist eine einzelne, abhaengigkeitsfreie ES-Datei. "Bauen" heisst
 * deshalb: Version pruefen, Banner voranstellen, nach dist/ schreiben.
 * Der Code selbst wird NICHT veraendert (kein Minify, kein Transpile) - was
 * in dist landet, ist zeichengleich mit src, nur mit Kopfzeile.
 *
 * Aufrufe:
 *   node scripts/build.mjs              Build nach dist/
 *   node scripts/build.mjs --check      Nur pruefen (CI): Version + dist aktuell?
 *   node scripts/build.mjs --out <dir>  Zusaetzlich in ein Zielverzeichnis kopieren
 *   node scripts/build.mjs --deploy     Zusaetzlich nach $HA_WWW kopieren
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "dynamic-radiocard.js");
const DIST_DIR = join(ROOT, "dist");
const DIST = join(DIST_DIR, "dynamic-radiocard.js");
const BANNER_END = "/* --- dynamic-radiocard build banner end --- */";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const fail = (msg) => { console.error("FEHLER: " + msg); process.exit(1); };

// --- Version aus Quelle und package.json lesen -----------------------------
const source = readFileSync(SRC, "utf8");
const m = source.match(/const\s+CARD_VERSION\s*=\s*["']([^"']+)["']/);
if (!m) fail("CARD_VERSION nicht in src/dynamic-radiocard.js gefunden.");
const srcVersion = m[1];

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
if (pkg.version !== srcVersion) {
  fail(
    `Versionen laufen auseinander: package.json = ${pkg.version}, ` +
    `CARD_VERSION = ${srcVersion}.\n` +
    `       Mit "npm run release -- <version>" beide gemeinsam setzen.`
  );
}

const banner =
  "/*!\n" +
  ` * Dynamic RadioCard v${srcVersion}\n` +
  ` * A 3D cover-flow media browser card for Home Assistant + Music Assistant\n` +
  ` * Author: ${pkg.author}\n` +
  ` * License: ${pkg.license}\n` +
  " * Build-Artefakt - nicht direkt bearbeiten, Quelle liegt in src/\n" +
  " */\n" +
  BANNER_END + "\n";

const output = banner + source;

// --- Pruefmodus ------------------------------------------------------------
if (has("--check")) {
  if (!existsSync(DIST)) fail("dist/dynamic-radiocard.js fehlt - bitte 'npm run build' ausfuehren.");
  const dist = readFileSync(DIST, "utf8");
  const idx = dist.indexOf(BANNER_END);
  const distCode = idx >= 0 ? dist.slice(idx + BANNER_END.length + 1) : dist;
  if (distCode !== source) fail("dist/ ist nicht aktuell - bitte 'npm run build' ausfuehren.");
  console.log(`OK - Version ${srcVersion}, dist/ ist aktuell.`);
  process.exit(0);
}

// --- Build -----------------------------------------------------------------
mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(DIST, output, "utf8");
console.log(`Build OK: dist/dynamic-radiocard.js (v${srcVersion}, ${output.length} Zeichen)`);

// --- Optionales Kopieren ins HA-www-Verzeichnis ----------------------------
let target = valueOf("--out");
if (!target && has("--deploy")) target = process.env.HA_WWW;
if (has("--deploy") && !target) {
  fail("--deploy braucht die Umgebungsvariable HA_WWW (Pfad zu /config/www).");
}
if (target) {
  if (!existsSync(target)) fail(`Zielverzeichnis existiert nicht: ${target}`);
  const dest = join(target, "dynamic-radiocard.js");
  copyFileSync(DIST, dest);
  console.log(`Kopiert nach: ${dest}`);
  console.log("Nicht vergessen: im Browser Strg+F5 (Cache) bzw. HA-App neu laden.");
}
