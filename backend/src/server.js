// backend/src/server.js
import express from "express";
import http from "http";
import cors from "cors";
import session from "express-session";

import { PORT, ALLOWED_ORIGIN, PASS_SECRET } from "./config.js";

import { state, paidByCycle, devicePasswords } from "./state/store.js";
import { getPublicState as _getPublicState } from "./state/publicState.js";
import { initWs } from "./ws/ws.js";
import { startTickLoop } from "./state/tick.js";

import { makeStripeWebhookRoute } from "./routes/stripeWebhook.js";
import { makeBasicRoutes } from "./routes/basicRoutes.js";
import { makeAuthRoutes } from "./routes/authRoutes.js";
import { makeCheckoutRoutes } from "./routes/checkoutRoutes.js";
import { makeAdminRoutes } from "./routes/adminRoutes.js";
import { makeSolveRoutes } from "./routes/solveRoutes.js";
import { initFirebaseAdmin } from "./firebaseAdmin.js";
import { requireFirebaseAuth } from "./middleware/requireFirebaseAuth.js";


/**
 * Force a stable server timezone for weekly schedule logic.
 * (Recommended: also set TZ=America/Chicago in Render env vars.)
 */
if (!process.env.TZ) process.env.TZ = "America/Chicago";

const app = express();

initFirebaseAdmin();

// If deploying behind Render/NGINX/Cloudflare etc, this enables secure cookies + correct IPs
app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";
app.use(makeStripeWebhookRoute({ paidByCycle }));


/* CORS */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGIN === "*") return cb(null, true);
      if (origin === ALLOWED_ORIGIN) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 204,
    allowedHeaders: ["Content-Type", "x-admin-key", "Authorization"],
  })
);

/* SESSION */
app.use(
  session({
    secret: PASS_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd, // true on HTTPS in production
    },
  })
);

/* SERVER + WS */
const server = http.createServer(app);
const getPublicState = () => _getPublicState(state);
const { wsBroadcast, pushState } = initWs({ server, getPublicState });

/* STRIPE WEBHOOK (must be before json if using raw body inside webhook route) */
app.use(makeStripeWebhookRoute({ state, paidByCycle }));

/* JSON BODY */
app.use(express.json({ limit: "256kb" }));

app.get("/api/me", requireFirebaseAuth, (req, res) => {
  res.json({ ok: true, uid: req.user.uid, email: req.user.email });
});


/* ROUTES */
app.use(makeBasicRoutes({ getPublicState }));

// ✅ authRoutes version you currently have reads state from store.js internally
app.use(makeAuthRoutes({ paidByCycle, devicePasswords }));

app.use(makeCheckoutRoutes({ state, paidByCycle }));

// NOTE: pushState passed in so solve submissions/winner updates can broadcast cleanly.
app.use(makeSolveRoutes({ state, paidByCycle, wsBroadcast, pushState }));

app.use(
  makeAdminRoutes({ state, paidByCycle, pushState, wsBroadcast, getPublicState })
);

/* TICK LOOP */
startTickLoop({ state, paidByCycle, wsBroadcast, pushState });

/* START */
server.listen(PORT, () => {
  console.log(`[cryptic] server listening on :${PORT}`);
  console.log(`[cryptic] ws path: /ws`);
  console.log(`[cryptic] TZ=${process.env.TZ}`);
  console.log(
    `[cryptic] schedule: RUNNING Sun 12:00 → Sat 08:00, CIPHER Sat 08:00 → Sun 08:00 (America/Chicago)`
  );
});
