// backend/src/routes/checkoutRoutes.js
import express from "express";
import { stripe, CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL } from "../config.js";
import { requireFirebaseAuth } from "../middleware/requireFirebaseAuth.js";

export function makeCheckoutRoutes({ state }) {
  const router = express.Router();

  function priceForTier(tier) {
    const t = String(tier || "B").toUpperCase();
    const priceMap = { A: state.priceA, B: state.priceB, C: state.priceC };
    const amount = Number(priceMap[t] ?? state.priceB) || 0;
    return { tier: t, amount };
  }

  /**
   * Create Stripe checkout session (Firebase-authenticated)
   * Headers:
   *   Authorization: Bearer <firebaseIdToken>
   * Body:
   *   { tier: "A"|"B"|"C" }
   */
  router.post("/api/checkout/create_session", requireFirebaseAuth, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ ok: false, code: "stripe_not_configured" });
      }

      const uid = req.user.uid;

      // If cipher window ended, this cycle is expired
      if (state?.cipherUntil && Date.now() >= Number(state.cipherUntil)) {
        return res.status(402).json({
          ok: false,
          code: "cycle_expired",
          message: "This cycle has expired. Please enter again.",
          cycleId: Number(state.cycleId || 0),
        });
      }

      const { tier } = req.body || {};
      const { tier: t, amount } = priceForTier(tier);

      if (!["A", "B", "C"].includes(t)) {
        return res.status(400).json({ ok: false, code: "bad_tier" });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ ok: false, code: "invalid_amount" });
      }

      const cycleId = Number(state.cycleId || 0);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: CHECKOUT_SUCCESS_URL,
        cancel_url: CHECKOUT_CANCEL_URL,

        client_reference_id: uid, // helps in Stripe dashboard

        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.floor(amount),
              product_data: { name: "Access" },
            },
            quantity: 1,
          },
        ],

        metadata: {
          cycleId: String(cycleId),
          uid,
          tier: t,
        },
      });

      return res.json({ ok: true, url: session.url, cycleId });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        code: "stripe_error",
        message: e?.message || "stripe_error",
      });
    }
  });

  // NOTE: /api/checkout/confirm is intentionally removed.
  // Payment confirmation happens via Stripe webhook (source of truth).

  return router;
}
