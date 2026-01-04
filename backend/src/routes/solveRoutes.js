// backend/src/routes/solveRoutes.js
import express from "express";
import { enforceSessionExpiry, getSessionUser, clearSession } from "../auth/pass.js";

export function makeSolveRoutes({ state, paidByCycle, wsBroadcast, pushState }) {
  const router = express.Router();

  function normId(x) {
    return String(x || "").trim().toLowerCase();
  }

  // For submissions + comparisons:
  // - strip punctuation
  // - collapse whitespace
  // - uppercase
  // - keep only A–Z0–9 (matches Crip normalizedAnswer)
  function normalizeToAZ09(s = "") {
    return String(s || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "") // remove spaces + punctuation
      .trim();
  }

  function isPaid(cycleId, userId) {
    const set = paidByCycle.get(Number(cycleId || 0));
    return !!set?.has(normId(userId));
  }

  // Cipher window is open if cipherUntil is set and we are before it.
  function cipherOpenNow() {
    if (!state.cipherUntil) return false;
    return Date.now() < Number(state.cipherUntil);
  }

  function submissionKey(cycleId, userId) {
    return `${Number(cycleId || 0)}:${normId(userId)}`;
  }

  function safeWinner(w) {
    return w ? { un: w.un, ts: w.ts } : null;
  }

  // Helper: enforce session expiry for non-host everywhere in solve routes
  function requireAuthed(req, res) {
    const exp = enforceSessionExpiry(req, state);
    if (!exp.ok) {
      // Session expired: clear and tell frontend to force Enter/Stripe
      clearSession(req);
      return { ok: false, res: res.status(401).json({ ok: false, code: exp.code || "session_expired" }) };
    }
    const me = exp.me;
    if (!me) {
      return { ok: false, res: res.status(401).json({ ok: false, code: "not_logged_in" }) };
    }
    return { ok: true, me };
  }

  router.get("/api/solve/state", (req, res) => {
    const cycleId = Number(state.cycleId || 0);

    // Do NOT hard-require auth just to read state (UI can show locked screens),
    // but DO enforce expiry if they are logged in and non-host.
    const exp = enforceSessionExpiry(req, state);
    const me = exp.ok ? exp.me : null;

    const userId = me?.id || null;
    const paid = userId ? isPaid(cycleId, userId) : false;

    state.submissions ||= {};
    const key = userId ? submissionKey(cycleId, userId) : null;
    const alreadySubmitted = key ? !!state.submissions[key] : false;

    const cipherOpen = cipherOpenNow();

    res.json({
      ok: true,
      cycleId,
      status: String(state.status || "IDLE"),
      cipherOpen,
      cipherUntil: state.cipherUntil || null,

      authed: !!me,
      me: me ? { id: me.id, un: me.un, host: !!me.host } : null,
      paid: !!paid,

      // One submission per player per cipher (no attempts, no correctness feedback)
      alreadySubmitted,
      canSubmit: !!(paid && me && cipherOpen && !alreadySubmitted),

      // Winner exists internally; do not change UX based on it
      winnerExists: !!state.winner,

      // Footer info for next week's "last cipher winner" reveal
      last: {
        cycleId: state.lastCycleId ?? null,
        winner: safeWinner(state.lastWinner),
        hasReveal: !!state.lastCipher,
      },
    });
  });

  router.post("/api/solve/submit", (req, res) => {
    const cycleId = Number(state.cycleId || 0);

    const authed = requireAuthed(req, res);
    if (!authed.ok) return authed.res;
    const me = authed.me;

    if (!cipherOpenNow()) {
      // Outside 24h cipher window — no submission accepted
      return res.status(400).json({ ok: false, code: "cipher_closed" });
    }

    // Host is allowed to submit (but normally you won't); keep consistent:
    // host bypasses payment.
    if (!me.host && !isPaid(cycleId, me.id)) {
      return res.status(403).json({ ok: false, code: "not_paid" });
    }

    state.submissions ||= {};
    const key = submissionKey(cycleId, me.id);

    // One submission per cycle, always same response, never overwrite
    if (state.submissions[key]) {
      return res.json({ ok: true, message: "Submission received." });
    }

    const raw = String(req.body?.answer ?? "");
    const normIn = normalizeToAZ09(raw);

    // Store submission (even if empty, it's their one shot)
    state.submissions[key] = {
      userId: me.id,
      un: me.un || "UNKNOWN",
      ts: Date.now(),
      answerNorm: normIn,
    };

    // Determine winner silently (first correct wins)
    const normAns = normalizeToAZ09(state.canonicalAnswer || "");
    if (!state.winner && normAns && normIn && normIn === normAns) {
      state.winner = {
        userId: me.id,
        un: me.un || "UNKNOWN",
        ts: Date.now(),
      };
      // No SOLVED banner event.
    }

    state.version = Number(state.version || 0) + 1;
    try {
      pushState?.();
    } catch (_) {}

    // Generic broadcast, no correctness implied
    try {
      wsBroadcast?.({
        type: "SUBMISSION_RECEIVED",
        payload: { cycleId },
      });
    } catch (_) {}

    return res.json({ ok: true, message: "Submission received." });
  });

  /**
   * Reveal endpoint returns "last cycle reveal bundle"
   * shown on the *following week's* cipher reveal footer button.
   *
   * Access rule:
   * - require login
   * - require paid for current cycle (host bypass)
   */
  router.get("/api/solve/reveal", (req, res) => {
    const cycleId = Number(state.cycleId || 0);

    const authed = requireAuthed(req, res);
    if (!authed.ok) return authed.res;
    const me = authed.me;

    if (!me.host && !isPaid(cycleId, me.id)) {
      return res.status(403).json({ ok: false, code: "not_paid" });
    }

    if (!state.lastCipher) {
      return res.status(404).json({ ok: false, code: "no_last_reveal" });
    }

    res.json({
      ok: true,
      lastCycleId: state.lastCycleId ?? null,
      lastWinner: state.lastWinner ? { un: state.lastWinner.un, ts: state.lastWinner.ts } : null,

      // Contains whatever you persisted at rollover:
      // - cipher snapshot
      // - answer reveal
      // - legend / reveal sheet
      lastCipher: state.lastCipher,
    });
  });

  return router;
}
