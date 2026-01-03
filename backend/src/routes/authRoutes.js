// backend/src/routes/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import { devicePasswords } from "../state/store.js";
import { setPassCookie, clearPassCookie } from "../auth/pass.js";
import { now } from "../util/time.js";

export function makeAuthRoutes({ state, paidByCycle }) {
  const router = express.Router();

  router.post("/api/auth/signup", async (req, res) => {
    const { un, email, password } = req.body || {};
    if (!un || !email || !password) return res.status(400).json({ ok: false });

    const userId = email.toLowerCase();
    if (devicePasswords.has(userId)) return res.status(409).json({ ok: false });

    const passHash = await bcrypt.hash(password, 12);
    devicePasswords.set(userId, { passHash, un: un.toLowerCase(), email: userId, createdAt: Date.now() });

    res.json({ ok: true });
  });

  router.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false });

    const userId = email.toLowerCase();
    const user = devicePasswords.get(userId);
    if (!user) return res.status(401).json({ ok: false });

    const match = await bcrypt.compare(password, user.passHash);
    if (!match) return res.status(401).json({ ok: false });

    const paidSet = paidByCycle.get(state.cycleId) || new Set();
    if (!paidSet.has(userId)) return res.status(402).json({ ok: false });

    req.session.userId = userId;
    req.session.un = user.un;

    setPassCookie(res, { userId, cycleId: state.cycleId }, state.zeroAt + 24*3600*1000);
    res.json({ ok: true });
  });

  router.post("/api/auth/logout", (req, res) => {
    req.session.destroy?.(() => {});
    clearPassCookie(res);
    res.json({ ok: true });
  });

  router.get("/api/auth/me", (req, res) => {
    const authed = !!req.session?.userId;
    res.json({ ok: authed, un: authed ? req.session.un : null });
  });

  return router;
}
