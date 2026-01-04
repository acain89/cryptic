// backend/src/firebaseAdmin.js
import admin from "firebase-admin";

function parseServiceAccountJSON() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    try {
      const cleaned = raw.replace(/\\n/g, "\n");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

export function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  const svc = parseServiceAccountJSON();
  if (!svc) {
    console.warn("[cryptic] FIREBASE_SERVICE_ACCOUNT_JSON not set; Firebase admin disabled");
    return null;
  }

  // 🔥 Use the same env var name you're actually setting
  admin.initializeApp({
    credential: admin.credential.cert(svc),
  });

  console.log("[cryptic] Firebase admin ready");
  return admin;
}

export function getAdmin() {
  return admin.apps.length ? admin : null;
}
