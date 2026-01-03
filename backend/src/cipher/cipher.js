// backend/src/cipher/cipher.js
export function getCipherPayload(state) {
  const cfg = state.cipherConfig || {};
  return {
    title: cfg.title || "SEQUENCE",
    body: cfg.body || "...",
    hint: cfg.hint || "",
    expiresInSeconds: state.cipherSeconds,
  };
}
