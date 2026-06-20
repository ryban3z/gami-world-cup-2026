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
      [score("u1", 12, [], { group: 5, group_qualify: 4, group_win: 1, knockout: 4, bonus: 3 })],
      profiles,
      teams,
      "u1",
    );
    const ada = rows.find((r) => r.displayName === "Ada")!;
    expect([ada.group, ada.knockout, ada.bonus]).toEqual([5, 4, 3]);
    expect([ada.groupQualify, ada.groupWin]).toEqual([4, 1]);
  });
});

import { buildRosterTeamPoints } from "@/lib/leaderboardView";

describe("buildRosterTeamPoints", () => {
  it("keys points by `${userId}::${teamId}`, summed across phases", () => {
    const lookup = buildRosterTeamPoints([
      score("u1", 14, [
        { team: "t1", phase: "group", points: 4 },
        { team: "t1", phase: "knockout", points: 5 },
        { team: "t2", phase: "group", points: 2 },
      ]),
      score("u2", 3, [{ team: "t3", phase: "group", points: 3 }]),
    ]);
    expect(lookup["u1::t1"]).toBe(9);
    expect(lookup["u1::t2"]).toBe(2);
    expect(lookup["u2::t3"]).toBe(3);
  });

  it("omits teams with no score entry (caller defaults them to 0)", () => {
    const lookup = buildRosterTeamPoints([score("u1", 0, [])]);
    expect(lookup["u1::t1"]).toBeUndefined();
    expect(Object.keys(lookup)).toEqual([]);
  });
});

import { buildMyTeams } from "@/lib/leaderboardView";

describe("buildMyTeams", () => {
  const board = [
    { id: "t1", name: "Argentina", flag_url: "ar.png" },
    { id: "t2", name: "Japan", flag_url: "jp.png" },
    { id: "t3", name: "USA", flag_url: null },
    { id: "t4", name: "Brazil", flag_url: "br.png" },
  ];

  it("labels champion / eliminated / furthest stage", () => {
    const out = buildMyTeams(
      ["t1", "t2", "t3"],
      board,
      [
        { team_id: "t1", furthest_stage: "final", is_eliminated: false, is_champion: true, qualified: true },
        { team_id: "t2", furthest_stage: "r16", is_eliminated: true, is_champion: false, qualified: true },
        { team_id: "t3", furthest_stage: "qf", is_eliminated: false, is_champion: false, qualified: true },
      ],
    );
    const byName = Object.fromEntries(out.map((t) => [t.name, t.stageLabel]));
    expect(byName).toEqual({ Argentina: "Champion", USA: "Quarter-final", Japan: "Eliminated" });
  });

  it("labels a clinched group-stage team Qualified (green badge)", () => {
    const out = buildMyTeams(
      ["t3"],
      board,
      [{ team_id: "t3", furthest_stage: "group", is_eliminated: false, is_champion: false, qualified: true }],
    );
    expect(out[0].stageLabel).toBe("Qualified");
    expect(out[0].isQualified).toBe(true);
  });

  it("orders champion first, then alive (deepest first), eliminated last", () => {
    const out = buildMyTeams(
      ["t2", "t3", "t1", "t4"],
      board,
      [
        { team_id: "t1", furthest_stage: "final", is_eliminated: false, is_champion: true, qualified: true },
        { team_id: "t2", furthest_stage: "group", is_eliminated: true, is_champion: false, qualified: false },
        { team_id: "t3", furthest_stage: "qf", is_eliminated: false, is_champion: false, qualified: true },
        { team_id: "t4", furthest_stage: "r16", is_eliminated: false, is_champion: false, qualified: true },
      ],
    );
    expect(out.map((t) => t.name)).toEqual(["Argentina", "USA", "Brazil", "Japan"]);
  });

  it("defaults a team with no standing row to Group / alive", () => {
    const out = buildMyTeams(["t3"], board, []);
    expect(out[0]).toEqual({
      name: "USA", flagUrl: null, stageLabel: "Group",
      isEliminated: false, isChampion: false, isQualified: false,
    });
  });
});

import { buildMatchStrip } from "@/lib/leaderboardView";

describe("buildMatchStrip", () => {
  const teams = [
    { id: "t1", name: "Argentina", flag_url: "ar.png" },
    { id: "t2", name: "Japan", flag_url: "jp.png" },
  ];
  function match(id: string, status: string, kickoff: string, extra = {}) {
    return {
      id, stage: "group", group_letter: "A",
      home_team_id: "t1", away_team_id: "t2",
      kickoff_at: kickoff, home_score: null, away_score: null,
      winner_team_id: null, status, ...extra,
    } as any;
  }

  it("splits finished (recent, newest first) from upcoming (soonest first)", () => {
    const { recent, upcoming } = buildMatchStrip(
      [
        match("m1", "final", "2026-06-11T18:00:00Z", { home_score: 2, away_score: 1 }),
        match("m2", "final", "2026-06-12T18:00:00Z", { home_score: 0, away_score: 0 }),
        match("m3", "scheduled", "2026-06-13T18:00:00Z"),
        match("m4", "scheduled", "2026-06-14T18:00:00Z"),
      ],
      teams,
    );
    expect(recent.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(upcoming.map((m) => m.id)).toEqual(["m3", "m4"]);
    expect(recent[1]).toMatchObject({ homeName: "Argentina", awayName: "Japan", homeScore: 2, awayScore: 1, stageLabel: "Group A" });
  });

  it("honours recent/upcoming counts", () => {
    const ms = [
      match("a", "final", "2026-06-01T00:00:00Z"),
      match("b", "final", "2026-06-02T00:00:00Z"),
      match("c", "final", "2026-06-03T00:00:00Z"),
      match("d", "scheduled", "2026-06-10T00:00:00Z"),
      match("e", "scheduled", "2026-06-11T00:00:00Z"),
    ];
    const { recent, upcoming } = buildMatchStrip(ms, teams, { recent: 2, upcoming: 1 });
    expect(recent.map((m) => m.id)).toEqual(["c", "b"]);
    expect(upcoming.map((m) => m.id)).toEqual(["d"]);
  });

  it("sorts null kickoffs (unscheduled fixtures) to the back of upcoming", () => {
    const { upcoming } = buildMatchStrip(
      [
        match("tbd", "scheduled", null as any, { stage: "r16", group_letter: null }),
        match("soon", "scheduled", "2026-06-13T18:00:00Z"),
      ],
      teams,
    );
    expect(upcoming.map((m) => m.id)).toEqual(["soon", "tbd"]);
  });

  it("shows TBD for unresolved knockout teams and uses the stage label", () => {
    const { upcoming } = buildMatchStrip(
      [match("k", "scheduled", "2026-07-01T00:00:00Z", { stage: "r16", group_letter: null, home_team_id: null, away_team_id: "t2" })],
      teams,
    );
    expect(upcoming[0]).toMatchObject({ homeName: "TBD", awayName: "Japan", stageLabel: "Round of 16" });
  });

  it("leaves owners null when no ownership is supplied", () => {
    const { upcoming } = buildMatchStrip(
      [match("m", "scheduled", "2026-06-13T18:00:00Z")],
      teams,
    );
    expect(upcoming[0].homeOwner).toBeNull();
    expect(upcoming[0].awayOwner).toBeNull();
  });

  it("attaches an owner badge only when that manager has a photo", () => {
    const ownership = {
      rosters: [
        { user_id: "u1", team_ids: ["t1"] }, // owns Argentina, has a photo
        { user_id: "u2", team_ids: ["t2"] }, // owns Japan, no photo
      ],
      profiles: [
        { id: "u1", display_name: "Ada", avatar_url: "ada.png" },
        { id: "u2", display_name: "Bob", avatar_url: null },
      ],
    };
    const { upcoming } = buildMatchStrip(
      [match("m", "scheduled", "2026-06-13T18:00:00Z")],
      teams,
      { ownership },
    );
    expect(upcoming[0].homeOwner).toEqual({ avatarUrl: "ada.png", name: "Ada" });
    expect(upcoming[0].awayOwner).toBeNull(); // owned, but no photo → no badge
  });

  it("leaves an unowned team's owner null and treats blank photos as none", () => {
    const ownership = {
      rosters: [{ user_id: "u1", team_ids: ["t2"] }], // only Japan is owned
      profiles: [{ id: "u1", display_name: "Ada", avatar_url: "   " }],
    };
    const { upcoming } = buildMatchStrip(
      [match("m", "scheduled", "2026-06-13T18:00:00Z")],
      teams,
      { ownership },
    );
    expect(upcoming[0].homeOwner).toBeNull(); // Argentina unowned
    expect(upcoming[0].awayOwner).toBeNull(); // owned, but blank photo
  });
});
