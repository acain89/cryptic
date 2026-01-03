// backend/src/util/time.js
export function now() {
  return Date.now();
}

export function dollarsFromCents(c) {
  return `$${((c || 0) / 100).toFixed(2)}`;
}
