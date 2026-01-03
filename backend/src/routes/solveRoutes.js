// backend/src/routes/solveRoutes.js
import express from "express";

export function makeSolveRoutes({ state, paidByCycle, wsBroadcast }) {
  const router = express.Router();

  function normalizeAnswer(s="") {
    return s.toLowerCase().trim().replace(/\s+/g, " ");
  }

  router.get("/api/solve/state", (req, res) => {
    const cycleId = state.cycleId;
    const userId = req.session?.userId?.toLowerCase() || "";
    const paid = paidByCycle.get(cycleId)?.has(userId) || false;

    const used = state.attempts?.[`${cycleId}:${userId}`]?.used || 0;
    const attemptsRemaining = Math.max(0, 3 - used);
    const solved = !!state.winner;
    const phase = state.phase;
    const nowTs = Date.now();

    const solveEndsAt = state.zeroAt + 24 * 3600 * 1000;
    const revealEndsAt = solveEndsAt + 8 * 3600 * 1000;
    const timeLeftMs = phase === "SOLVE" ? solveEndsAt - nowTs : phase === "REVEAL" ? revealEndsAt - nowTs : 0;

    res.json({
      ok: true,
      phase,
      cycleId,
      timeLeftMs: Math.max(0, timeLeftMs),
      solved,
      attemptsRemaining,
      canSubmit: paid && !solved && phase === "SOLVE" && attemptsRemaining > 0,
      cipher: paid && !solved ? state.cipher : null,
      winner: state.winner ? { un: state.winner.un, ts: state.winner.ts } : null,
      revealOpen: phase === "REVEAL"
    });
  });

  router.post("/api/solve/submit", (req, res) => {
    const { answer } = req.body || {};
    const cycleId = state.cycleId;
    const userId = req.session?.userId?.toLowerCase() || "";
    const key = `${cycleId}:${userId}`;

    const paid = paidByCycle.get(cycleId)?.has(userId);
    if (!paid) return res.status(403).json({ ok:false });

    if (state.winner) return res.json({ ok:false, solved:true });

    if (state.phase !== "SOLVE") return res.json({ ok:false });

    state.attempts[key] ||= { used: 0 };
    if (state.attempts[key].used >= 3) return res.json({ ok:false, lockedOut:true });

    state.attempts[key].used++;

    const normIn = normalizeAnswer(answer || "");
    const normAns = normalizeAnswer(state.canonicalAnswer);

    if (normIn === normAns && !state.winner) {
      state.winner = { userId, un: req.session.un, ts: Date.now(), answerNorm: normAns };
      wsBroadcast("SOLVED", { un: req.session.un, ts: state.winner.ts });
      return res.json({ ok:true, solved:true });
    }

    const attemptsRemaining = Math.max(0, 3 - state.attempts[key].used);
    res.json({ ok:false, attemptsRemaining, lockedOut: attemptsRemaining===0 });
  });

  router.get("/api/solve/reveal", (req, res) => {
    const userId = req.session?.userId?.toLowerCase() || "";
    const paid = paidByCycle.get(state.cycleId)?.has(userId);
    if (!paid) return res.status(403).json({ ok:false });
    if (state.phase !== "REVEAL") return res.status(400).json({ ok:false });

    res.json({
      ok: true,
      cycleId: state.cycleId,
      decodeInstructions: state.decodeInstructions,
      canonicalAnswer: state.canonicalAnswer,
      howToSolve: state.howToSolve,
      revealEndsAt: state.zeroAt + 24*3600*1000 + 8*3600*1000,
      winner: state.winner ? { un: state.winner.un, ts: state.winner.ts } : null,
      solved: !!state.winner
    });
  });

  export { router };
  return router;
}
