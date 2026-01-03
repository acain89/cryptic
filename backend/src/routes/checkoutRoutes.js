// backend/src/routes/checkoutRoutes.js
import express from "express";
import { stripe, CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL } from "../config.js";
import { setPassCookie } from "../auth/pass.js";

export function makeCheckoutRoutes({ state, paidByCycle }) {
  const router = express.Router();

  router.post("/api/checkout/create_session", async (req, res) => {
    const { userId, tier } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false });

    const t = String(tier || "B").toUpperCase();
    const priceMap = { A: state.priceA, B: state.priceB, C: state.priceC };
    const amount = priceMap[t] ?? state.priceB;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
      line_items: [{ price_data: { currency: "usd", unit_amount: amount, product_data: { name: "Access" } }, quantity: 1 }],
      metadata: { userId: userId.toLowerCase(), cycleId: String(state.cycleId), tier: t }
    });

    res.json({ ok: true, url: session.url });
  });

  router.post("/api/checkout/confirm", async (req, res) => {
    const { sessionId, userId } = req.body || {};
    if (!sessionId || !userId) return res.status(400).json({ ok: false });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return res.status(402).json({ ok: false });

    const paidSet = paidByCycle.get(state.cycleId) || new Set();
    paidSet.add(userId.toLowerCase());
    paidByCycle.set(state.cycleId, paidSet);

    setPassCookie(res, { userId: userId.toLowerCase(), cycleId: state.cycleId }, state.zeroAt + 24*3600*1000);
    res.json({ ok: true });
  });

  return router;
}
