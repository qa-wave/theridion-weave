import { NextResponse } from "next/server";
import { SESSION_COOKIE, checkPassword, createSessionToken, isAuthConfigured, sessionMaxAge } from "@/lib/auth";

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Auth není nakonfigurováno" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const password = (body as { password?: unknown }).password;
  if (typeof password !== "string" || !checkPassword(password)) {
    return NextResponse.json({ error: "Špatné heslo" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(Date.now()), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
  return res;
}
