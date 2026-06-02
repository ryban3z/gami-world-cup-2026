"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkSitePassword, GATE_COOKIE } from "@/lib/gate";

export async function submitGate(formData: FormData) {
  const input = String(formData.get("password") ?? "");
  if (!checkSitePassword(input, process.env.SITE_PASSWORD)) {
    redirect("/gate?error=1");
  }
  cookies().set(GATE_COOKIE, process.env.GATE_TOKEN!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60, // 60 days
  });
  redirect("/login");
}
