import express from "express";
import Stripe from "stripe";

export function makeStripeRoutes({ state }) {
  const router = express.Router();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Create checkout session
router.post("/join", async (req, res) => {    
try {
      const tier = String(req.body?.tier || "B").toUpperCase();
      const amount = tier === "A" ? state.priceA : tier === "C" ? state.priceC : state.priceB;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: process.env.CHECKOUT_SUCCESS_URL,
        cancel_url: process.env.CHECKOUT_CANCEL_URL,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Number(amount),
              product_data: { name: "Cryptic Entry" },
            },
          },
        ],
        metadata: { tier, cycleId: String(state.cycleId || 0) },
      });

      return res.json({ ok: true, url: session.url });
    } catch (e) {
      return res.status(500).json({ ok: false, code: "stripe_create_failed" });
    }
  });

  return router;
}
