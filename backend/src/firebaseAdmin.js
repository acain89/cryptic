// backend/src/firebaseAdmin.js
import admin from "firebase-admin";

function parseServiceAccountJSON() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    // Render often stores JSON as a single line string
    return JSON.parse(raw);
  } catch (e) {
    // If someone pasted it with escaped newlines, try a cleanup
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

  admin.initializeApp({
    credential: admin.credential.cert(svc),
  });

  console.log("[cryptic] Firebase Admin initialized");
  return admin;
}

export function getAdmin() {
  return admin.apps.length ? admin : null;
}
