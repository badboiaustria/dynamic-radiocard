#!/usr/bin/env node
/**
 * Setzt die Version an beiden Stellen gleichzeitig (package.json und
 * CARD_VERSION in src/dynamic-radiocard.js) und baut anschliessend neu.
 *
 *   npm run release -- 2.3.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "dynamic-radiocard.js");
const PKG = join(ROOT, "package.json");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Aufruf: npm run release -- <major.minor.patch>   z. B. 2.3.0");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(PKG, "utf8"));
const previous = pkg.version;
pkg.version = version;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n", "utf8");

const src = readFileSync(SRC, "utf8");
const updated = src.replace(
  /const\s+CARD_VERSION\s*=\s*["'][^"']+["']/,
  `const CARD_VERSION = "${version}"`
);
if (updated === src) {
  console.error("FEHLER: CARD_VERSION in src/dynamic-radiocard.js nicht gefunden.");
  process.exit(1);
}
writeFileSync(SRC, updated, "utf8");

console.log(`Version ${previous} -> ${version} gesetzt (package.json + src).`);
execFileSync(process.execPath, [join(ROOT, "scripts", "build.mjs")], { stdio: "inherit" });
console.log("\nNaechste Schritte:");
console.log("  1. CHANGELOG.md ergaenzen");
console.log(`  2. git add -A && git commit -m "release: v${version}"`);
console.log(`  3. git tag v${version}`);
