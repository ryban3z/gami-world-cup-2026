"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailForDisplayName } from "@/lib/identity";

export async function register(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) redirect("/register?error=Display+name+required");

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: emailForDisplayName(displayName),
    password,
    options: { data: { display_name: displayName } },
  });
  // A taken name surfaces here: duplicate synthetic email (auth.users) or
  // duplicate display_name (profiles unique, via the new-user trigger).
  if (error) {
    const taken = /already|exists|duplicate|registered/i.test(error.message);
    const msg = taken ? "That name is already taken — pick another." : error.message;
    redirect(`/register?error=${encodeURIComponent(msg)}`);
  }
  redirect("/home");
}

export async function login(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailForDisplayName(displayName),
    password,
  });
  if (error) redirect(`/login?error=Wrong+name+or+password`);
  redirect("/home");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
