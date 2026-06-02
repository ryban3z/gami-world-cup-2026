// Players sign in with a display name + password (no real email). We derive a
// synthetic, deterministic email from the display name so Supabase Auth (which
// keys on email) can be used, and so login can reconstruct the same address.
//
// The synthetic domain never receives mail (email confirmation is disabled and
// there is no email-based password reset in this model — the admin resets).

const SYNTH_DOMAIN = "gami-pool.com";

/** Canonical, deterministic email for a display name. Case/whitespace-insensitive. */
export function emailForDisplayName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "player"}@${SYNTH_DOMAIN}`;
}
