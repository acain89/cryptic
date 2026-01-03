// backend/src/routes/adminRoutes.js
import express from "express";
import { ADMIN_KEY } from "../config.js";
import { now } from "../util/time.js";

export function makeAdminRoutes({ state, paidByCycle, pushState, wsBroadcast, getPublicState }) {
  const router = express.Router();

  function requireAdmin(req, res) {
    const key = req.header("x-admin-key");
    if (!key || key !== ADMIN_KEY) {
      res.status(401).json({ error: "unauthorized" });
      return false;
    }
    return true;
  }

  router.post("/api/admin/ping", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ ok: true });
  });

  router.post("/api/admin/set_prize", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const cents = Number(req.body?.prizeCents);
    if (!Number.isFinite(cents) || cents < 0) return res.status(400).json({ error: "prize_required" });

    state.prizeCents = Math.floor(cents);
    state.version++;
    pushState();
    res.json({ ok: true, state: getPublicState() });
  });

  router.post("/api/admin/set_prices", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { priceA, priceB, priceC } = req.body || {};
    const a = Number(priceA),
      b = Number(priceB),
      c = Number(priceC);

    if (![a, b, c].every((x) => Number.isFinite(x) && x >= 0)) {
      return res.status(400).json({ error: "prices_required" });
    }

    state.priceA = Math.floor(a);
    state.priceB = Math.floor(b);
    state.priceC = Math.floor(c);

    state.version++;
    pushState();
    res.json({ ok: true, state: getPublicState() });
  });

  router.post("/api/admin/set_banner", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const text = String(req.body?.text ?? "");
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 160);

    state.bannerText = clean;
    state.version++;
    pushState();

    res.json({ ok: true, bannerText: state.bannerText });
  });

  router.post("/api/admin/set_cipher_instructions", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const text = String(req.body?.text ?? "");
    const clean = text.trim().slice(0, 1000);

    state.cipherInstructions = clean;
    state.version++;
    pushState();

    res.json({ ok: true, cipherInstructions: state.cipherInstructions });
  });

  router.post("/api/admin/set_cipher", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const title = String(req.body?.title ?? "").trim().slice(0, 80);
    const body = String(req.body?.body ?? "").slice(0, 5000);
    const hint = String(req.body?.hint ?? "").trim().slice(0, 200);

    state.cipherConfig = { title, body, hint };
    state.version++;
    pushState();

    res.json({ ok: true });
  });

  router.post("/api/admin/start", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const safe = (n) => (Number.isFinite(n) && n >= 0 ? n : 0);
    const days = safe(Number(req.body?.days || 0));
    const hours = safe(Number(req.body?.hours || 0));
    const minutes = safe(Number(req.body?.minutes || 0));
    const seconds = safe(Number(req.body?.seconds || 0));

    const durationMs =
      Math.floor(days) * 24 * 60 * 60 * 1000 +
      Math.floor(hours) * 60 * 60 * 1000 +
      Math.floor(minutes) * 60 * 1000 +
      Math.floor(seconds) * 1000;

    if (durationMs <= 0) return res.status(400).json({ error: "duration_required" });

    if (!paidByCycle.has(state.cycleId)) paidByCycle.set(state.cycleId, new Set());

    state.status = "RUNNING";
    state.durationMs = durationMs;
    state.endAt = now() + durationMs;
    state.cipherUntil = null;
    state.cycleEndsAt = state.endAt + state.cipherSeconds * 1000;
    state.version++;

    pushState();
    res.json({ ok: true, state: getPublicState() });
  });

  router.post("/api/admin/reset", (req, res) => {
    if (!requireAdmin(req, res)) return;

    state.status = "ENDED";
    state.endAt = null;
    state.durationMs = 0;
    state.cipherUntil = null;
    state.version++;

    state.cycleId++;
    state.cycleEndsAt = null;
    if (!paidByCycle.has(state.cycleId)) paidByCycle.set(state.cycleId, new Set());

    pushState();
    wsBroadcast({ type: "RESET" });
    res.json({ ok: true, state: getPublicState() });
  });

  router.post("/api/admin/set_boxes", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const timer = String(req.body?.timerBoxText ?? "");
    const ended = String(req.body?.endedBoxText ?? "");

    const cleanTimer = timer.replace(/\s+/g, " ").trim().slice(0, 160);
    const cleanEnded = ended.replace(/\s+/g, " ").trim().slice(0, 160);

    state.timerBoxText = cleanTimer;
    state.endedBoxText = cleanEnded;

    state.version++;
    pushState();

    res.json({
      ok: true,
      timerBoxText: state.timerBoxText,
      endedBoxText: state.endedBoxText,
      state: getPublicState(),
    });
  });

  return router;
}
