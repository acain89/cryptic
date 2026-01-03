// backend/src/state/tick.js
import { now } from "../util/time.js";
import { getCipherPayload } from "../cipher/cipher.js";

function msLeft(state) {
  if (!state.endAt) return 0;
  return Math.max(0, state.endAt - now());
}

export function startTickLoop({ state, paidByCycle, wsBroadcast, pushState }) {
  const SOLVE_MS = 24 * 3600 * 1000;
  const REVEAL_MS = 8 * 3600 * 1000;

  setInterval(() => {
    const n = now();

    /* RUNNING → CIPHER */
    if (state.status === "RUNNING") {
      const left = msLeft(state);
      wsBroadcast({ type: "TICK", payload: { serverNow: n, msLeft: left, version: state.version } });

      if (left <= 0 && !state.zeroAt) {
        state.zeroAt = n;
        state.status = "CIPHER";
        const cipher = getCipherPayload(state);
        state.solveEndsAt = state.zeroAt + SOLVE_MS;
        state.revealStartsAt = state.solveEndsAt;
        state.revealEndsAt = state.solveEndsAt + REVEAL_MS;
        state.version++;
        pushState();
        wsBroadcast({ type: "CIPHER", payload: cipher });
      }
    }

    /* SOLVE phase */
    if (state.status === "CIPHER" && state.zeroAt && !state.winner && n < state.solveEndsAt) {
      state.phase = "SOLVE";
    }

    /* SOLVE expired → REVEAL */
    if (state.zeroAt && n >= state.solveEndsAt && n < state.revealEndsAt) {
      if (state.phase !== "REVEAL") {
        state.phase = "REVEAL";
        state.status = "CIPHER";
        state.version++;
        pushState();
        wsBroadcast({ type: "REVEAL_STARTED", payload: { cycleId: state.cycleId } });
      }
    }

    /* REVEAL expired → ENDED */
    if (state.zeroAt && n >= state.revealEndsAt) {
      if (state.phase !== "ENDED") {
        state.phase = "ENDED";
        state.status = "ENDED";
        state.endAt = null;
        state.durationMs = 0;
        state.version++;
        state.cycleId++;
        state.cycleEndsAt = null;
        state.zeroAt = null;
        state.solveEndsAt = null;
        state.revealStartsAt = null;
        state.revealEndsAt = null;
        pushState();
        wsBroadcast({ type: "REVEAL_ENDED", payload: { cycleId: state.cycleId } });
        wsBroadcast({ type: "ENDED" });
      }
    }

    /* Winner persistence safety */
    if (state.winner && !state.winnerLocked) {
      state.winnerLocked = true;
      wsBroadcast({ type: "SOLVED", payload: { un: state.winner.un, ts: state.winner.ts } });
    }

  }, 250);
}
