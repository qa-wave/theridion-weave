import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthConfigured, verifySessionToken } from "@/lib/auth";

// Paths reachable without a session: login UI/API, health probe, and the
// machine-to-machine ingest endpoint (it has its own bearer token).
const PUBLIC = [/^\/login/, /^\/api\/auth\/login/, /^\/api\/health/, /^\/api\/runs\/ingest/, /^\/api\/db\//];

// Next.js 16 request proxy (replaces middleware.ts). Adds hardening headers and,
// when auth is configured (WEAVE_ACCESS_PASSWORD + SESSION_SECRET), gates the app
// behind a session cookie. Without auth configured the app is open (demo mode).
export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("X-DNS-Prefetch-Control", "off");

  if (!isAuthConfigured()) return res;

  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return res;

  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, Date.now())) return res;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
