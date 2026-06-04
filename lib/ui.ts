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
