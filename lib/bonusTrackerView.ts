// Pure view logic for the bonus-tracker page. No IO. Cross-references managers'
// Golden Boot picks against the live football-data.org scorers board so the page
// can show who's currently on track. Same lib/*View.ts + colocated test pattern
// as leaderboardView / topScorersView.

import type { TopScorerRow } from "@/lib/topScorersView";

export type GoldenBootStatus = "leading" | "contention" | "off";

export interface GoldenBootPickRow {
  managerName: string;
  playerName: string;
  status: GoldenBootStatus;
  // Live goals + board rank for the picked player, null when not on the board.
  goals: number | null;
  rank: number | null;
}

export interface BootPickInput {
  user_id: string;
  pick_value: string;
  pick_slot: number;
}

// Lenient name matching: lowercase, strip diacritics + punctuation, collapse
// whitespace. Lets a manager's "Mbappé" match the feed's "Kylian Mbappé".
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  // Substring either direction covers "Mbappé" vs "Kylian Mbappé".
  return na === nb || na.includes(nb) || nb.includes(na);
}

// One row per (manager, golden_boot pick). `scorers` must already be ranked
// (buildTopScorers output). Status: leading (their pick tops the board),
// contention (on the board but not #1), or off (not on the board at all). Sorted
// leading-first, then by the picked player's rank, then manager name.
export function buildGoldenBootTracker(
  scorers: TopScorerRow[],
  picks: BootPickInput[],
  nameById: Record<string, string>,
): GoldenBootPickRow[] {
  const rows: GoldenBootPickRow[] = picks.map((p) => {
    const hit = scorers.find((s) => namesMatch(s.playerName, p.pick_value));
    const status: GoldenBootStatus = hit ? (hit.rank === 1 ? "leading" : "contention") : "off";
    return {
      managerName: nameById[p.user_id] ?? "player",
      playerName: p.pick_value,
      status,
      goals: hit?.goals ?? null,
      rank: hit?.rank ?? null,
    };
  });

  const order: Record<GoldenBootStatus, number> = { leading: 0, contention: 1, off: 2 };
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.managerName.localeCompare(b.managerName),
  );
  return rows;
}
