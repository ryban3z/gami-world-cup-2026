import { createClient } from "@supabase/supabase-js";

/**
 * Reads the public `registration_open` flag for the landing-page CTA.
 * Uses an anonymous client + a security-definer RPC (no auth, no cookies).
 * Fails closed (returns false) if Supabase is unreachable or env is missing.
 */
export async function isRegistrationOpen(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.rpc("is_registration_open");
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Number of registered players, for landing-page hype copy.
 * Anonymous client + security-definer RPC (exposes only the count).
 * Fails closed (returns 0) if Supabase is unreachable or the RPC is missing.
 */
export async function getRegisteredCount(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return 0;
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.rpc("registered_count");
    return !error && typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}
