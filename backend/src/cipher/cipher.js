// backend/src/cipher/cipher.js

function stripRevealFields(obj) {
  if (!obj || typeof obj !== "object") return obj;

  // Return only what players should see during the cipher window
  const safe = {
    type: obj.type || "UNKNOWN",
    title: obj.title || "SEQUENCE",
    hint: obj.hint || "",
  };

  // CRIP36 payload: show grid only
  if (obj.type === "CRIP36") {
    safe.cols = obj.cols;
    safe.rows = obj.rows;
    safe.grid = obj.grid;
    safe.gridString = obj.gridString;
    // never include: legend, reveal, normalizedAnswer, normalizedPhrase, counts
    return safe;
  }

  // Legacy payload: show title/body/hint
  if (typeof obj.body === "string") safe.body = obj.body;

  // Keep harmless legacy field if present
  if (obj.expiresInSeconds != null) safe.expiresInSeconds = obj.expiresInSeconds;

  return safe;
}

export function getCipherPayload(state) {
  // Prefer the engine snapshot for the active/next cycle
  if (state.cipher && typeof state.cipher === "object") {
    // During the live CIPHER window: strip answers/reveal data
    if (String(state.status || "") === "CIPHER") {
      return stripRevealFields(state.cipher);
    }

    // Outside the cipher window (admin/debug): safe to return full object
    // (PublicState still only exposes hasPreparedCipher; not the cipher blob)
    return state.cipher;
  }

  // Fallback: old config-based cipher
  const cfg = state.cipherConfig || {};
  return {
    title: cfg.title || "SEQUENCE",
    body: cfg.body || "...",
    hint: cfg.hint || "",
    expiresInSeconds: state.cipherSeconds,
  };
}
