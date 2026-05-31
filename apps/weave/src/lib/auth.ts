// ─── Lightweight single-password session auth ────────────────────────────────
//
// Production gating without a full user system (single-tenant v1):
//   - WEAVE_ACCESS_PASSWORD set  → app requires login; one shared password.
//   - SESSION_SECRET             → HMAC key for the signed session cookie.
//   - Neither set                → "demo mode": app is open (dev/preview only).
//
// The session cookie is `weave_session` = base64url(payloadJSON).hmac. Stateless.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "weave_session";
const MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

export function isAuthConfigured(): boolean {
  return !!process.env.WEAVE_ACCESS_PASSWORD && !!process.env.SESSION_SECRET;
}

function key(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET missing or too short");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", key()).update(payload).digest());
}

/** Mint a signed session token valid for MAX_AGE_SEC. */
export function createSessionToken(nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + MAX_AGE_SEC;
  const payload = b64url(Buffer.from(JSON.stringify({ exp })));
  return `${payload}.${sign(payload)}`;
}

export const sessionMaxAge = MAX_AGE_SEC;

/** Verify a session token: valid signature and not expired. */
export function verifySessionToken(token: string | undefined, nowMs: number): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return typeof json.exp === "number" && json.exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

/** Constant-time password check against the configured shared password. */
export function checkPassword(input: string): boolean {
  const pw = process.env.WEAVE_ACCESS_PASSWORD ?? "";
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
