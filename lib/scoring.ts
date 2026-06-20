// Pure scoring engine. No IO. lib/pipeline.ts reads inputs via the service-role
// client, calls these, and writes team_standings + scores.

export type MatchStage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";
export type OwnerPhase = "group" | "knockout";

// Team-pick categories use a dropdown of seeded team names (safe to compare directly);
// the rest are free text (normalized before comparison). Mirrors PredictionForm.
export const TEAM_PICK_KEYS = new Set(["tournament_winner", "runner_up", "wooden_spoon"]);

const STAGE_RANK: Record<MatchStage, number> = {
  group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third_place: 4, final: 5,
};

export interface MatchRow {
  external_id: string;
  stage: MatchStage;
  group_letter: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  winner_team_id: string | null;
  status: "scheduled" | "live" | "final";
}

export interface StandingRow {
  team_id: string;
  furthest_stage: MatchStage;
  is_eliminated: boolean;
  is_champion: boolean;
  // Clinched a knockout spot: either mathematically guaranteed a top-2 group
  // finish (see deriveGroupQualified) or already drawn into an R32 fixture.
  qualified: boolean;
}

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// A team has clinched a top-2 group finish — and therefore qualification — once
// at most one other team in its group can still reach its current points total.
// That makes it mathematically guaranteed to finish 1st or 2nd no matter how the
// remaining group games go, so the qualify reward can be credited mid-group-stage,
// before the R32 bracket is populated. Sound by construction: a team is only
// marked when it cannot be pushed below 2nd, so it never over-awards. (The 8
// best-3rd-placed qualifiers can't be known until every group finishes; they get
// credited later when their R32 fixture appears — see deriveStandings.)
//
// Assumes the full group fixture list is present (unplayed games as `scheduled`
// rows), which the seed guarantees — "remaining games" is counted from them.
export function deriveGroupQualified(matches: MatchRow[]): Set<string> {
  // group_letter → team_id → { points so far, remaining group games }
  const groups = new Map<string, Map<string, { pts: number; remaining: number }>>();
  const team = (letter: string, id: string) => {
    let g = groups.get(letter);
    if (!g) { g = new Map(); groups.set(letter, g); }
    let t = g.get(id);
    if (!t) { t = { pts: 0, remaining: 0 }; g.set(id, t); }
    return t;
  };

  for (const m of matches) {
    if (m.stage !== "group" || !m.group_letter) continue;
    for (const id of [m.home_team_id, m.away_team_id]) {
      if (!id) continue;
      const t = team(m.group_letter, id);
      if (m.status === "final") {
        if (m.winner_team_id === id) t.pts += 3;       // win
        else if (m.winner_team_id === null) t.pts += 1; // draw (no recorded winner)
        // loss → 0
      } else {
        t.remaining += 1;
      }
    }
  }

  const qualified = new Set<string>();
  for (const g of groups.values()) {
    for (const [id, { pts: floor }] of g) {
      // Floor = current points (worst case: lose every remaining game). Count the
      // other teams whose ceiling can still reach that floor; ≤1 ⇒ guaranteed top 2.
      let canCatch = 0;
      for (const [other, o] of g) {
        if (other !== id && o.pts + 3 * o.remaining >= floor) canCatch += 1;
      }
      if (canCatch <= 1) qualified.add(id);
    }
  }
  return qualified;
}

export function deriveStandings(matches: MatchRow[]): StandingRow[] {
  const groupQualified = deriveGroupQualified(matches);
  const acc = new Map<string, { stage: MatchStage; match: MatchRow }>();
  const championOf = (m: MatchRow) =>
    m.stage === "final" && m.status === "final" ? m.winner_team_id : null;
  let champion: string | null = null;

  for (const m of matches) {
    const c = championOf(m);
    if (c) champion = c;
    if (m.stage === "third_place") continue; // never advances furthest beyond sf
    for (const team of [m.home_team_id, m.away_team_id]) {
      if (!team) continue;
      const cur = acc.get(team);
      if (!cur || STAGE_RANK[m.stage] > STAGE_RANK[cur.stage]) {
        acc.set(team, { stage: m.stage, match: m });
      }
    }
  }

  const rows: StandingRow[] = [];
  for (const [team_id, { stage, match }] of acc) {
    const is_champion = team_id === champion;
    const is_eliminated =
      !is_champion &&
      stage !== "group" &&
      match.status === "final" &&
      match.winner_team_id !== team_id;
    const qualified =
      groupQualified.has(team_id) || STAGE_RANK[stage] >= STAGE_RANK["r32"];
    rows.push({ team_id, furthest_stage: stage, is_eliminated, is_champion, qualified });
  }
  return rows;
}

export interface OwnershipRow {
  user_id: string;
  team_id: string;
  phase: OwnerPhase;
}
export interface CategoryRow {
  id: string;
  key: string;
  resolved_answer: string | null;
}
export interface PredictionRow {
  user_id: string;
  category_id: string;
  pick_value: string;
}
export interface ScoringRule {
  stage: MatchStage;
  points: number;
}
export interface ScoringConfig {
  group_qualify_pts: number;
  group_win_pts: number;
  bonus_correct_pts: number;
  champion_pts: number;
}

export interface ComputeInput {
  userIds: string[];
  standings: StandingRow[];
  matches: MatchRow[];
  ownership: OwnershipRow[];
  categories: CategoryRow[];
  predictions: PredictionRow[];
  rules: ScoringRule[];
  config: ScoringConfig;
}

export interface TeamPoints {
  team: string;
  phase: "group" | "knockout";
  points: number;
}
export interface ScoreBreakdown {
  group: number;
  knockout: number;
  bonus: number;
  by_team: TeamPoints[];
}
export interface ComputedScore {
  user_id: string;
  total_points: number;
  breakdown: ScoreBreakdown;
}

export function computeScores(input: ComputeInput): ComputedScore[] {
  const { userIds, standings, matches, ownership, categories, predictions, rules, config } = input;

  const groupOwner = new Map<string, string>();
  const knockoutOwner = new Map<string, string>();
  for (const o of ownership) {
    (o.phase === "group" ? groupOwner : knockoutOwner).set(o.team_id, o.user_id);
  }
  const koOwner = (team: string) => knockoutOwner.get(team) ?? groupOwner.get(team) ?? null;
  const ladder = new Map(rules.map((r) => [r.stage, r.points]));

  const acc = new Map<string, ScoreBreakdown>();
  for (const id of userIds) acc.set(id, { group: 0, knockout: 0, bonus: 0, by_team: [] });
  const ensure = (id: string) => {
    let b = acc.get(id);
    if (!b) { b = { group: 0, knockout: 0, bonus: 0, by_team: [] }; acc.set(id, b); }
    return b;
  };

  // Group-stage points (qualify + per-win) accrue to the phase='group' owner and
  // are merged into a single per-team line; the knockout ladder is separate and
  // routes to the knockout owner.
  const groupPtsByTeam = new Map<string, number>();
  const addGroupPts = (team: string, pts: number) => {
    if (pts <= 0 || !groupOwner.has(team)) return;
    groupPtsByTeam.set(team, (groupPtsByTeam.get(team) ?? 0) + pts);
  };

  for (const s of standings) {
    // qualified covers both a clinched top-2 group finish and an R32-bracket
    // appearance (best-3rd qualifiers) — see deriveStandings / deriveGroupQualified.
    if (s.qualified) addGroupPts(s.team_id, config.group_qualify_pts);

    const ladderPts = (ladder.get(s.furthest_stage) ?? 0) + (s.is_champion ? config.champion_pts : 0);
    if (ladderPts > 0) {
      const owner = koOwner(s.team_id);
      if (owner) {
        const b = ensure(owner);
        b.knockout += ladderPts;
        b.by_team.push({ team: s.team_id, phase: "knockout", points: ladderPts });
      }
    }
  }

  // Each finished group-stage win earns group_win_pts for the team's group owner.
  for (const m of matches) {
    if (m.stage !== "group" || m.status !== "final" || !m.winner_team_id) continue;
    addGroupPts(m.winner_team_id, config.group_win_pts);
  }

  for (const [team, pts] of groupPtsByTeam) {
    const b = ensure(groupOwner.get(team)!);
    b.group += pts;
    b.by_team.push({ team, phase: "group", points: pts });
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const p of predictions) {
    const cat = catById.get(p.category_id);
    if (!cat || !cat.resolved_answer) continue;
    const key = `${p.user_id}:${p.category_id}`;
    if (seen.has(key)) continue;
    const isTeamPick = TEAM_PICK_KEYS.has(cat.key);
    const match = isTeamPick
      ? p.pick_value.trim() === cat.resolved_answer.trim()
      : normalizeAnswer(p.pick_value) === normalizeAnswer(cat.resolved_answer);
    if (match) {
      seen.add(key);
      ensure(p.user_id).bonus += config.bonus_correct_pts;
    }
  }

  return userIds.map((user_id) => {
    const b = acc.get(user_id)!;
    return { user_id, total_points: b.group + b.knockout + b.bonus, breakdown: b };
  });
}
