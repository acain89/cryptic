// backend/src/auth/pass.js
function normId(x) {
  return String(x || "").trim().toLowerCase();
}

export function setSessionUser(req, user, { expiresAt = null } = {}) {
  if (!req.session) return;

  req.session.user = {
    id: normId(user.id),
    un: String(user.un || "").trim(),
    email: String(user.email || "").trim(),
    host: !!user.host,
    expiresAt: expiresAt ? Number(expiresAt) : null,
  };
}

export function clearSession(req) {
  try {
    if (req.session) req.session.user = null;

    // Best effort: destroy session backing store
    if (req.session?.destroy) {
      req.session.destroy(() => {});
    }
  } catch (_) {}
}

export function getSessionUser(req) {
  const u = req.session?.user;
  if (!u?.id) return null;

  return {
    id: normId(u.id),
    un: String(u.un || "").trim(),
    email: String(u.email || "").trim(),
    host: !!u.host,
    expiresAt: u.expiresAt ? Number(u.expiresAt) : null,
  };
}

/**
 * Expires non-host sessions after the 24h cipher window.
 * If expired => clears session and returns { ok:false, code:"session_expired" }
 */
export function enforceSessionExpiry(req, state) {
  const me = getSessionUser(req);
  if (!me) return { ok: true, me: null };

  // Host tokens never expire
  if (me.host) return { ok: true, me };

  const n = Date.now();

  // Primary expiry: stored session expiresAt
  if (me.expiresAt && n >= me.expiresAt) {
    clearSession(req);
    return { ok: false, code: "session_expired" };
  }

  // Secondary safety: if cipher window ended, expire anyway
  if (state?.cipherUntil && n >= Number(state.cipherUntil)) {
    clearSession(req);
    return { ok: false, code: "session_expired" };
  }

  return { ok: true, me };
}

/**
 * Reusable middleware to protect endpoints:
 * - must be logged in
 * - non-host must not be expired
 */
export function requireUser({ state }) {
  return (req, res, next) => {
    const exp = enforceSessionExpiry(req, state);
    if (!exp.ok) {
      return res.status(401).json({ ok: false, code: exp.code || "session_expired" });
    }
    if (!exp.me) {
      return res.status(401).json({ ok: false, code: "not_logged_in" });
    }
    req.me = exp.me;
    next();
  };
}
