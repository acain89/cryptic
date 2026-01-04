import { db } from "../config.js";
import { doc, runTransaction } from "firebase/firestore";

export async function claimUsername(uid, username, email) {
  const unKey = username.trim().toLowerCase();

  const unRef = doc(db, "usernames", unKey);
  const userRef = doc(db, "users", uid);

  try {
    await runTransaction(db, async (tx) => {
      const unSnap = await tx.get(unRef);
      if (unSnap.exists()) {
        throw new Error("un_taken");
      }

      tx.set(unRef, {
        uid,
        username,
        email,
        createdAt: Date.now(),
      });

      tx.set(userRef, {
        username,
        email,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }, { merge: true });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.message };
  }
}
