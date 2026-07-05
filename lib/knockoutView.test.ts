import { describe, it, expect } from "vitest";
import {
  reallocPickOrder,
  knockoutTiedManagerIds,
  freeAgentsByGroup,
  type TeamLite,
} from "@/lib/knockoutView";

describe("reallocPickOrder", () => {
  const draftOrder = ["u1", "u2", "u3", "u4"]; // u1 drafted first (slot 0)

  it("orders worst-placed (fewest points) first", () => {
    const rows = [
      { user_id: "u1", total_points: 30 },
      { user_id: "u2", total_points: 10 },
      { user_id: "u3", total_points: 20 },
      { user_id: "u4", total_points: 5 },
    ];
    expect(reallocPickOrder(rows, draftOrder)).toEqual(["u4", "u2", "u3", "u1"]);
  });

  it("breaks point ties by worst goal difference first", () => {
    const rows = [
      { user_id: "u1", total_points: 10, goal_difference: 3 },
      { user_id: "u2", total_points: 10, goal_difference: -2 },
      { user_id: "u3", total_points: 10, goal_difference: 1 },
    ];
    // Points level — u2 (worst GD) picks first, u1 (best GD) last.
    expect(reallocPickOrder(rows, draftOrder)).toEqual(["u2", "u3", "u1"]);
  });

  it("breaks a points+GD tie by the admin tiebreak (lower picks first)", () => {
    const rows = [
      { user_id: "u1", total_points: 10, goal_difference: 0, tiebreak: 2 },
      { user_id: "u2", total_points: 10, goal_difference: 0, tiebreak: 1 },
      { user_id: "u3", total_points: 10, goal_difference: 0, tiebreak: 3 },
    ];
    expect(reallocPickOrder(rows, draftOrder)).toEqual(["u2", "u1", "u3"]);
  });

  it("falls back to reverse draft order when points, GD and tiebreak are all level", () => {
    const rows = [
      { user_id: "u1", total_points: 10 },
      { user_id: "u2", total_points: 10 },
      { user_id: "u3", total_points: 10 },
    ];
    // All level (GD/tiebreak default 0) — u3 (latest slot) picks first, u1 last.
    expect(reallocPickOrder(rows, draftOrder)).toEqual(["u3", "u2", "u1"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      { user_id: "u1", total_points: 2 },
      { user_id: "u2", total_points: 1 },
    ];
    const copy = [...rows];
    reallocPickOrder(rows, draftOrder);
    expect(rows).toEqual(copy);
  });
});

describe("knockoutTiedManagerIds", () => {
  it("flags only managers level on both points and goal difference", () => {
    const rows = [
      { user_id: "u1", total_points: 10, goal_difference: 2 },
      { user_id: "u2", total_points: 10, goal_difference: 2 }, // tied with u1
      { user_id: "u3", total_points: 10, goal_difference: 5 }, // same points, different GD
      { user_id: "u4", total_points: 8, goal_difference: 2 },  // same GD, different points
    ];
    expect(knockoutTiedManagerIds(rows)).toEqual(new Set(["u1", "u2"]));
  });

  it("treats a missing goal difference as 0", () => {
    const rows = [
      { user_id: "u1", total_points: 5 },
      { user_id: "u2", total_points: 5, goal_difference: 0 },
    ];
    expect(knockoutTiedManagerIds(rows)).toEqual(new Set(["u1", "u2"]));
  });

  it("returns an empty set when nobody is tied", () => {
    const rows = [
      { user_id: "u1", total_points: 5, goal_difference: 1 },
      { user_id: "u2", total_points: 6, goal_difference: 1 },
    ];
    expect(knockoutTiedManagerIds(rows)).toEqual(new Set());
  });
});

describe("freeAgentsByGroup", () => {
  const T = (id: string, group_letter: string | null): TeamLite => ({
    id, name: id, flag_url: null, group_letter,
  });

  it("buckets teams by group letter, sorted A→L", () => {
    const grouped = freeAgentsByGroup([T("b1", "B"), T("a1", "A"), T("b2", "B")]);
    expect(grouped.map((g) => g.letter)).toEqual(["A", "B"]);
    expect(grouped[1].teams.map((t) => t.id)).toEqual(["b1", "b2"]);
  });

  it("files teams with no group letter under '?'", () => {
    const grouped = freeAgentsByGroup([T("x", null)]);
    expect(grouped).toEqual([{ letter: "?", teams: [T("x", null)] }]);
  });
});
