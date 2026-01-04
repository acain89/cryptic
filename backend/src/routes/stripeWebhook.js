// backend/src/routes/stripeWebhook.js
import express from "express";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../config.js";
import { getAdmin } from "../firebaseAdmin.js";

export function makeStripeWebhookRoute({ paidByCycle }) {
  // IMPORTANT: raw body ONLY here; mounted before express.json()
  const router = express.Router();

  router.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      // Stripe retries on non-2xx
      if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        return res.status(400).send("webhook_not_configured");
      }

      let event;
      try {
        const sig = req.headers["stripe-signature"];
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch {
        return res.status(400).send("bad_signature");
      }

      try {
        const type = event.type;

        const isCheckoutPaidEvent =
          type === "checkout.session.completed" ||
          type === "checkout.session.async_payment_succeeded";

        if (!isCheckoutPaidEvent) return res.json({ received: true });

        const session = event.data.object;

        // Only mark paid if Stripe says paid
        if (session?.payment_status !== "paid") {
          return res.json({ received: true });
        }

        const md = session?.metadata || {};

        // New system uses Firebase uid
        const uid = String(md.uid || "").trim();
        const tier = String(md.tier || "").trim().toUpperCase();
        const cycleId = Number(md.cycleId || 0);

        if (!uid || !Number.isFinite(cycleId) || cycleId <= 0) {
          // Nothing to credit; ack anyway so Stripe doesn't retry forever
          return res.json({ received: true });
        }

        // 1) Update in-memory paidByCycle (keeps your existing runtime gating working)
        let set = paidByCycle.get(cycleId);
        if (!set) {
          set = new Set();
          paidByCycle.set(cycleId, set);
        }
        set.add(uid);

        // 2) Write Firestore join record (source of truth)
        const admin = getAdmin();
        if (admin) {
          const fs = admin.firestore();
          await fs
            .collection("cycles")
            .doc(String(cycleId))
            .collection("joins")
            .doc(uid)
            .set(
              {
                paid: true,
                uid,
                cycleId: String(cycleId),
                tier: ["A", "B", "C"].includes(tier) ? tier : null,
                stripeSessionId: session.id,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
        }

        return res.json({ received: true });
      } catch {
        return res.status(500).json({ error: "webhook_failed" });
      }
    }
  );

  return router;
}
