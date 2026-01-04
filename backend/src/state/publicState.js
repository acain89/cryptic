// backend/src/state/publicState.js
import { dollarsFromCents, now } from "../util/time.js";

function anchorsAmericaChicago(serverNowMs, endAtMs, cipherUntilMs) {
  // We don’t compute full schedule here (tick.js is source of truth),
  // but we can expose the two critical future timestamps for UI/debug:
  // - nextMainZero (when RUNNING hits 0) = endAt while RUNNING
  // - cipherEnd (when 24h closes) = cipherUntil while CIPHER
  const nextMainZero = endAtMs || null;
  const cipherEnd = cipherUntilMs || null;
  return { nextMainZero, cipherEnd };
}

export function getPublicState(state) {
  const status = String(state.status || "IDLE");
  const phase =
    status === "CIPHER" ? "CIPHER" : status === "RUNNING" ? "RUNNING" : "ENDED";

  const serverNow = now();
  const { nextMainZero, cipherEnd } = anchorsAmericaChicago(
    serverNow,
    state.endAt,
    state.cipherUntil
  );

  return {
    // primary UI state
    status, // IDLE | RUNNING | CIPHER | ENDED
    phase,  // RUNNING | CIPHER | ENDED (compat/debug)

    // countdown
    endAt: state.endAt,
    durationMs: state.durationMs,

    // cipher window (24h)
    cipherUntil: state.cipherUntil,
    cipherSeconds: state.cipherSeconds,

    // cycle identity
    cycleId: state.cycleId,
    cycleEndsAt: state.cycleEndsAt,

    // display + pricing
    prizeCents: state.prizeCents,
    prize: dollarsFromCents(state.prizeCents),

    priceA: state.priceA,
    priceB: state.priceB,
    priceC: state.priceC,

    // banner + optional text boxes
    bannerText: state.bannerText || "",
    timerBoxText: state.timerBoxText || "",
    endedBoxText: state.endedBoxText || "",
    cipherInstructions: state.cipherInstructions || "",

    // ✅ signal only (no answer leaks)
    hasPreparedCipher: !!state.cipher,

    // "Last week" footer metadata (no payload leak)
    last: {
      cycleId: state.lastCycleId ?? null,
      winner: state.lastWinner
        ? { un: state.lastWinner.un, ts: state.lastWinner.ts }
        : null,
      hasReveal: !!state.lastCipher,
    },

    // schedule anchors (debug / UI help)
    schedule: {
      nextMainZero, // when RUNNING hits 0 (Sat 08:00) while RUNNING
      cipherEnd,    // when cipher window closes (Sun 08:00) while CIPHER
    },

    // server clock + version
    serverNow,
    version: state.version,
  };
}
