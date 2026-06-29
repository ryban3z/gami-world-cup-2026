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
// it is mathematically guaranteed to finish 1st or 2nd no matter how the
// remaining group games go, so the qualify reward can be credited mid-group-stage,
// before the R32 bracket is populated.
//
// We decide this by *enumerating every possible completion* of the group's
// unplayed games (each is a home win / draw / away win) and checking that in all
// of them at most one other team can finish at or above the team's points. A
// simple per-rival "can they reach my points?" bound is NOT enough: two rivals
// that still have to play each other can't both win, so the bound over-counts
// threats and under-credits real clinches (e.g. a team on 6 pts whose two chasers
// face each other). Enumeration captures that coupling exactly. A 4-team group has
// at most 6 remaining games (3^6 = 729 combinations), so this is cheap.
//
// Sound by construction: a team is only marked when it can never be pushed below
// 2nd, so it never over-awards. (The 8 best-3rd-placed qualifiers can't be known
// until every group finishes; they get credited later when their R32 fixture
// appears — see deriveStandings.) Assumes the full group fixture list is present
// (unplayed games as `scheduled` rows), which the seed guarantees.
export function deriveGroupQualified(matches: MatchRow[]): Set<string> {
  type Group = { points: Map<string, number>; remaining: [string, string][] };
  const groups = new Map<string, Group>();
  const group = (letter: string): Group => {
    let g = groups.get(letter);
    if (!g) { g = { points: new Map(), remaining: [] }; groups.set(letter, g); }
    return g;
  };
  const bump = (g: Group, id: string, pts: number) =>
    g.points.set(id, (g.points.get(id) ?? 0) + pts);

  for (const m of matches) {
    if (m.stage !== "group" || !m.group_letter) continue;
    const g = group(m.group_letter);
    // Register both teams so they're ranked even on 0 points.
    for (const id of [m.home_team_id, m.away_team_id]) if (id && !g.points.has(id)) g.points.set(id, 0);
    if (m.status === "final") {
      if (m.winner_team_id) bump(g, m.winner_team_id, 3);
      else { // draw — no recorded winner
        if (m.home_team_id) bump(g, m.home_team_id, 1);
        if (m.away_team_id) bump(g, m.away_team_id, 1);
      }
    } else if (m.home_team_id && m.away_team_id) {
      g.remaining.push([m.home_team_id, m.away_team_id]);
    }
  }

  const qualified = new Set<string>();
  for (const g of groups.values()) {
    const teams = [...g.points.keys()];
    const n = g.remaining.length;
    // Worst case per team: the most other teams that ever finish at-or-above it
    // across every completion. ≤1 ⇒ can never drop below 2nd ⇒ clinched top 2.
    const worstAtOrAbove = new Map<string, number>(teams.map((t) => [t, 0]));
    for (let combo = 0; combo < 3 ** n; combo++) {
      const pts = new Map(g.points);
      let c = combo;
      for (const [home, away] of g.remaining) {
        const outcome = c % 3; c = Math.floor(c / 3);
        if (outcome === 0) pts.set(home, (pts.get(home) ?? 0) + 3);       // home win
        else if (outcome === 2) pts.set(away, (pts.get(away) ?? 0) + 3);  // away win
        else { pts.set(home, (pts.get(home) ?? 0) + 1); pts.set(away, (pts.get(away) ?? 0) + 1); } // draw
      }
      for (const t of teams) {
        const tp = pts.get(t) ?? 0;
        let atOrAbove = 0;
        for (const o of teams) if (o !== t && (pts.get(o) ?? 0) >= tp) atOrAbove += 1;
        if (atOrAbove > worstAtOrAbove.get(t)!) worstAtOrAbove.set(t, atOrAbove);
      }
    }
    for (const t of teams) if (worstAtOrAbove.get(t)! <= 1) qualified.add(t);
  }
  return qualified;
}

export function deriveStandings(matches: MatchRow[]): StandingRow[] {
  const groupQualified = deriveGroupQualified(matches);
  const acc = new Map<string, { stage: MatchStage; match: MatchRow }>();
  const championOf = (m: MatchRow) =>
    m.stage === "final" && m.status === "final" ? m.winner_team_id : null;
  let champion: string | null = null;

  // A team's group is finished once every group-stage match in its letter is
  // final — needed below to tell "still has games left to clinch" apart from
  // "group's over and they missed the cut" for the never-qualified case.
  const groupFinished = new Map<string, boolean>();
  for (const m of matches) {
    if (m.stage !== "group" || !m.group_letter) continue;
    const finished = groupFinished.get(m.group_letter) ?? true;
    groupFinished.set(m.group_letter, finished && m.status === "final");
  }

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
    const qualified =
      groupQualified.has(team_id) || STAGE_RANK[stage] >= STAGE_RANK["r32"];
    // Knockout exit: lost the furthest match they reached beyond the groups.
    // Group exit: their group has finished and they never qualified (covers
    // both the clinched-top-2 case and the best-3rd-placed R32 case) — a team
    // stuck at furthest_stage="group" otherwise never gets marked eliminated.
    const is_eliminated =
      !is_champion &&
      (stage !== "group"
        ? match.status === "final" && match.winner_team_id !== team_id
        : !qualified && (groupFinished.get(match.group_letter ?? "") ?? false));
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
  group: number;        // group_qualify + group_win (kept for back-compat)
  group_qualify: number; // qualify reward only
  group_win: number;     // per-group-win points only
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
  // Once the knockout re-allocation has resolved, every manager's final roster
  // is materialized as phase='knockout' rows, so the knockout map is authoritative
  // — a dropped (or undrafted) team correctly has no knockout owner. Before that
  // (no knockout rows yet) we fall back to the group owner, so knockout ladder
  // points show through during the group stage. resolve_knockout_realloc() is the
  // only path to knockout_locked, so this flips exactly when ownership is complete.
  const knockoutMaterialized = knockoutOwner.size > 0;
  const koOwner = (team: string) =>
    knockoutMaterialized ? (knockoutOwner.get(team) ?? null) : (groupOwner.get(team) ?? null);
  const ladder = new Map(rules.map((r) => [r.stage, r.points]));

  const blank = (): ScoreBreakdown =>
    ({ group: 0, group_qualify: 0, group_win: 0, knockout: 0, bonus: 0, by_team: [] });
  const acc = new Map<string, ScoreBreakdown>();
  for (const id of userIds) acc.set(id, blank());
  const ensure = (id: string) => {
    let b = acc.get(id);
    if (!b) { b = blank(); acc.set(id, b); }
    return b;
  };

  // Group-stage points accrue to the phase='group' owner. Qualify and per-win are
  // tracked separately (so the breakdown can show the split) but merged into a
  // single per-team line; the knockout ladder is separate and routes to the
  // knockout owner.
  const qualifyByTeam = new Map<string, number>();
  const winByTeam = new Map<string, number>();
  const addGroupPts = (bucket: Map<string, number>, team: string, pts: number) => {
    if (pts <= 0 || !groupOwner.has(team)) return;
    bucket.set(team, (bucket.get(team) ?? 0) + pts);
  };

  for (const s of standings) {
    // qualified covers both a clinched top-2 group finish and an R32-bracket
    // appearance (best-3rd qualifiers) — see deriveStandings / deriveGroupQualified.
    if (s.qualified) addGroupPts(qualifyByTeam, s.team_id, config.group_qualify_pts);

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
    addGroupPts(winByTeam, m.winner_team_id, config.group_win_pts);
  }

  for (const team of new Set([...qualifyByTeam.keys(), ...winByTeam.keys()])) {
    const qualify = qualifyByTeam.get(team) ?? 0;
    const win = winByTeam.get(team) ?? 0;
    const b = ensure(groupOwner.get(team)!);
    b.group_qualify += qualify;
    b.group_win += win;
    b.group += qualify + win;
    b.by_team.push({ team, phase: "group", points: qualify + win });
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
