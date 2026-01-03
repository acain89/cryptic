// backend/src/state/publicState.js
import { dollarsFromCents, now } from "../util/time.js";

export function getPublicState(state) {
  return {
    status: state.status,
    endAt: state.endAt,
    durationMs: state.durationMs,
    cipherUntil: state.cipherUntil,
    cipherSeconds: state.cipherSeconds,
    cycleId: state.cycleId,
    cycleEndsAt: state.cycleEndsAt,

    prizeCents: state.prizeCents,
    prize: dollarsFromCents(state.prizeCents),
    priceA: state.priceA,
    priceB: state.priceB,
    priceC: state.priceC,

    bannerText: state.bannerText || "",

    timerBoxText: state.timerBoxText || "",
    endedBoxText: state.endedBoxText || "",
    cipherInstructions: state.cipherInstructions || "",

    cipherConfig: state.cipherConfig || { title: "", body: "", hint: "" },

    serverNow: now(),
    version: state.version,
  };
}
