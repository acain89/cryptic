// backend/routes/stripeWebhook.js
import express from "express";
import Stripe from "stripe";

export default function stripeWebhook({ markPaidForCycle }) {
  const router = express.Router();

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  // IMPORTANT: this route must use raw body middleware (see server.js section below)
  router.post("/webhook", async (req, res) => {
    let event;

    try {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe/webhook] signature verify failed:", err?.message || err);
      return res.status(400).send("Webhook Error");
    }

    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object;
        const meta = session.metadata || {};
        const deviceId = String(meta.deviceId || "");
        const cycleId = String(meta.cycleId || "");
        const sessionId = String(session.id || "");

        if (deviceId && cycleId) {
          markPaidForCycle({ deviceId, cycleId, sessionId });
        }
      }

      return res.json({ received: true });
    } catch (e) {
      console.error("[stripe/webhook] handler failed:", e);
      return res.status(500).json({ error: "webhook_failed" });
    }
  });

  return router;
}
