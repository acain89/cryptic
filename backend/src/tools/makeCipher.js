// tools/makeCipher.js
// Usage examples:
//   node tools/makeCipher.js --cycle=7 --seed="cycle:7" "THE TRUTH HIDES IN THE PATTERN 2026"
//   node tools/makeCipher.js "HELLO WORLD 123"
// Prints cipher grid + reveal sheet + JSON blob.

import { generateCipherExport } from "../backend/src/cipher/cripEngine.js";

function getArgValue(prefix) {
  const hit = process.argv.find(a => a.startsWith(prefix));
  if (!hit) return null;
  const [, v] = hit.split("=");
  return v ?? null;
}

const cycleId = getArgValue("--cycle") ?? "";
const seed =
  getArgValue("--seed") ??
  (cycleId ? `cycle:${cycleId}` : `manual:${new Date().toISOString().slice(0, 10)}`);

// phrase is everything that's not a flag
const phraseParts = process.argv.slice(2).filter(a => !a.startsWith("--"));
const phrase = phraseParts.join(" ").trim();

if (!phrase) {
  console.error('Missing phrase.\nExample:\n  node tools/makeCipher.js --cycle=7 "THE TRUTH HIDES IN THE PATTERN 2026"');
  process.exit(1);
}

const out = generateCipherExport({ cycleId, phrase, seedSource: seed });

if (!out.ok) {
  console.log("ERROR:", out.error);
  console.log("\nCOUNTS:", JSON.stringify(out.counts, null, 2));
  process.exit(2);
}

console.log("\n=== CIPHER GRID ===\n");
console.log(out.cipher.gridString);

console.log("\n=== REVEAL (TEXT) ===\n");
console.log(out.reveal.text);

console.log("\n=== EXPORT JSON (store this) ===\n");
console.log(JSON.stringify(out, null, 2));
