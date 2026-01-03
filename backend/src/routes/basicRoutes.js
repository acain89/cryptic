// backend/src/routes/basicRoutes.js
import express from "express";
import crypto from "crypto";

export function makeBasicRoutes({ getPublicState }) {
  const router = express.Router();

  router.get("/health", (req, res) => res.json({ ok: true }));
  router.get("/api/state", (req, res) => res.json(getPublicState()));

  router.post("/api/device/new", (req, res) => {
    const deviceId = crypto.randomUUID();
    res.json({ deviceId });
  });

  return router;
}
