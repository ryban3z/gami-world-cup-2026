"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkSitePassword, GATE_COOKIE } from "@/lib/gate";

function setGateCookie() {
  cookies().set(GATE_COOKIE, process.env.GATE_TOKEN!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60, // 60 days
  });
}

// Used by the standalone /gate page (redirect-based).
export async function submitGate(formData: FormData) {
  const input = String(formData.get("password") ?? "");
  if (!checkSitePassword(input, process.env.SITE_PASSWORD)) {
    redirect("/gate?error=1");
  }
  setGateCookie();
  redirect("/login");
}

// Used by the inline "Get started" reveal on the landing page (useFormState).
// Returns an inline error on a wrong password instead of navigating away.
export async function enterGate(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const input = String(formData.get("password") ?? "");
  if (!checkSitePassword(input, process.env.SITE_PASSWORD)) {
    return { error: "Wrong password — try again." };
  }
  setGateCookie();
  redirect("/login");
}
