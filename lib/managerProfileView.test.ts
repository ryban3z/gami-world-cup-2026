import { describe, it, expect } from "vitest";
import { buildManagerProfileView, type ManagerProfileInput } from "@/lib/managerProfileView";

const board = [
  { id: "t1", name: "Argentina", flag_url: "ar.png" },
  { id: "t2", name: "Japan", flag_url: "jp.png" },
  { id: "t3", name: "USA", flag_url: null },
];

const categories = [
  { id: "c1", name: "Champion" },
  { id: "c2", name: "Top Scorer" },
  { id: "c3", name: "Wooden Spoon" },
];

function base(overrides: Partial<ManagerProfileInput> = {}): ManagerProfileInput {
  return {
    displayName: "W",
    summary: "A bold strategist.",
    avatarUrl: "/managers/w.jpg",
    isSelf: false,
    targetUserId: "u1",
    rosters: [{ user_id: "u1", team_ids: ["t2", "t1"] }],
    board,
    predictionsLockedAt: "2026-06-11T00:00:00Z",
    categories,
    predictions: [
      { category_id: "c1", pick_slot: 1, pick_value: "Brazil" },
      { category_id: "c2", pick_slot: 2, pick_value: "Mbappé" },
      { category_id: "c2", pick_slot: 1, pick_value: "Haaland" },
    ],
    score: {
      total_points: 14,
      breakdown: {
        group: 6,
        group_qualify: 4,
        group_win: 2,
        knockout: 5,
        bonus: 3,
        by_team: [
          { team: "t1", phase: "group", points: 4 },
          { team: "t1", phase: "knockout", points: 5 },
          { team: "t2", phase: "group", points: 2 },
        ],
      },
    },
    ...overrides,
  };
}

describe("buildManagerProfileView — summary", () => {
  it("passes through a non-empty summary", () => {
    expect(buildManagerProfileView(base()).summary).toBe("A bold strategist.");
  });
  it("trims surrounding whitespace", () => {
    expect(buildManagerProfileView(base({ summary: "  hi  " })).summary).toBe("hi");
  });
  it("maps empty/whitespace/null summary to null", () => {
    expect(buildManagerProfileView(base({ summary: "   " })).summary).toBeNull();
    expect(buildManagerProfileView(base({ summary: "" })).summary).toBeNull();
    expect(buildManagerProfileView(base({ summary: null })).summary).toBeNull();
  });
});

describe("buildManagerProfileView — avatar & initials", () => {
  it("passes through a non-empty avatar path", () => {
    expect(buildManagerProfileView(base()).avatarUrl).toBe("/managers/w.jpg");
  });
  it("trims and maps empty/whitespace/null avatar to null", () => {
    expect(buildManagerProfileView(base({ avatarUrl: "  /a.jpg  " })).avatarUrl).toBe("/a.jpg");
    expect(buildManagerProfileView(base({ avatarUrl: "   " })).avatarUrl).toBeNull();
    expect(buildManagerProfileView(base({ avatarUrl: null })).avatarUrl).toBeNull();
  });
  it("derives one initial from a single-word name", () => {
    expect(buildManagerProfileView(base({ displayName: "W" })).initials).toBe("W");
  });
  it("derives two initials from a single multi-letter word", () => {
    expect(buildManagerProfileView(base({ displayName: "Frimpong" })).initials).toBe("FR");
  });
  it("derives initials from the first two words of a multi-word name", () => {
    expect(buildManagerProfileView(base({ displayName: "tallon d’or" })).initials).toBe("TD");
  });
});

describe("buildManagerProfileView — roster", () => {
  it("is hidden (empty teams) when rosters is null (pre-reveal)", () => {
    const v = buildManagerProfileView(base({ rosters: null }));
    expect(v.rosterVisible).toBe(false);
    expect(v.teams).toEqual([]);
  });
  it("maps the manager's team_ids to board entries in pick order", () => {
    const v = buildManagerProfileView(base());
    expect(v.rosterVisible).toBe(true);
    expect(v.teams).toEqual([
      { name: "Japan", flagUrl: "jp.png", points: 2, status: "kept" },
      { name: "Argentina", flagUrl: "ar.png", points: 9, status: "kept" },
    ]);
  });
  it("falls back to em dash for a team id missing from the board", () => {
    const v = buildManagerProfileView(base({ rosters: [{ user_id: "u1", team_ids: ["t9"] }] }));
    expect(v.teams).toEqual([{ name: "—", flagUrl: null, points: 0, status: "kept" }]);
  });
  it("flags claimed free agents and appends dropped teams (knockout swap)", () => {
    const v = buildManagerProfileView(
      base({
        rosters: [
          {
            user_id: "u1",
            team_ids: ["t1", "t3"], // kept Argentina, claimed USA
            claimed_team_ids: ["t3"],
            dropped_team_ids: ["t2"], // dropped Japan
          },
        ],
      }),
    );
    expect(v.teams).toEqual([
      { name: "Argentina", flagUrl: "ar.png", points: 9, status: "kept" },
      { name: "USA", flagUrl: null, points: 0, status: "claimed" },
      // Dropped team comes last and still shows its banked group points.
      { name: "Japan", flagUrl: "jp.png", points: 2, status: "dropped" },
    ]);
  });
  it("yields empty teams when revealed but this manager has no roster row", () => {
    const v = buildManagerProfileView(base({ rosters: [{ user_id: "other", team_ids: ["t1"] }] }));
    expect(v.rosterVisible).toBe(true);
    expect(v.teams).toEqual([]);
  });
});

describe("buildManagerProfileView — predictions", () => {
  it("hides predictions when not locked and not self", () => {
    const v = buildManagerProfileView(base({ predictionsLockedAt: null, isSelf: false }));
    expect(v.predictionsVisible).toBe(false);
    expect(v.predictionsByCategory).toEqual([]);
  });
  it("shows predictions to self even before lock", () => {
    const v = buildManagerProfileView(base({ predictionsLockedAt: null, isSelf: true }));
    expect(v.predictionsVisible).toBe(true);
  });
  it("groups by category order and sorts picks by slot, dropping empty categories", () => {
    const v = buildManagerProfileView(base());
    expect(v.predictionsByCategory).toEqual([
      { categoryName: "Champion", picks: ["Brazil"] },
      { categoryName: "Top Scorer", picks: ["Haaland", "Mbappé"] },
    ]);
  });
});

describe("buildManagerProfileView — points", () => {
  it("surfaces total and breakdown from the score row", () => {
    expect(buildManagerProfileView(base()).points).toEqual({
      total: 14,
      group: 6,
      groupQualify: 4,
      groupWin: 2,
      knockout: 5,
      bonus: 3,
    });
  });
  it("sums by_team points across ownership phases onto each team", () => {
    const v = buildManagerProfileView(base());
    // Argentina (t1) scored in both group (4) and knockout (5) phases.
    expect(v.teams.find((t) => t.name === "Argentina")?.points).toBe(9);
    expect(v.teams.find((t) => t.name === "Japan")?.points).toBe(2);
  });
  it("defaults to all zeros when the manager has no score row", () => {
    const v = buildManagerProfileView(base({ score: null }));
    expect(v.points).toEqual({ total: 0, group: 0, groupQualify: 0, groupWin: 0, knockout: 0, bonus: 0 });
    expect(v.teams.every((t) => t.points === 0)).toBe(true);
  });
});
