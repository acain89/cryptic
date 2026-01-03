// backend/routes/checkoutRoutes.js
import express from "express";
import Stripe from "stripe";

export default function checkoutRoutes({
  getState,             // () => { status, endAt, cipherUntil, prizeCents, priceA, priceB, priceC, ... }
  markPaidForCycle,     // ({ deviceId, cycleId, sessionId }) => void
  isPaidForCycle,       // ({ deviceId, cycleId }) => boolean
  issueCyclePassCookie, // (res, { deviceId, cycleId }) => void
}) {
  const router = express.Router();

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
  if (!STRIPE_SECRET_KEY) {
    console.warn("[stripe] STRIPE_SECRET_KEY missing");
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  const SUCCESS_URL =
    process.env.CHECKOUT_SUCCESS_URL ||
    "http://localhost:5173/?success=1&session_id={CHECKOUT_SESSION_ID}";
  const CANCEL_URL =
    process.env.CHECKOUT_CANCEL_URL || "http://localhost:5173/?canceled=1";

  function resolveTierAmountCents(state, tier) {
    if (tier === "A") return Number(state.priceA || 0);
    if (tier === "B") return Number(state.priceB || 0);
    if (tier === "C") return Number(state.priceC || 0);
    return 0;
  }

  function currentCycleId(state) {
    // Tie cycle access to the countdown target (stable + deterministic)
    // You can switch to a real cycle UUID later without changing frontend.
    return String(state?.endAt || "no_endAt");
  }

  // POST /api/checkout/create_session
  router.post("/create_session", async (req, res) => {
    try {
      const { deviceId, tier } = req.body || {};
      const t = String(tier || "").toUpperCase();

      if (!deviceId) return res.status(400).json({ error: "missing_deviceId" });
      if (!["A", "B", "C"].includes(t)) return res.status(400).json({ error: "bad_tier" });

      const state = getState();
      const cycleId = currentCycleId(state);

      // optional: block checkout if not running/cipher
      if (state.status !== "RUNNING" && state.status !== "CIPHER") {
        return res.status(409).json({ error: "cycle_inactive" });
      }

      // If already paid this cycle, just return a safe redirect target.
      if (isPaidForCycle({ deviceId, cycleId })) {
        return res.json({ url: CANCEL_URL });
      }

      const amount = resolveTierAmountCents(state, t);
      if (!amount || amount < 50) return res.status(400).json({ error: "bad_amount" });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,

        // “illusion of choice” tiers: we don’t describe the tier as different access.
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Cryptic — Cycle Access",
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],

        // Store linkage for confirm/webhook
        metadata: {
          deviceId: String(deviceId),
          tier: t,
          cycleId,
        },
      });

      return res.json({ url: session.url });
    } catch (e) {
      console.error("[checkout/create_session]", e);
      return res.status(500).json({ error: "checkout_failed" });
    }
  });

  // POST /api/checkout/confirm
  // Frontend calls this after redirect with session_id
  router.post("/confirm", async (req, res) => {
    try {
      const { sessionId, deviceId } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: "missing_sessionId" });
      if (!deviceId) return res.status(400).json({ error: "missing_deviceId" });

      const session = await stripe.checkout.sessions.retrieve(String(sessionId));

      // Must be paid
      const paid =
        session.payment_status === "paid" ||
        session.status === "complete";

      if (!paid) {
        return res.status(402).json({ error: "not_paid" });
      }

      const meta = session.metadata || {};
      const cycleId = String(meta.cycleId || currentCycleId(getState()));

      // Important: ensure the confirm is for the same device (prevents reusing session_id)
      if (String(meta.deviceId || "") !== String(deviceId)) {
        return res.status(403).json({ error: "device_mismatch" });
      }

      // Mark paid + issue signed httpOnly cookie pass
      markPaidForCycle({ deviceId: String(deviceId), cycleId, sessionId: String(sessionId) });
      issueCyclePassCookie(res, { deviceId: String(deviceId), cycleId });

      return res.json({ ok: true });
    } catch (e) {
      console.error("[checkout/confirm]", e);
      return res.status(500).json({ error: "confirm_failed" });
    }
  });

  return router;
}
