import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 request proxy (replaces the deprecated middleware.ts). Kept thin:
// adds a couple of hardening headers; auth/ingest checks live in route handlers.
export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("X-DNS-Prefetch-Control", "off");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
