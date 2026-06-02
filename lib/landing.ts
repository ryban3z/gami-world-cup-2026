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
