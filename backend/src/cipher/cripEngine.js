// backend/src/cipher/cripEngine.js
// Crip36 seeded substitution cipher (A–Z + 0–9) -> 36 geometric symbols
// Outputs: 7x7 grid (or 7x8 if needed), legend, reveal sheet, live counts.
// Constraints:
// - No punctuation
// - Words wrap naturally into the grid
// - Symbols placed evenly by cell (grid), spaces consume cells
// - Character count while typing (letters+digits), plus cell usage estimates

import crypto from "crypto";

export const ALPHABET36 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// ✅ Crip36 (36 UNIQUE symbols; geometric, hollow/partial/solid mix)
export const CRIP36 = [
  "△","▲","▽","▼","◇","◆","□","■","○","●",
  "⬡","⬢","⬣","⬤","⬥","⬦","⬧","⬨","⬩","⬪",
  "⬫","⬬","⬭","⬮","⬯",
  "◐","◑","◒","◓",
  "⊕","⊖","⊗","⊘","⊙","⊚","⊛"
];

// ---------- seeded randomness ----------
function seed32FromString(s) {
  const h = crypto.createHash("sha256").update(String(s)).digest();
  return (((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- legend ----------
export function buildLegend(seedSource, symbols36 = CRIP36) {
  if (!Array.isArray(symbols36) || symbols36.length !== 36) {
    throw new Error("symbols36 must be an array of exactly 36 symbols.");
  }
  const uniq = new Set(symbols36);
  if (uniq.size !== 36) {
    throw new Error("symbols36 must contain 36 unique symbols.");
  }

  const seed32 = seed32FromString(seedSource);
  const rand = mulberry32(seed32);
  const shuffled = shuffleSeeded(symbols36, rand);

  const forward = {};
  const reverse = {};
  for (let i = 0; i < 36; i++) {
    const ch = ALPHABET36[i];
    const sym = shuffled[i];
    forward[ch] = sym;
    reverse[sym] = ch;
  }

  return { seed: String(seedSource), forward, reverse, symbols: shuffled };
}

// ---------- normalization ----------
/**
 * Removes punctuation. Keeps A–Z, 0–9, and spaces.
 * Collapses whitespace. Uppercases.
 */
export function normalizeForCipher(input) {
  const s = String(input ?? "").toUpperCase();
  const noPunct = s.replace(/[^A-Z0-9 ]+/g, " ");
  return noPunct.replace(/\s+/g, " ").trim();
}

/**
 * Letters+digits only (used for the "character count while typing")
 */
export function normalizedCharCount(input) {
  const norm = normalizeForCipher(input);
  const only = norm.replace(/[^A-Z0-9]/g, "");
  return only.length;
}

// ---------- encoding words to symbol tokens ----------
function encodeWordToSymbols(word, legend) {
  const out = [];
  for (const c of word) out.push(legend.forward[c]);
  return out;
}

// ---------- grid layout (word wrap) ----------
export function layoutIntoGrid({ wordsSymbols, cols, rows = 7 }) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
  let r = 0;
  let c = 0;
  let cellsUsed = 0;

  function putCell(ch) {
    if (r >= rows) return false;
    grid[r][c] = ch;
    c++;
    cellsUsed++;
    if (c >= cols) {
      r++;
      c = 0;
    }
    return true;
  }

  for (let wi = 0; wi < wordsSymbols.length; wi++) {
    const wordSyms = wordsSymbols[wi];
    if (wordSyms.length === 0) continue;

    // One space cell between words if not at start of line
    if (!(r === 0 && c === 0) && c !== 0) {
      if (c >= cols) { r++; c = 0; }
      if (c !== 0) {
        if (!putCell(" ")) return { ok: false, grid, cellsUsed, overflow: true };
      }
    }

    // Wrap if word won't fit on the current line
    if (c !== 0 && (cols - c) < wordSyms.length) {
      r++;
      c = 0;
    }

    // Place word symbols (splits across lines if needed)
    for (let i = 0; i < wordSyms.length; i++) {
      if (!putCell(wordSyms[i])) return { ok: false, grid, cellsUsed, overflow: true };
    }
  }

  return { ok: true, grid, cellsUsed, overflow: false };
}

export function renderGridString(grid2d) {
  return grid2d.map((row) => row.join(" ")).join("\n");
}

function buildCipherFromPhrase({ phrase, legend, preferCols = 7 }) {
  const normalized = normalizeForCipher(phrase);
  const words = normalized.length ? normalized.split(" ") : [];
  const wordsSymbols = words.map((w) => encodeWordToSymbols(w, legend));

  const try7 = layoutIntoGrid({ wordsSymbols, cols: 7, rows: 7 });
  if (try7.ok && preferCols === 7) {
    return {
      cols: 7, rows: 7,
      grid: try7.grid,
      gridString: renderGridString(try7.grid),
      normalized,
      cellsUsed: try7.cellsUsed,
    };
  }

  const try8 = layoutIntoGrid({ wordsSymbols, cols: 8, rows: 7 });
  if (try8.ok) {
    return {
      cols: 8, rows: 7,
      grid: try8.grid,
      gridString: renderGridString(try8.grid),
      normalized,
      cellsUsed: try8.cellsUsed,
    };
  }

  if (try7.ok) {
    return {
      cols: 7, rows: 7,
      grid: try7.grid,
      gridString: renderGridString(try7.grid),
      normalized,
      cellsUsed: try7.cellsUsed,
    };
  }

  return {
    cols: null,
    rows: 7,
    grid: null,
    gridString: "",
    normalized,
    cellsUsed: null,
    error: "Phrase too long for 7x8 grid with natural wrapping.",
  };
}

// ---------- live preview counts ----------
export function previewCounts({ phrase, seedSource = "preview" }) {
  const legend = buildLegend(seedSource);
  const normalized = normalizeForCipher(phrase);
  const charCount = normalizedCharCount(phrase);

  const words = normalized.length ? normalized.split(" ") : [];
  const wordsSymbols = words.map((w) => encodeWordToSymbols(w, legend));

  const fit7 = layoutIntoGrid({ wordsSymbols, cols: 7, rows: 7 });
  const fit8 = layoutIntoGrid({ wordsSymbols, cols: 8, rows: 7 });

  return {
    normalized,
    charCount,
    fits7x7: !!fit7.ok,
    fits7x8: !!fit8.ok,
    cellsUsed7x7: fit7.ok ? fit7.cellsUsed : null,
    cellsUsed7x8: fit8.ok ? fit8.cellsUsed : null,
    cap7x7: 49,
    cap7x8: 56,
    recommendedCols: fit7.ok ? 7 : (fit8.ok ? 8 : null),
    error: (!fit7.ok && !fit8.ok) ? "Too long to fit in 7x8 with natural wrapping." : null,
  };
}

// ---------- reveal sheet ----------
export function makeRevealSheet({
  title = "CIPHER REVEAL",
  cycleId,
  seedSource,
  phrase,
  cipherGridString,
  normalized,
  legend,
}) {
  const normalizedAnswer = normalized.replace(/[^A-Z0-9]/g, "");

  const legendLines = ALPHABET36.split("")
    .map((ch) => `${ch} → ${legend.forward[ch]}`)
    .join("\n");

  const text = [
    `${title}`,
    `Cycle: ${cycleId ?? ""}`,
    `Seed: ${seedSource}`,
    ``,
    `CIPHER GRID:`,
    cipherGridString,
    ``,
    `PHRASE (NO PUNCT):`,
    normalized,
    ``,
    `NORMALIZED ANSWER (A–Z0–9):`,
    normalizedAnswer,
    ``,
    `LEGEND:`,
    legendLines,
  ].join("\n");

  const markdown = [
    `# ${title}`,
    ``,
    `**Cycle:** ${cycleId ?? ""}`,
    `**Seed:** \`${seedSource}\``,
    ``,
    `## Cipher Grid`,
    "```",
    cipherGridString,
    "```",
    ``,
    `## Phrase (no punctuation)`,
    "```",
    normalized,
    "```",
    ``,
    `## Normalized Answer (A–Z0–9)`,
    `\`${normalizedAnswer}\``,
    ``,
    `## Legend`,
    "```",
    legendLines,
    "```",
  ].join("\n");

  return { text, markdown, normalizedAnswer };
}

// ---------- main export: generate everything ----------
export function generateCipherExport({ cycleId, phrase, seedSource }) {
  const legend = buildLegend(seedSource);

  const built = buildCipherFromPhrase({ phrase, legend, preferCols: 7 });
  if (built.error) {
    const counts = previewCounts({ phrase, seedSource });
    return { ok: false, error: built.error, counts, seed: seedSource };
  }

  const reveal = makeRevealSheet({
    title: "CIPHER REVEAL",
    cycleId,
    seedSource,
    phrase,
    cipherGridString: built.gridString,
    normalized: built.normalized,
    legend,
  });

  const counts = previewCounts({ phrase, seedSource });

  return {
    ok: true,
    cycleId,
    seed: seedSource,
    cols: built.cols,
    rows: built.rows,
    normalizedPhrase: built.normalized,
    normalizedAnswer: reveal.normalizedAnswer,
    charCount: counts.charCount,
    counts,
    cipher: {
      grid: built.grid,
      gridString: built.gridString,
    },
    legend: legend.forward,
    reveal: {
      text: reveal.text,
      markdown: reveal.markdown,
    },
  };
}

/* =============================================================================
   COMPAT LAYER FOR BACKEND ROUTES
   - Preferred new usage:
       makeCripCipherBundle({ cycleId, phrase, seedSource?, title?, hint? })
       -> { ok, cipherBundle, canonicalAnswer }
   - cipher.js will strip reveal/legend during live window.
============================================================================= */

export function normalizePhraseForCrip(input) {
  return normalizeForCipher(input);
}

/**
 * Returns a FULL bundle intended to be stored directly into state.cipher.
 * (cipher.js strips reveal/legend/answers during the live cipher window)
 */
export function makeCripCipherBundle({
  cycleId = null,
  phrase,
  seedSource = null,
  title = "CRIP // 0x01",
  hint = "Screenshot. Solve later.",
} = {}) {
  const normalized = normalizeForCipher(phrase);
  if (!normalized) return { ok: false, error: "phrase_required" };

  const seed = seedSource ? String(seedSource) : `cycle:${cycleId ?? "x"}`;

  const exp = generateCipherExport({
    cycleId,
    phrase: normalized,
    seedSource: seed,
  });

  if (!exp.ok) return exp;

  const cipherBundle = {
    type: "CRIP36",
    title,
    hint,
    cols: exp.cols,
    rows: exp.rows,
    grid: exp.cipher.grid,
    gridString: exp.cipher.gridString,

    // server-side only, but stored in the same object:
    // cipher.js strips these while status === "CIPHER"
    legend: exp.legend,
    reveal: exp.reveal,
    normalizedPhrase: exp.normalizedPhrase,
    normalizedAnswer: exp.normalizedAnswer,
    seed: exp.seed,
    counts: exp.counts,
  };

  return {
    ok: true,
    cipherBundle,
    canonicalAnswer: exp.normalizedAnswer,
    export: exp,
  };
}
