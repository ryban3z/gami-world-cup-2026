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

// Categories whose answer is a single team get one pick; everyone else gets two.
// Mirrors PredictionForm's TEAM_PICK_KEYS, the save_bonus_category DB guard, and
// the scoring engine's TEAM_PICK_KEYS — keep the four in sync.
export const TEAM_PICK_KEYS = new Set(["tournament_winner", "runner_up", "wooden_spoon"]);

/** How many picks a category needs to be "complete": 1 for team awards, else 2. */
export function requiredPickCount(categoryKey: string): number {
  return TEAM_PICK_KEYS.has(categoryKey) ? 1 : 2;
}

interface CategoryKeyed {
  id: string;
  key: string;
}
interface UserPick {
  category_id: string;
  pick_value: string;
}

/**
 * True when the given user picks fill every required slot of every active
 * category (1 for team awards, 2 otherwise). Empty/whitespace picks don't count.
 * Returns false when there are no categories (nothing to complete yet).
 */
export function bonusPicksComplete(
  categories: CategoryKeyed[],
  userPicks: UserPick[],
): boolean {
  if (categories.length === 0) return false;
  const filledByCategory = new Map<string, number>();
  for (const p of userPicks) {
    if (p.pick_value && p.pick_value.trim()) {
      filledByCategory.set(p.category_id, (filledByCategory.get(p.category_id) ?? 0) + 1);
    }
  }
  return categories.every(
    (c) => (filledByCategory.get(c.id) ?? 0) >= requiredPickCount(c.key),
  );
}
