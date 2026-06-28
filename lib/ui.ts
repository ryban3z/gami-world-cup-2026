// Shared interactive-state classes for buttons, CTAs and links.
//
// The app is mobile-first, where `hover:` does nothing on a touchscreen — so a
// tap needs an `active:` press for feedback. `focus-visible:` adds a keyboard
// focus ring we otherwise lack. Compose these into a button/link's className.

// Keyboard focus ring (gold, offset against the navy page background).
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy";

// Filled/bordered buttons and pill CTAs: tap-press (scale) + focus ring.
// Pairs with each button's own bg/hover styles.
export const pressable = `transition active:scale-95 ${focusRing}`;

// Inline text links (e.g. "Sign out", "← Home"): no transform (inline can't
// scale), so press feedback is a colour shift, plus the same focus ring.
export const pressableLink = `rounded-sm transition hover:text-bodytext active:text-white ${focusRing}`;

// Gold pill CTAs. `ctaFilled` is the primary/urgent action (filled gold),
// `ctaOutline` the secondary (bordered). Both carry the shared press + focus
// states, so call sites just pick a variant by importance.
const ctaBase =
  "inline-block rounded-full px-6 py-3 text-center text-sm font-bold uppercase tracking-wide";
export const ctaFilled = `${ctaBase} bg-gold text-navy hover:brightness-110 ${pressable}`;
export const ctaOutline = `${ctaBase} border border-gold text-gold hover:bg-gold hover:text-navy ${pressable}`;
