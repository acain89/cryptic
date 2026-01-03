// backend/src/auth/pass.js
import crypto from "crypto";
import { PASS_SECRET } from "../config.js";

export const PASS_COOKIE = "cryptic_pass";

function sign(obj) {
  const json = JSON.stringify(obj);
  const sig = crypto.createHmac("sha256", PASS_SECRET).update(json).digest("hex");
  return Buffer.from(json).toString("base64url") + "." + sig;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;

  const expected = crypto.createHmac("sha256", PASS_SECRET).update(b64).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function setPassCookie(res, { userId, cycleId }, expiresAtMs) {
  const token = sign({ userId, cycleId });
  const expires = new Date(expiresAtMs);
  res.setHeader("Set-Cookie", `${PASS_COOKIE}=${token}; Path=/; Expires=${expires.toUTCString()}; HttpOnly; SameSite=Lax`);
}

export function clearPassCookie(res) {
  res.setHeader("Set-Cookie", `${PASS_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
}

export function passIsValid(req, { state }) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`${PASS_COOKIE}=([^;]+)`));
  const payload = verify(match?.[1] || "");
  if (!payload) return { ok: false, reason: "no_pass" };

  if (payload.cycleId !== state.cycleId) return { ok: false, reason: "cycle_mismatch" };
  if (state.phase !== "SOLVE") return { ok: true, userId: payload.userId, cycleId: payload.cycleId, canSubmit: false };

  const used = state.attempts?.[`${state.cycleId}:${payload.userId}`]?.used || 0;
  const attemptsRemaining = Math.max(0, 3 - used);
  const canSubmit = !state.winner && state.phase === "SOLVE" && attemptsRemaining > 0;

  return { ok: true, userId: payload.userId, cycleId: payload.cycleId, attemptsRemaining, canSubmit };
}

export function requireSolveAuth(ctx) {
  return (req, res, next) => {
    const v = ctx ? passIsValid(req, ctx) : null;
    if (!v?.ok) return res.status(401).json({ ok: false, reason: v?.reason });
    req.session = v;
    next();
  };
}
