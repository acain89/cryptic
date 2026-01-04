// backend/src/routes/basicRoutes.js
import express from "express";
import crypto from "crypto";

export function makeBasicRoutes({ getPublicState }) {
  const router = express.Router();

  router.get("/health", (req, res) => res.json({ ok: true }));

  // Public state used by the main screen + cipher/reveal footer
  router.get("/api/state", (req, res) => res.json(getPublicState()));

  // Minimal “who am I” so frontend can render Login/Enter correctly
  router.get("/api/me", (req, res) => {
    const u = req.session?.user || null;

    // Session might exist but be empty
    if (!u?.id) {
      return res.json({ ok: true, authed: false });
    }

    // Host never expires; non-host expiresAt is enforced in auth/solve endpoints
    return res.json({
      ok: true,
      authed: true,
      me: {
        id: String(u.id || ""),
        un: String(u.un || ""),
        email: String(u.email || ""),
        host: !!u.host,
      },
      expiresAt: u.host ? null : (u.expiresAt ?? null),
    });
  });

  // Device id for checkout correlation (still useful)
  router.post("/api/device/new", (req, res) => {
    const deviceId = crypto.randomUUID();
    res.json({ deviceId });
  });

  return router;
}
