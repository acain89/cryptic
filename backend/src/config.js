// backend/src/config.js
import "dotenv/config";
import Stripe from "stripe";

export const PORT = Number(process.env.PORT || 10000);
export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// default admin key matches your local PS example
export const ADMIN_KEY = process.env.ADMIN_KEY || "893889";

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export const CHECKOUT_SUCCESS_URL =
  process.env.CHECKOUT_SUCCESS_URL ||
  "http://localhost:5173/?success=1&session_id={CHECKOUT_SESSION_ID}";

export const CHECKOUT_CANCEL_URL =
  process.env.CHECKOUT_CANCEL_URL || "http://localhost:5173/?canceled=1";

export const PASS_SECRET = process.env.PASS_SECRET || "CHANGE_ME_PASS_SECRET";

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;
