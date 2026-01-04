// backend/src/state/store.js
import bcrypt from "bcryptjs";

export const state = {
  // countdown
  endAt: null,
  durationMs: 0,
  status: "IDLE", // IDLE | RUNNING | CIPHER | ENDED

  // cipher window
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

  // === Active cipher payload snapshot (PUBLIC) ===
  // This is what gets broadcast during CIPHER.
  // Must NOT include legend/reveal/answer.
  cipher: null,

  // === Active cipher full bundle (SERVER-ONLY) ===
  // Contains legend/reveal/normalizedAnswer/etc.
  // Used only for rollover -> lastCipher reveal next week.
  cipherFull: null,

  // === Silent answer checking (no right/wrong feedback to player) ===
  canonicalAnswer: "",

  // === Submissions (one per user per cycle) ===
  // key: `${cycleId}:${userId}` -> { userId, un, ts, answerNorm }
  submissions: {},

  // Winner for the CURRENT cycle (kept internal; shown next week via rollover)
  winner: null, // { userId, un, ts }

  // === "Last cycle" persisted for next week's footer reveal ===
  lastCycleId: null,
  lastWinner: null, // { userId, un, ts } or null

  // Full bundle snapshot from previous cycle (what /api/solve/reveal returns next week)
  lastCipher: null,

  // Optional: keep last week's PUBLIC cipher as well (safe for “last week grid” if desired)
  lastCipherPublic: null,

  // internal rollover marker (tick.js uses this to avoid double-rolling)
  _rolledAt: null,

  // === Users (in-memory MVP) ===
  // key: normalized email -> user record
  usersByEmail: {},
  // key: normalized id -> user record
  usersById: {},
  // key: normalized username -> user record (needed for UN login)
  usersByUn: {},

  // ---- Legacy fields kept for compatibility (no longer used) ----
  phase: "RUNNING", // legacy
  zeroAt: null,
  solveEndsAt: null,
  revealStartsAt: null,
  revealEndsAt: null,
  winnerLocked: false,
  attempts: {},

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
  state.hostUser = {
    id: String(email).trim().toLowerCase(),
    un: String(un).trim(),
    email: String(email).trim().toLowerCase(),
    passHash,
    host: true,
    createdAt: Date.now(),
  };

  // Also register host in user stores for convenience (no Stripe, no expiry)
  const e = state.hostUser.email;
  const uid = state.hostUser.id;
  const uname = String(state.hostUser.un).trim().toLowerCase();

  state.usersByEmail[e] = state.hostUser;
  state.usersById[uid] = state.hostUser;
  state.usersByUn[uname] = state.hostUser;
})();
