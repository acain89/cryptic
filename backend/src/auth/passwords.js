// backend/src/auth/passwords.js
import bcrypt from "bcryptjs";

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function normId(x) {
  return String(x || "").trim().toLowerCase();
}

export function ensureUserStores(state) {
  state.usersByEmail ||= {};
  state.usersById ||= {};
}

export async function createUser({ state, email, un, password }) {
  ensureUserStores(state);

  const e = normEmail(email);
  if (!e) throw new Error("email_required");

  const existing = state.usersByEmail[e];
  if (existing) return existing;

  const id = e; // simple + stable id
  const passHash = await bcrypt.hash(String(password || ""), 12);

  const user = {
    id,
    email: e,
    un: String(un || "").trim().slice(0, 24) || "UNKNOWN",
    passHash,
    host: false,
    createdAt: Date.now(),
  };

  state.usersByEmail[e] = user;
  state.usersById[normId(id)] = user;
  return user;
}

export function findUserByEmailOrUn(state, login) {
  ensureUserStores(state);

  const s = String(login || "").trim();
  if (!s) return null;

  // Try email
  const e = normEmail(s);
  if (state.usersByEmail[e]) return state.usersByEmail[e];

  // Try UN lookup (linear scan; fine for MVP)
  const targetUn = s.toLowerCase();
  for (const k of Object.keys(state.usersByEmail)) {
    const u = state.usersByEmail[k];
    if (String(u.un || "").trim().toLowerCase() === targetUn) return u;
  }
  return null;
}

export async function verifyPassword(user, password) {
  if (!user?.passHash) return false;
  return bcrypt.compare(String(password || ""), user.passHash);
}
