import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { GATE_COOKIE } from "@/lib/gate";

// Public, ungated routes: the marketing landing page and the gate itself.
function isPublic(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/gate");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Gate: app routes require the gate cookie; the landing page (/) stays public.
  const gated =
    request.cookies.get(GATE_COOKIE)?.value === process.env.GATE_TOKEN;
  if (!gated && !isPublic(pathname)) {
    return NextResponse.redirect(new URL("/gate", request.url));
  }

  // 2) Refresh the Supabase session and gate /home behind auth.
  const { response, user } = await updateSession(request);
  if (gated && pathname.startsWith("/home") && !user) {
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
