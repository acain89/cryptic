// backend/src/state/store.js
import bcrypt from "bcryptjs";

export const state = {
  // countdown
  endAt: null,
  durationMs: 0,
  status: "IDLE", // IDLE | RUNNING | CIPHER | ENDED
  cipherUntil: null,
  cipherSeconds: 60,

  // cycle identity + end moment
  cycleId: 0,
  cycleEndsAt: null,

  // display + pricing
  prizeCents: 60000,
  priceA: 399,
  priceB: 799,
  priceC: 999,

  bannerText: "",
  timerBoxText: "",
  endedBoxText: "",
  cipherInstructions: "",

  // solve/reveal data
  phase: "RUNNING", // RUNNING | SOLVE | REVEAL | ENDED
  zeroAt: null,
  solveEndsAt: null,
  revealStartsAt: null,
  revealEndsAt: null,
  winner: null, // { un, ts } stored persistently here

  cipherConfig: {
    title: "SEQUENCE // 0x00",
    body:
      `\n$600.00\n\n` +
      "⟊⟟⟒⟟⟟⟒  ⌬⌬⌬  19-20  9-20  13-1  20-20-5-18-5-4  20-15  13-5\n" +
      "⟟⟒⟟⟟⟒  ⌬⌬⌬  20-8-5  16-8-18-1-19-5  9-19  15-14-12-25\n" +
      "⟊⟟⟒⟟⟟⟒  ⌬⌬⌬  312-555-0199",
    hint: "Screenshot. Solve later.",
  },

  version: 0,
};

// who paid this cycle (in-memory MVP)
export const paidByCycle = new Map();

// device password store (in-memory MVP)
export const devicePasswords = new Map();

// persistent HOST account (never wiped)
(async () => {
  const email = "acain89@gmail.com";
  const un = "Postman";
  const passHash = await bcrypt.hash("Purplellama34!", 12);

  // attach host user directly to state so cycles never delete it
  state.hostUser = { id: email, un, email, passHash, host: true, createdAt: Date.now() };
})();
