import { describe, it, expect } from "vitest";
import {
  woodenSpoonStandings,
  woodenSpoonCandidates,
  type SpoonMatch,
} from "@/lib/woodenSpoonView";

const M = (o: Partial<SpoonMatch>): SpoonMatch => ({
  stage: "group",
  status: "final",
  home_id: null,
  home_name: null,
  away_id: null,
  away_name: null,
  home_score: null,
  away_score: null,
  ...o,
});

describe("woodenSpoonStandings", () => {
  it("tallies points and goal difference, ranked worst-first", () => {
    const rows = woodenSpoonStandings([
      // A beats B 2-0; A draws C 1-1; B loses to C 0-3
      M({ home_id: "A", home_name: "A", away_id: "B", away_name: "B", home_score: 2, away_score: 0 }),
      M({ home_id: "A", home_name: "A", away_id: "C", away_name: "C", home_score: 1, away_score: 1 }),
      M({ home_id: "B", home_name: "B", away_id: "C", away_name: "C", home_score: 0, away_score: 3 }),
    ]);
    // B: 0 pts, GD -5 (worst) | A: 4 pts, GD +2 | C: 4 pts, GD +3
    expect(rows[0]).toMatchObject({ team_id: "B", points: 0, goal_difference: -5 });
    expect(rows.map((r) => r.team_id)).toEqual(["B", "A", "C"]);
  });

  it("ignores non-final and non-group matches", () => {
    const rows = woodenSpoonStandings([
      M({ home_id: "A", home_name: "A", away_id: "B", away_name: "B", home_score: 5, away_score: 0, status: "live" }),
      M({ home_id: "A", home_name: "A", away_id: "B", away_name: "B", home_score: 5, away_score: 0, stage: "r16" }),
    ]);
    expect(rows).toEqual([]);
  });

  it("breaks a points+GD tie by fewer goals scored for display order", () => {
    const rows = woodenSpoonStandings([
      // X and Y both lose 0-1 and 0-1: 0 pts, GD -1 each; Z wins both
      M({ home_id: "X", home_name: "X", away_id: "Z", away_name: "Z", home_score: 0, away_score: 1 }),
      M({ home_id: "Y", home_name: "Y", away_id: "Z", away_name: "Z", home_score: 0, away_score: 1 }),
    ]);
    expect(rows[0].points).toBe(0);
    expect(rows[0].goal_difference).toBe(-1);
  });
});

describe("woodenSpoonCandidates", () => {
  it("returns the single worst team when there is a clear loser", () => {
    const rows = woodenSpoonStandings([
      M({ home_id: "A", home_name: "A", away_id: "B", away_name: "B", home_score: 3, away_score: 0 }),
    ]);
    expect(woodenSpoonCandidates(rows).map((r) => r.team_id)).toEqual(["B"]);
  });

  it("returns every team level on points AND goal difference (a vote is needed)", () => {
    const rows = woodenSpoonStandings([
      M({ home_id: "P", home_name: "P", away_id: "W", away_name: "W", home_score: 0, away_score: 2 }),
      M({ home_id: "Q", home_name: "Q", away_id: "W", away_name: "W", home_score: 0, away_score: 2 }),
    ]);
    // P and Q both 0 pts, GD -2 → tied for the spoon.
    expect(woodenSpoonCandidates(rows).map((r) => r.team_id).sort()).toEqual(["P", "Q"]);
  });

  it("returns [] when no group games are complete", () => {
    expect(woodenSpoonCandidates(woodenSpoonStandings([]))).toEqual([]);
  });
});
