// backend/src/routes/stripeWebhook.js
import express from "express";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../config.js";

export function makeStripeWebhookRoute({ state, paidByCycle }) {
  // IMPORTANT: raw body ONLY here; mounted before express.json()
  const router = express.Router();

  router.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(400).send("webhook_not_configured");

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        STRIPE_WEBHOOK_SECRET
      );
    } catch {
      return res.status(400).send("bad_signature");
    }

    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object;
        const deviceId = String(session?.metadata?.deviceId || "");
        const cycleId = Number(session?.metadata?.cycleId);

        if (deviceId && Number.isFinite(cycleId) && cycleId === state.cycleId) {
          if (!paidByCycle.has(state.cycleId)) paidByCycle.set(state.cycleId, new Set());
          paidByCycle.get(state.cycleId).add(deviceId);
        }
      }

      res.json({ received: true });
    } catch {
      res.status(500).json({ error: "webhook_failed" });
    }
  });

  return router;
}
