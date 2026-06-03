// Pure validation for a single bonus category's two picks. No IO. The database
// (save_bonus_category) enforces the same rule as the backstop; this gives the
// UI a friendly inline error before the round-trip.

export type PicksValidation = { ok: true } | { ok: false; error: string };

/** Two picks in one category must differ (ignoring case/whitespace). Blanks are allowed. */
export function validateCategoryPicks(value1: string, value2: string): PicksValidation {
  const v1 = value1.trim();
  const v2 = value2.trim();
  if (v1 && v2 && v1.toLowerCase() === v2.toLowerCase()) {
    return { ok: false, error: "Your two picks for a category must be different." };
  }
  return { ok: true };
}
