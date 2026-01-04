// backend/src/routes/adminRoutes.js
import express from "express";
import { ADMIN_KEY } from "../config.js";
import { now } from "../util/time.js";
import {
  generateCipherExport,
  previewCounts,
  normalizeForCipher,
} from "../cipher/cripEngine.js";

export function makeAdminRoutes({
  state,
  paidByCycle,
  pushState,
  wsBroadcast,
  getPublicState,
}) {
  const router = express.Router();

  function requireAdmin(req, res) {
    const key = req.header("x-admin-key");
    if (!key || key !== ADMIN_KEY) {
      res.status(401).json({ error: "unauthorized" });
      return false;
    }
    return true;
  }

  function cleanOneLine(s, max = 160) {
    return String(s ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function ensurePaidSet(cycleId) {
    const cid = Number(cycleId || 0);
    if (!paidByCycle.has(cid)) paidByCycle.set(cid, new Set());
  }

  function cipherWindowActive() {
    return (
      state.status === "CIPHER" &&
      state.cipherUntil &&
      Date.now() < Number(state.cipherUntil)
    );
  }

  // ---- Basic admin controls ----

  router.post("/api/admin/ping", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ ok: true });
  });

  router.post("/api/admin/set_prize", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const cents = Number(req.body?.prizeCents);
    if (!Number.isFinite(cents) || cents < 0) {
      return res.status(400).json({ error: "prize_required" });
    }

    state.prizeCents = Math.floor(cents);
    state.version++;
    pushState();
    res.json({ ok: true, state: getPublicState() });
  });

  router.post("/api/admin/set_prices", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { priceA, priceB, priceC } = req.body || {};
    const a = Number(priceA);
    const b = Number(priceB);
    const c = Number(priceC);

    if (![a, b, c].every((x) => Number.isFinite(x) && x >= 0)) {
      return res.status(400).json({ error: "prices_required" });
    }

    state.priceA = Math.floor(a);
    state.priceB = Math.floor(b);
    state.priceC = Math.floor(c);

    state.version++;
    pushState();
    res.json({ ok: true, state: getPublicState() });
  });

  router.post("/api/admin/set_banner", (req, res) => {
    if (!requireAdmin(req, res)) return;

    state.bannerText = cleanOneLine(req.body?.text, 160);
    state.version++;
    pushState();

    res.json({ ok: true, bannerText: state.bannerText });
  });

  router.post("/api/admin/set_cipher_instructions", (req, res) => {
    if (!requireAdmin(req, res)) return;

    state.cipherInstructions = String(req.body?.text ?? "")
      .trim()
      .slice(0, 1000);
    state.version++;
    pushState();

    res.json({ ok: true, cipherInstructions: state.cipherInstructions });
  });

  router.post("/api/admin/set_boxes", (req, res) => {
    if (!requireAdmin(req, res)) return;

    state.timerBoxText = cleanOneLine(req.body?.timerBoxText, 160);
    state.endedBoxText = cleanOneLine(req.body?.endedBoxText, 160);

    state.version++;
    pushState();

    res.json({
      ok: true,
      timerBoxText: state.timerBoxText,
      endedBoxText: state.endedBoxText,
      state: getPublicState(),
    });
  });

  /**
   * Legacy set_cipher (manual paste).
   * IMPORTANT: Clear any previously prepared engine cipher so we don’t “stick”
   * to an old prepared payload.
   */
  router.post("/api/admin/set_cipher", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const title = String(req.body?.title ?? "").trim().slice(0, 80);
    const body = String(req.body?.body ?? "").slice(0, 5000);
    const hint = String(req.body?.hint ?? "").trim().slice(0, 200);

    state.cipherConfig = { title, body, hint };

    // ✅ Clear prepared engine payloads so tick.js will fall back to cipherConfig cleanly
    state.cipher = null;
    state.cipherFull = null;
    state.canonicalAnswer = "";

    // Reset per-cycle artifacts since puzzle changed
    state.submissions = {};
    state.winner = null;

    state.version++;
    pushState();

    res.json({ ok: true, state: getPublicState() });
  });

  // ---------------------------------------------------------------------------
  // CRIP ENGINE ADMIN FLOW
  // ---------------------------------------------------------------------------

  /**
   * Preview: returns real wrap/fit stats using the engine algorithm.
   * Does NOT mutate state.
   */
  router.post("/api/admin/crip/preview", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const phrase = String(req.body?.phrase ?? "").slice(0, 500);
    const counts = previewCounts({
      phrase,
      seedSource: `cycle:${Number(state.cycleId || 0)}`,
    });

    res.json({ ok: true, phrase, ...counts });
  });

  /**
   * Generate:
   * - Stores PUBLIC cipher payload in state.cipher (safe to broadcast)
   * - Stores SERVER-ONLY bundle in state.cipherFull (used for next-week reveal rollover)
   */
  router.post("/api/admin/crip/generate", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const phraseRaw = String(req.body?.phrase ?? "").slice(0, 500);
    const phrase = normalizeForCipher(phraseRaw);

    if (!phrase) {
      return res.status(400).json({ error: "phrase_required" });
    }

    if (cipherWindowActive()) {
      return res.status(400).json({ error: "cipher_window_active" });
    }

    const cycleId = Number(state.cycleId || 0);
    const seedSource = `cycle:${cycleId}`;

    const exp = generateCipherExport({ cycleId, phrase, seedSource });
    if (!exp.ok) {
      return res.status(400).json({
        ok: false,
        error: exp.error || "invalid_phrase",
        counts: exp.counts || null,
      });
    }

    // PUBLIC payload (what players see)
    const publicCipher = {
      type: "CRIP36",
      title: "CRIP // 0x01",
      hint: "Screenshot. Solve later.",
      cols: exp.cols,
      rows: exp.rows,
      grid: exp.cipher.grid,
      gridString: exp.cipher.gridString,
    };

    // FULL bundle (server-only; used for next week's reveal)
    const fullCipher = {
      ...publicCipher,
      reveal: exp.reveal, // { text, markdown }
      legend: exp.legend, // mapping A-Z0-9 -> symbol
      normalizedPhrase: exp.normalizedPhrase,
      normalizedAnswer: exp.normalizedAnswer, // A–Z0–9 only
      seed: exp.seed,
      counts: exp.counts,
      preparedAt: now(),
      cycleId,
    };

    state.cipher = publicCipher;
    state.cipherFull = fullCipher;
    state.canonicalAnswer = exp.normalizedAnswer;

    // Reset per-cycle artifacts since puzzle changed
    state.submissions = {};
    state.winner = null;

    ensurePaidSet(cycleId);

    state.version++;
    pushState();

    wsBroadcast?.({
      type: "ADMIN_CIPHER_SET",
      payload: { cycleId, preparedAt: fullCipher.preparedAt },
    });

    res.json({
      ok: true,
      cycleId,
      preparedAt: fullCipher.preparedAt,
      counts: exp.counts,
      cols: exp.cols,
      rows: exp.rows,
      state: getPublicState(),
    });
  });

  /**
   * Weekly scheduler owns timing now.
   */
  router.post("/api/admin/start", (req, res) => {
    if (!requireAdmin(req, res)) return;
    return res.status(400).json({
      ok: false,
      error: "weekly_schedule_enabled",
      message: "Timer is controlled by weekly schedule (Sun 12:00 → Sat 08:00).",
      state: getPublicState(),
    });
  });

  router.post("/api/admin/reset", (req, res) => {
    if (!requireAdmin(req, res)) return;

    state.cipher = null;
    state.cipherFull = null;
    state.canonicalAnswer = "";
    state.submissions = {};
    state.winner = null;

    state.version++;
    pushState();

    wsBroadcast?.({ type: "ADMIN_RESET", payload: { cycleId: state.cycleId } });

    res.json({ ok: true, state: getPublicState() });
  });

  return router;
}
