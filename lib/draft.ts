// Canonical snake-draft order math. Pure, no IO. This is mirrored exactly by the
// SQL helper `_draft_player_at` in supabase/migrations/0005_draft.sql — keep them
// in sync. Picks are numbered 0-based: k = 0 … (playerCount * teamsPerPlayer) - 1.

/** 0-based index into `draft_order` of the player who makes pick `pickIndex`. */
export function playerIndexForPick(pickIndex: number, playerCount: number): number {
  const round = Math.floor(pickIndex / playerCount);
  const pos = pickIndex % playerCount;
  // Even rounds (0-based) run forward; odd rounds run reverse — that's the snake.
  return round % 2 === 0 ? pos : playerCount - 1 - pos;
}

/** 1-based round number (1, 2, 3, …) for pick `pickIndex`. */
export function snakeRoundForPick(pickIndex: number, playerCount: number): number {
  return Math.floor(pickIndex / playerCount) + 1;
}
