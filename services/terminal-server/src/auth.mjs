import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Returns "scrypt$<N>$<saltHex>$<hashHex>". */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [scheme, n, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !n || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");

/** Stateless signed session token: "<expiryMs>.<nonce>.<hmac>". */
export function createToken(secret, ttlMs, now = Date.now()) {
  const body = `${now + ttlMs}.${b64(randomBytes(12))}`;
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", secret).update(body).digest();
  let given;
  try {
    given = Buffer.from(parts[2], "base64url");
  } catch {
    return false;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(parts[0]) > now;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isAllowedOrigin(origin, allowed) {
  return typeof origin === "string" && allowed.includes(origin);
}

/** Locks an address out after repeated failed logins. */
export class LoginLimiter {
  constructor({ maxFailures = 5, windowMs = 15 * 60_000, lockMs = 15 * 60_000 } = {}) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.lockMs = lockMs;
    this.state = new Map();
  }
  check(key, now = Date.now()) {
    const s = this.state.get(key);
    if (s?.lockedUntil && s.lockedUntil > now) return { allowed: false, retryAfterMs: s.lockedUntil - now };
    return { allowed: true, retryAfterMs: 0 };
  }
  fail(key, now = Date.now()) {
    let s = this.state.get(key);
    if (!s || now - s.first > this.windowMs) s = { first: now, count: 0, lockedUntil: 0 };
    s.count++;
    if (s.count >= this.maxFailures) s.lockedUntil = now + this.lockMs;
    this.state.set(key, s);
    if (this.state.size > 5000) for (const [k, v] of this.state) if (now - v.first > this.windowMs) this.state.delete(k);
  }
  success(key) {
    this.state.delete(key);
  }
}
