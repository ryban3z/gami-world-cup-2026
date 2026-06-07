import { describe, it, expect } from "vitest";
import { buildLeaderboard } from "@/lib/leaderboardView";

const teams = [
  { id: "t1", name: "Argentina", flag_url: "ar.png" },
  { id: "t2", name: "Japan", flag_url: "jp.png" },
  { id: "t3", name: "USA", flag_url: null },
];
const profiles = [
  { id: "u1", display_name: "Ada" },
  { id: "u2", display_name: "Bob" },
  { id: "u3", display_name: "Cy" },
];

function score(user_id: string, total: number, by_team: any[] = [], extra = {}) {
  return {
    user_id,
    total_points: total,
    breakdown: { group: 0, knockout: 0, bonus: 0, by_team, ...extra },
  };
}

describe("buildLeaderboard", () => {
  it("ranks by total desc and flags self", () => {
    const rows = buildLeaderboard(
      [score("u1", 10), score("u2", 25), score("u3", 5)],
      profiles,
      teams,
      "u3",
    );
    expect(rows.map((r) => r.displayName)).toEqual(["Bob", "Ada", "Cy"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.find((r) => r.displayName === "Cy")!.isSelf).toBe(true);
    expect(rows.find((r) => r.displayName === "Ada")!.isSelf).toBe(false);
  });

  it("uses standard competition ranking for ties (1,2,2,4) with alpha tie-break", () => {
    const rows = buildLeaderboard(
      [score("u1", 10), score("u2", 10), score("u3", 3)],
      profiles,
      teams,
      "u1",
    );
    // Ada and Bob both 10 → ranks 1 and 1 (alpha order Ada, Bob), Cy → rank 3.
    expect(rows.map((r) => [r.displayName, r.rank])).toEqual([
      ["Ada", 1],
      ["Bob", 1],
      ["Cy", 3],
    ]);
  });

  it("defaults managers with no score row to 0 across the board", () => {
    const rows = buildLeaderboard([score("u2", 7)], profiles, teams, "u1");
    const ada = rows.find((r) => r.displayName === "Ada")!;
    expect(ada.total).toBe(0);
    expect(ada.group).toBe(0);
    expect(ada.byTeam).toEqual([]);
  });

  it("resolves by_team UUIDs to name/flag and sorts by points desc", () => {
    const rows = buildLeaderboard(
      [
        score("u1", 13, [
          { team: "t1", phase: "group", points: 5 },
          { team: "t2", phase: "knockout", points: 8 },
        ]),
      ],
      profiles,
      teams,
      "u1",
    );
    const ada = rows.find((r) => r.displayName === "Ada")!;
    expect(ada.byTeam).toEqual([
      { name: "Japan", flagUrl: "jp.png", phase: "knockout", points: 8 },
      { name: "Argentina", flagUrl: "ar.png", phase: "group", points: 5 },
    ]);
  });

  it("copies group/knockout/bonus split from the breakdown", () => {
    const rows = buildLeaderboard(
      [score("u1", 12, [], { group: 5, knockout: 4, bonus: 3 })],
      profiles,
      teams,
      "u1",
    );
    const ada = rows.find((r) => r.displayName === "Ada")!;
    expect([ada.group, ada.knockout, ada.bonus]).toEqual([5, 4, 3]);
  });
});
