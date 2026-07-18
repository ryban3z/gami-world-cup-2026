import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { GATE_COOKIE } from "@/lib/gate";

// Public, ungated routes: the marketing landing page, the gate itself, and the
// cron ingest route — Vercel Cron sends no cookies, so the gate would 307 it
// to /gate and ingestion would silently never run. The route does its own auth
// (CRON_SECRET bearer check).
function isPublic(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/gate") ||
    pathname.startsWith("/api/cron")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Gate: app routes require the gate cookie; the landing page (/) stays public.
  // A missing GATE_TOKEN env must fail closed (undefined === undefined is true).
  const gateToken = process.env.GATE_TOKEN;
  const gated =
    !!gateToken && request.cookies.get(GATE_COOKIE)?.value === gateToken;
  if (!gated && !isPublic(pathname)) {
    return NextResponse.redirect(new URL("/gate", request.url));
  }

  // 2) Refresh the Supabase session and gate authed app routes behind login.
  const { response, user } = await updateSession(request);
  const needsAuth =
    pathname.startsWith("/home") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/predictions") ||
    pathname.startsWith("/managers") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/results") ||
    pathname.startsWith("/admin");
  if (gated && needsAuth && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
