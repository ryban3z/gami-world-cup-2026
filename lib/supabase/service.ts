import { createClient } from "@supabase/supabase-js";

// Service-role client for trusted server-side jobs (cron ingest, recalc, admin
// actions). Uses the secret key and BYPASSES RLS — never import from client code.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("missing Supabase service env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
