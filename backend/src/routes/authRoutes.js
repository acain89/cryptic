// backend/src/routes/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import { setSessionUser, clearSession, enforceSessionExpiry } from "../auth/pass.js";

export function makeAuthRoutes({ state, paidByCycle, devicePasswords }) {
  const router = express.Router();

  function normId(x) {
    return String(x || "").trim().toLowerCase();
  }

  function cleanOneLine(s, max = 24) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function ensureUserStores() {
    state.usersByEmail ||= {}; // email -> user
    state.usersById ||= {};    // id -> user (id == email for now)
    state.usersByUn ||= {};    // un(lower) -> user
  }

  function findUserByLogin(login) {
    ensureUserStores();
    const key = normId(login);
    // allow login by email or UN
    return state.usersByEmail[key] || state.usersByUn[key] || null;
  }

  function isPaid(cycleId, userId) {
    const set = paidByCycle.get(Number(cycleId || 0));
    return !!set?.has(normId(userId));
  }

  function isHostLogin(login, password) {
    const attempt = normId(login);
    const host = state.hostUser;
    if (!host?.passHash) return false;

    const idMatch =
      attempt === normId(host.email) || attempt === normId(host.un);

    if (!idMatch) return false;

    return bcrypt.compareSync(String(password || ""), host.passHash);
  }

  function cipherWindowEnded() {
    const until = state?.cipherUntil ? Number(state.cipherUntil) : 0;
    if (!until) return true; // if no cipherUntil, treat as expired/not active
    return Date.now() >= until;
  }

  /**
   * ENTER:
   * - Create account (UN / Email / PW)
   * - Create session immediately
   * - Frontend then goes to Stripe checkout (one-time for this cycle)
   */
  router.post("/api/auth/enter", async (req, res) => {
    const { un, email, password } = req.body || {};
    if (!un || !email || !password) {
      return res.status(400).json({ ok: false, code: "missing_fields" });
    }

    ensureUserStores();

    const e = normId(email);
    const unClean = cleanOneLine(un, 24) || "PLAYER";
    const unKey = normId(unClean);

    // prevent UN collisions
    const existingUn = state.usersByUn[unKey];
    if (existingUn && existingUn.email !== e) {
      return res.status(409).json({ ok: false, code: "un_taken" });
    }

    let user = state.usersByEmail[e];

    if (!user) {
      const passHash = await bcrypt.hash(String(password), 12);
      user = {
        id: e, // id is email for MVP
        email: e,
        un: unClean,
        passHash,
        host: false,
        createdAt: Date.now(),
      };

      state.usersByEmail[e] = user;
      state.usersById[e] = user;
      state.usersByUn[unKey] = user;
    } else {
      // If user exists, require password match (prevents account takeover via "enter")
      const ok = bcrypt.compareSync(String(password || ""), user.passHash || "");
      if (!ok) return res.status(401).json({ ok: false, code: "unauthorized" });

      // ensure UN index is correct (if they previously used email-only)
      state.usersByUn[normId(user.un)] = user;
      state.usersByUn[unKey] = user;
      user.un = unClean;
    }

    // Session created now; payment happens after Stripe checkout
    // Expiry: if cipher window exists, expire at cipherUntil; otherwise leave null until paid/login
    const expiresAt = state?.cipherUntil ? Number(state.cipherUntil) : null;
    setSessionUser(req, user, { expiresAt });

    return res.json({
      ok: true,
      un: user.un,
      email: user.email,
      host: false,
      expiresAt,
      cycleId: Number(state.cycleId || 0),
    });
  });

  /**
   * LOGIN:
   * - UN or Email + PW
   * - Host bypass (never expires, never requires Stripe)
   * - Non-host requires paid for current cycle
   * - If cipher window already ended => treat as expired and force Stripe flow
   */
  router.post("/api/auth/login", async (req, res) => {
    const { login, password } = req.body || {};
    if (!login || !password) {
      return res.status(400).json({ ok: false, code: "missing_fields" });
    }

    // Host bypass
    if (isHostLogin(login, password)) {
      setSessionUser(req, state.hostUser, { expiresAt: null });
      return res.json({ ok: true, host: true, un: state.hostUser.un });
    }

    // If cipher window ended, force Stripe flow for non-host
    if (cipherWindowEnded()) {
      clearSession(req);
      return res.status(402).json({
        ok: false,
        code: "cycle_expired",
        message: "This cycle has expired. Please enter again.",
        cycleId: Number(state.cycleId || 0),
      });
    }

    // Non-host lookup (email or UN)
    const user = findUserByLogin(login);
    if (!user) return res.status(401).json({ ok: false, code: "unauthorized" });

    const ok = bcrypt.compareSync(String(password || ""), user.passHash || "");
    if (!ok) return res.status(401).json({ ok: false, code: "unauthorized" });

    const cycleId = Number(state.cycleId || 0);

    // Must be paid for this cycle
    if (!isPaid(cycleId, user.id)) {
      clearSession(req);
      return res.status(402).json({
        ok: false,
        code: "not_paid",
        message: "Payment required for this cycle.",
        cycleId,
      });
    }

    // Expire token at end of 24h window
    const expiresAt = state?.cipherUntil ? Number(state.cipherUntil) : null;
    setSessionUser(req, user, { expiresAt });

    return res.json({ ok: true, host: false, un: user.un, expiresAt, cycleId });
  });

  /**
   * WHOAMI: helpful for frontend boot
   * - returns session user if valid, otherwise expires it
   */
  router.get("/api/auth/me", (req, res) => {
    const exp = enforceSessionExpiry(req, state);
    if (!exp.ok) return res.status(401).json({ ok: false, code: exp.code });
    if (!exp.me) return res.json({ ok: true, me: null });
    return res.json({ ok: true, me: exp.me });
  });

  /* LOGOUT */
  router.post("/api/auth/logout", (req, res) => {
    clearSession(req);
    req.session?.destroy?.(() => {});
    return res.json({ ok: true });
  });

  return router;
}
