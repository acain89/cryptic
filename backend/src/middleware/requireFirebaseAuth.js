// backend/src/middleware/requireFirebaseAuth.js
import { getAdmin } from "../firebaseAdmin.js";

export function requireFirebaseAuth(req, res, next) {
  const admin = getAdmin();
  if (!admin) return res.status(500).json({ error: "firebase_admin_not_ready" });

  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_bearer_token" });

  const idToken = m[1];

  admin
    .auth()
    .verifyIdToken(idToken)
    .then((decoded) => {
      req.user = {
        uid: decoded.uid,
        email: decoded.email || "",
        claims: decoded,
      };
      next();
    })
    .catch(() => res.status(401).json({ error: "invalid_token" }));
}
