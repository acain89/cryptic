// backend/src/server.js
import express from "express";
import http from "http";
import cors from "cors";
import bcrypt from "bcryptjs";

import { PORT, ALLOWED_ORIGIN } from "./config.js";

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
import session from "express-session";


const app = express();

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
  })
);

app.use(session({
  secret: PASS_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false }
}));

/* SERVER + WS */
const server = http.createServer(app);
const getPublicState = () => _getPublicState(state);
const { wsBroadcast, pushState } = initWs({ server, getPublicState });

/* STRIPE WEBHOOK */
app.use(makeStripeWebhookRoute({ state, paidByCycle }));

/* JSON BODY */
app.use(express.json({ limit: "256kb" }));

/* ANSWER NORMALIZATION */
function normalizeAnswer(s = "") {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/* AUTH MIDDLEWARE */
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ ok: false });
  next();
}

/* SOLVE MIDDLEWARE */
function requirePaidForSolve(req, res, next) {
  const cycleId = state.cycleId;
  const userId = req.session.user.id;
  const paid = paidByCycle[cycleId]?.[userId];
  if (!paid) return res.status(403).json({ ok: false });
  next();
}

/* ROUTES */
app.use(makeBasicRoutes({ getPublicState }));
app.use(makeSolveRoutes({ state, paidByCycle, wsBroadcast }));
app.use(makeAuthRoutes({ state, paidByCycle, devicePasswords }));
app.use(makeCheckoutRoutes({ state, paidByCycle }));
app.use(
  "/api/solve",
  requireAuth,
  requirePaidForSolve,
  express.Router()
    .get("/state", (req, res) => {
      const cycleId = state.cycleId;
      const userId = req.session.user.id;
      const used = state.attempts?.[`${cycleId}:${userId}`]?.used || 0;
      const attemptsRemaining = Math.max(0, 3 - used);
      const phase = state.phase;
      const now = Date.now();
      const solveEndsAt = state.zeroAt + 24 * 3600 * 1000;
      const revealEndsAt = solveEndsAt + 8 * 3600 * 1000;
      const timeLeftMs = phase === "SOLVE" ? solveEndsAt - now : phase === "REVEAL" ? revealEndsAt - now : 0;
      const solved = !!state.winner;
      const canSubmit = !solved && phase === "SOLVE" && attemptsRemaining > 0;
      const revealOpen = phase === "REVEAL";
      const cipher = solved || phase !== "SOLVE" ? null : state.cipher;

      res.json({
        phase,
        cycleId,
        timeLeftMs: Math.max(0, timeLeftMs),
        solved,
        canSubmit,
        revealOpen,
        attemptsRemaining,
        canSubmit,
        cipher,
      });
    })
    .post("/submit", (req, res) => {
      const { answer } = req.body;
      const cycleId = state.cycleId;
      const userId = req.session.user.id;
      const key = `${cycleId}:${userId}`;
      state.attempts[key] ||= { used: 0 };
      if (state.winner) return res.json({ ok: false, solved: true });
      if (state.phase !== "SOLVE") return res.json({ ok: false });
      if (state.attempts[key].used >= 3) return res.json({ ok: false, lockedOut: true });

      const normIn = normalizeAnswer(answer);
      const normAns = normalizeAnswer(state.canonicalAnswer);
      state.attempts[key].used++;

      if (normIn === normAns && !state.winner) {
        state.winner = { userId, un: req.session.user.un, ts: now, answer: normAns };
        wsBroadcast("SOLVED", { un: req.session.user.un, ts: state.winner.ts });
        return res.json({ ok: true, solved: true });
      }

      const attemptsRemaining = Math.max(0, 3 - state.attempts[key].used);
      res.json({ ok: false, attemptsRemaining, lockedOut: attemptsRemaining === 0 });
    })
);

/* ADMIN ROUTES */
app.use(makeAdminRoutes({ state, paidByCycle, pushState, wsBroadcast, getPublicState }));

/* TICK LOOP */
startTickLoop({ state, paidByCycle, wsBroadcast, pushState });

/* START */
server.listen(PORT, () => {
  console.log(`[cryptic] server listening on :${PORT}`);
  console.log(`[cryptic] ws path: /ws`);
});
