// backend/src/state/tick.js
import { now } from "../util/time.js";
import { getCipherPayload } from "../cipher/cipher.js";

/**
 * Weekly schedule in America/Chicago (server TZ must be set accordingly):
 * - RUNNING: Sunday 12:00 → Saturday 08:00
 * - CIPHER : Saturday 08:00 → Sunday 08:00 (24h submissions window)
 * - ENDED  : Sunday 08:00 → Sunday 12:00 (black screen)
 *
 * No separate reveal window, no solved banner, no right/wrong feedback here.
 * Winner + answer reveal are shown on the *following week's* reveal footer.
 *
 * Important storage rules (matches store.js):
 * - state.cipher      = PUBLIC payload (safe to show during cipher window)
 * - state.cipherFull  = SERVER-ONLY bundle (legend/reveal/normalizedAnswer/etc)
 * - rollover writes:
 *     state.lastCipher       = last cycle FULL bundle (returned by /api/solve/reveal)
 *     state.lastCipherPublic = last cycle PUBLIC payload (optional, safe)
 */

function tsForNextDowTime(afterMs, dow /*0=Sun..6*/, hh, mm, ss = 0) {
  const d = new Date(afterMs);
  const base = new Date(d.getTime());
  base.setSeconds(0, 0);

  const target = new Date(base.getTime());
  target.setHours(hh, mm, ss, 0);

  const curDow = target.getDay();
  let delta = (dow - curDow + 7) % 7;
  if (delta === 0 && target.getTime() <= afterMs) delta = 7;

  target.setDate(target.getDate() + delta);
  return target.getTime();
}

function tsForPrevDowTime(atOrBeforeMs, dow /*0=Sun..6*/, hh, mm, ss = 0) {
  const next = tsForNextDowTime(atOrBeforeMs - 1, dow, hh, mm, ss);
  return next - 7 * 24 * 3600 * 1000;
}

function ensurePaidSet(paidByCycle, cycleId) {
  if (!paidByCycle.has(cycleId)) paidByCycle.set(cycleId, new Set());
}

/**
 * Derive schedule anchors for the "current week" containing time n.
 * startRunning = Sunday 12:00
 * mainZero     = Saturday 08:00
 * cipherEnd    = Sunday 08:00 (mainZero + 24h)
 */
function getAnchors(n) {
  const startRunning = tsForPrevDowTime(n, 0, 12, 0, 0); // Sun 12:00
  const mainZero = startRunning + (6 * 24 - 4) * 3600 * 1000; // Sat 08:00
  const cipherEnd = mainZero + 24 * 3600 * 1000; // Sun 08:00
  return { startRunning, mainZero, cipherEnd };
}

function inWindow(n, a, b) {
  return n >= a && n < b;
}

/**
 * Some earlier adminRoutes versions stored "full bundle" inside state.cipher.
 * This helper detects that and splits it cleanly into:
 *   - publicCipher (safe to show)
 *   - fullCipher   (server-only)
 */
function splitCipherBundles(cipherMaybe) {
  if (!cipherMaybe || typeof cipherMaybe !== "object") {
    return { publicCipher: null, fullCipher: null };
  }

  const hasFullSignals =
    "legend" in cipherMaybe ||
    "reveal" in cipherMaybe ||
    "normalizedAnswer" in cipherMaybe ||
    "normalizedPhrase" in cipherMaybe ||
    "seed" in cipherMaybe;

  // Always build a safe public view
  const publicCipher = {
    title: String(cipherMaybe.title || "SEQUENCE"),
    hint: String(cipherMaybe.hint || ""),
    cols: cipherMaybe.cols ?? null,
    rows: cipherMaybe.rows ?? null,
    grid: cipherMaybe.grid ?? null,
    gridString: String(cipherMaybe.gridString || ""),
    type: cipherMaybe.type ? String(cipherMaybe.type) : undefined,
  };

  // Full bundle only if it actually contains full fields
  const fullCipher = hasFullSignals ? cipherMaybe : null;

  return { publicCipher, fullCipher };
}

export function startTickLoop({ state, paidByCycle, wsBroadcast, pushState }) {
  // Safety stores
  state.submissions ||= {};
  ensurePaidSet(paidByCycle, state.cycleId || 0);

  // Back-compat fields (keep clean)
  state.solveEndsAt ||= null;
  state.revealStartsAt ||= null;
  state.revealEndsAt ||= null;
  state.phase ||= null;
  state._rolledAt ||= null;

  // Ensure new fields exist (store.js defines them; this is defensive)
  if (!("cipherFull" in state)) state.cipherFull = null;
  if (!("lastCipherPublic" in state)) state.lastCipherPublic = null;

  setInterval(() => {
    const n = now();
    const { startRunning, mainZero, cipherEnd } = getAnchors(n);

    // Desired status by schedule
    let desiredStatus = "ENDED";
    if (inWindow(n, startRunning, mainZero)) desiredStatus = "RUNNING";
    else if (inWindow(n, mainZero, cipherEnd)) desiredStatus = "CIPHER";
    else desiredStatus = "ENDED";

    /* =========================================================
       RUNNING: Sunday 12:00 → Saturday 08:00
    ========================================================= */
    if (desiredStatus === "RUNNING") {
      if (state.status !== "RUNNING") {
        state.status = "RUNNING";

        state.endAt = mainZero;
        state.durationMs = Math.max(0, mainZero - startRunning);

        // No cipher during RUNNING
        state.cipherUntil = null;
        state.zeroAt = null;

        // Clean compat fields
        state.phase = null;
        state.solveEndsAt = null;
        state.revealStartsAt = null;
        state.revealEndsAt = null;

        state.version++;
        pushState();
        wsBroadcast({
          type: "STATUS",
          payload: { status: state.status, cycleId: state.cycleId },
        });
      }

      // Pin endAt to schedule
      if (state.endAt !== mainZero) {
        state.endAt = mainZero;
        state.durationMs = Math.max(0, mainZero - startRunning);
      }

      const left = Math.max(0, state.endAt - n);
      wsBroadcast({
        type: "TICK",
        payload: { serverNow: n, msLeft: left, version: state.version },
      });

      return;
    }

    /* =========================================================
       CIPHER: Saturday 08:00 → Sunday 08:00 (24h submissions)
    ========================================================= */
    if (desiredStatus === "CIPHER") {
      if (state.status !== "CIPHER") {
        state.status = "CIPHER";

        state.zeroAt = mainZero;
        state.endAt = null;
        state.durationMs = 0;

        // Cipher is open the full 24h
        state.cipherUntil = cipherEnd;

        // Clean compat fields
        state.phase = null;
        state.solveEndsAt = null;
        state.revealStartsAt = null;
        state.revealEndsAt = null;

        // If admin already prepared cipher, DO NOT overwrite.
        // If not, fallback to config-based payload.
        if (!state.cipher) {
          state.cipher = getCipherPayload(state);
        }

        // If cipher was prepared as a "full bundle" inside state.cipher (older adminRoutes),
        // split it now so rollover works.
        if (!state.cipherFull) {
          const { publicCipher, fullCipher } = splitCipherBundles(state.cipher);
          if (publicCipher) state.cipher = publicCipher;
          if (fullCipher) state.cipherFull = fullCipher;
        }

        // Start of window: reset submissions + winner for THIS cycle
        state.submissions = {};
        state.winner = null;

        // Mark not yet rolled
        state._rolledAt = null;

        state.version++;
        pushState();

        wsBroadcast({ type: "CIPHER", payload: state.cipher });
        wsBroadcast({
          type: "STATUS",
          payload: { status: state.status, cycleId: state.cycleId },
        });
      }

      const left = Math.max(0, (state.cipherUntil || cipherEnd) - n);
      wsBroadcast({
        type: "CIPHER_TICK",
        payload: {
          serverNow: n,
          msLeft: left,
          cycleId: state.cycleId,
          version: state.version,
        },
      });

      return;
    }

    /* =========================================================
       ENDED: Sunday 08:00 → Sunday 12:00 (black screen)
       - Roll cycle exactly once right after cipher window closes.
    ========================================================= */
    if (desiredStatus === "ENDED") {
      // Roll at cipherEnd once (idempotent)
      if (n >= cipherEnd && state._rolledAt !== cipherEnd) {
        const endedCycleId = state.cycleId;

        // Persist last-cycle info for next week's footer reveal
        state.lastCycleId = endedCycleId;
        state.lastWinner = state.winner ? { ...state.winner } : null;

        // Determine full + public snapshots to persist
        const { publicCipher, fullCipher } = splitCipherBundles(state.cipher);
        const publicSnap = publicCipher || state.cipher || null;
        const fullSnap = state.cipherFull || fullCipher || null;

        // lastCipher is the FULL bundle used by /api/solve/reveal next week
        state.lastCipher = fullSnap;

        // optional safe snapshot
        state.lastCipherPublic = publicSnap;

        // Wipe transient current-cycle data
        state.cipher = null;
        state.cipherFull = null;
        state.canonicalAnswer = "";
        state.submissions = {};
        state.winner = null;

        // Clear cipher timing
        state.cipherUntil = null;
        state.zeroAt = null;

        // Clear countdown visuals
        state.endAt = null;
        state.durationMs = 0;

        // Clean compat
        state.phase = null;
        state.solveEndsAt = null;
        state.revealStartsAt = null;
        state.revealEndsAt = null;

        // Advance cycleId
        state.cycleId = (endedCycleId || 0) + 1;
        state.cycleEndsAt = null;

        // Reset paid set for new cycle
        paidByCycle.delete(endedCycleId);
        ensurePaidSet(paidByCycle, state.cycleId);

        state._rolledAt = cipherEnd;

        state.version++;
        pushState();

        wsBroadcast({ type: "ENDED", payload: { cycleId: endedCycleId } });
        wsBroadcast({
          type: "STATUS",
          payload: { status: "ENDED", cycleId: endedCycleId },
        });
      }

      // Ensure black screen status
      if (state.status !== "ENDED") {
        state.status = "ENDED";
        state.endAt = null;
        state.durationMs = 0;
        state.cipherUntil = null;

        state.phase = null;
        state.solveEndsAt = null;
        state.revealStartsAt = null;
        state.revealEndsAt = null;

        state.version++;
        pushState();
        wsBroadcast({
          type: "STATUS",
          payload: { status: state.status, cycleId: state.cycleId },
        });
      }

      return;
    }
  }, 250);
}
