import { describe, it, expect } from "vitest";
import {
  normalizeAnswer, deriveStandings, deriveGroupQualified, computeScores,
  type MatchRow, type ComputeInput,
} from "@/lib/scoring";

describe("normalizeAnswer", () => {
  it("strips case, accents, and punctuation", () => {
    expect(normalizeAnswer("Mbappé")).toBe("mbappe");
    expect(normalizeAnswer("  MBAPPE  ")).toBe("mbappe");
    expect(normalizeAnswer("L. Messi")).toBe("l messi");
    expect(normalizeAnswer("Mbappe")).toBe(normalizeAnswer("Mbappé"));
  });
});

// Bracket: A,B reach final (A champion); C,D reach SF (C plays 3rd place);
// E,F reach QF; G reaches R16; H,I,J,K qualify (R32) but lose; Z undrafted qualifier.
const M = (o: Partial<MatchRow>): MatchRow => ({
  external_id: "x", stage: "group", group_letter: null, home_team_id: null, away_team_id: null,
  winner_team_id: null, status: "scheduled", ...o,
});
const matches: MatchRow[] = [
  M({ stage: "final", home_team_id: "A", away_team_id: "B", winner_team_id: "A", status: "final" }),
  M({ stage: "sf", home_team_id: "A", away_team_id: "C", winner_team_id: "A", status: "final" }),
  M({ stage: "sf", home_team_id: "B", away_team_id: "D", winner_team_id: "B", status: "final" }),
  M({ stage: "third_place", home_team_id: "C", away_team_id: "D", winner_team_id: "C", status: "final" }),
  M({ stage: "qf", home_team_id: "C", away_team_id: "E", winner_team_id: "C", status: "final" }),
  M({ stage: "qf", home_team_id: "D", away_team_id: "F", winner_team_id: "D", status: "final" }),
  M({ stage: "r16", home_team_id: "E", away_team_id: "G", winner_team_id: "E", status: "final" }),
  M({ stage: "r32", home_team_id: "G", away_team_id: "H", winner_team_id: "G", status: "final" }),
  M({ stage: "r32", home_team_id: "I", away_team_id: "Z", winner_team_id: "I", status: "scheduled" }),
  M({ stage: "r32", home_team_id: "J", away_team_id: "K", winner_team_id: null, status: "scheduled" }),
];

describe("deriveStandings", () => {
  const byId = Object.fromEntries(deriveStandings(matches).map((s) => [s.team_id, s]));
  it("champion flagged from final winner", () => {
    expect(byId["A"]).toMatchObject({ furthest_stage: "final", is_champion: true, is_eliminated: false });
  });
  it("runner-up reached final, eliminated, not champion", () => {
    expect(byId["B"]).toMatchObject({ furthest_stage: "final", is_champion: false, is_eliminated: true });
  });
  it("third-place participants count as SF, never above", () => {
    expect(byId["C"].furthest_stage).toBe("sf");
    expect(byId["D"].furthest_stage).toBe("sf");
  });
  it("R32 appearance counts as qualified even if not yet played", () => {
    expect(byId["Z"].furthest_stage).toBe("r32"); // undrafted but qualified
    expect(byId["J"].furthest_stage).toBe("r32");
  });
});

// A complete Group A bar GA's last game: GA & GD have clinched the top two
// (GA 6pts + 1 to play; GD 6pts; GB 3; GC 0) — neither can be caught for a
// top-2 spot regardless of GA's final result.
const groupGame = (home: string, away: string, winner: string | null, status: MatchRow["status"] = "final") =>
  M({ stage: "group", group_letter: "A", home_team_id: home, away_team_id: away, winner_team_id: winner, status });
const clinchedGroupA: MatchRow[] = [
  groupGame("GA", "GB", "GA"),
  groupGame("GA", "GC", "GA"),
  groupGame("GB", "GC", "GB"),
  groupGame("GD", "GB", "GD"),
  groupGame("GD", "GC", "GD"),
  groupGame("GA", "GD", null, "scheduled"), // GA's last game still to play
];

describe("deriveGroupQualified", () => {
  it("marks teams mathematically guaranteed a top-2 finish", () => {
    expect([...deriveGroupQualified(clinchedGroupA)].sort()).toEqual(["GA", "GD"]);
  });
  it("nobody clinches early — too many teams can still catch up", () => {
    // Full round-robin seeded up front (as the app does); only matchday 1 played.
    const early = [
      groupGame("GA", "GB", "GA"),
      groupGame("GC", "GD", "GC"),
      groupGame("GA", "GC", null, "scheduled"),
      groupGame("GA", "GD", null, "scheduled"),
      groupGame("GB", "GC", null, "scheduled"),
      groupGame("GB", "GD", null, "scheduled"),
    ];
    expect(deriveGroupQualified(early).size).toBe(0);
  });
  it("ignores group matches with no group_letter", () => {
    const noLetter = [M({ stage: "group", home_team_id: "X", away_team_id: "Y", winner_team_id: "X", status: "final" })];
    expect(deriveGroupQualified(noLetter).size).toBe(0);
  });

  it("clinches a leader whose two chasers still have to play each other", () => {
    // Group D shape (USA case): US 6pts w/ 1 to play; PAR & AUS both on 3 and
    // face each other, so they can't both reach 6 — US is guaranteed top 2.
    const d = [
      groupGame("US", "PAR", "US"),     // matchday 1
      groupGame("AUS", "TUR", "AUS"),
      groupGame("US", "AUS", "US"),     // matchday 2
      groupGame("PAR", "TUR", "PAR"),
      groupGame("US", "TUR", null, "scheduled"),  // matchday 3 (to play)
      groupGame("PAR", "AUS", null, "scheduled"), // chasers meet
    ];
    expect(deriveGroupQualified(d).has("US")).toBe(true);
  });
});

const config = { group_qualify_pts: 4, group_win_pts: 1, bonus_correct_pts: 4, champion_pts: 6 };
const rules = [
  { stage: "r32", points: 0 }, { stage: "r16", points: 6 }, { stage: "qf", points: 10 },
  { stage: "sf", points: 14 }, { stage: "final", points: 18 },
] as const;

function scoreInput(over: Partial<ComputeInput> = {}): ComputeInput {
  return {
    userIds: ["u1", "u2"],
    standings: deriveStandings(matches),
    matches,
    ownership: [
      { user_id: "u1", team_id: "A", phase: "group" }, // champion, no swap
      { user_id: "u2", team_id: "B", phase: "group" }, // runner-up drafted by u2...
      { user_id: "u1", team_id: "B", phase: "knockout" }, // ...but u1 picked it up for knockouts
    ],
    categories: [
      { id: "c1", key: "tournament_winner", resolved_answer: "Argentina" },
      { id: "c2", key: "golden_boot", resolved_answer: "Mbappé" },
    ],
    predictions: [
      { user_id: "u1", category_id: "c1", pick_value: "Argentina" }, // team-pick correct
      { user_id: "u1", category_id: "c2", pick_value: "mbappe" }, // free-text correct via normalize
      { user_id: "u2", category_id: "c2", pick_value: "Haaland" }, // wrong
    ],
    rules: rules.map((r) => ({ ...r })),
    config,
    ...over,
  };
}

describe("computeScores", () => {
  const byUser = Object.fromEntries(computeScores(scoreInput()).map((s) => [s.user_id, s]));
  it("group-qualify points go to the group owner", () => {
    expect(byUser["u1"].breakdown.group).toBe(4); // owns A (group)
    expect(byUser["u2"].breakdown.group).toBe(4); // owns B (group)
  });
  it("knockout points route to the knockout owner (explicit overrides group)", () => {
    // A champion: ladder final 18 + champion 6 = 24 -> u1 (group owner, no swap).
    // B runner-up: final 18 -> u1 (explicit knockout owner), NOT u2.
    expect(byUser["u1"].breakdown.knockout).toBe(24 + 18);
    expect(byUser["u2"].breakdown.knockout).toBe(0);
  });
  it("bonus: one scoring pick per category, normalized free-text", () => {
    expect(byUser["u1"].breakdown.bonus).toBe(4 + 4);
    expect(byUser["u2"].breakdown.bonus).toBe(0);
  });
  it("totals sum the buckets", () => {
    expect(byUser["u1"].total_points).toBe(4 + (24 + 18) + 8);
  });
  it("undrafted qualifier scores no one", () => {
    const all = computeScores(scoreInput());
    const everyTeam = all.flatMap((s) => s.breakdown.by_team.map((t) => t.team));
    expect(everyTeam).not.toContain("Z");
  });
});

describe("computeScores — group-stage win points", () => {
  const base = (over: Partial<ComputeInput> = {}): ComputeInput => ({
    userIds: ["u1"],
    standings: [],
    matches: [],
    ownership: [{ user_id: "u1", team_id: "A", phase: "group" }],
    categories: [],
    predictions: [],
    rules: rules.map((r) => ({ ...r })),
    config,
    ...over,
  });
  const run = (over: Partial<ComputeInput>) => computeScores(base(over))[0];

  it("awards group_win_pts per finished group win to the group owner", () => {
    // A's furthest stage is 'group' (not qualified), so this isolates win points.
    const ms = [
      M({ stage: "group", winner_team_id: "A", status: "final" }),
      M({ stage: "group", winner_team_id: "A", status: "final" }),
      M({ stage: "group", winner_team_id: null, status: "final" }), // draw — no points
      M({ stage: "group", winner_team_id: "A", status: "scheduled" }), // not played — no points
    ];
    const s = run({ matches: ms, standings: deriveStandings(ms) });
    expect(s.breakdown.group).toBe(2);
    expect(s.breakdown.group_win).toBe(2);
    expect(s.breakdown.group_qualify).toBe(0);
  });

  it("merges qualify + win points into a single by_team line", () => {
    const ms = [
      M({ stage: "group", winner_team_id: "A", status: "final" }),
      M({ stage: "group", winner_team_id: "A", status: "final" }),
      M({ stage: "r32", home_team_id: "A", status: "scheduled" }), // A advanced → qualifies
    ];
    const s = run({ matches: ms, standings: deriveStandings(ms) });
    expect(s.breakdown.group).toBe(4 + 2); // qualify 4 + 2 wins
    expect(s.breakdown.group_qualify).toBe(4);
    expect(s.breakdown.group_win).toBe(2);
    const aGroup = s.breakdown.by_team.filter((t) => t.team === "A" && t.phase === "group");
    expect(aGroup).toHaveLength(1);
    expect(aGroup[0].points).toBe(6); // still a single merged per-team line
  });

  it("ignores group wins by undrafted teams", () => {
    const ms = [
      M({ stage: "group", winner_team_id: "Z", status: "final" }), // Z undrafted
      M({ stage: "group", winner_team_id: "A", status: "final" }),
    ];
    const s = run({ matches: ms, standings: deriveStandings(ms) });
    expect(s.breakdown.group).toBe(1);
    expect(s.breakdown.by_team.map((t) => t.team)).toEqual(["A"]);
  });

  it("group_win_pts = 0 is inert (migration default)", () => {
    const ms = [M({ stage: "group", winner_team_id: "A", status: "final" })];
    const s = run({ matches: ms, standings: deriveStandings(ms), config: { ...config, group_win_pts: 0 } });
    expect(s.breakdown.group).toBe(0);
    expect(s.breakdown.by_team).toHaveLength(0);
  });

  it("credits the qualify reward once a team clinches, before any R32 fixture", () => {
    // GA owns no R32 row yet but has clinched top-2: 2 group wins (2) + qualify (4).
    const s = run({
      ownership: [{ user_id: "u1", team_id: "GA", phase: "group" }],
      matches: clinchedGroupA,
      standings: deriveStandings(clinchedGroupA),
    });
    expect(s.breakdown.group).toBe(2 + 4);
    expect(s.breakdown.group_qualify).toBe(4);
    expect(s.breakdown.group_win).toBe(2);
  });
});
