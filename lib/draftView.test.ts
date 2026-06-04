import { describe, it, expect } from "vitest";
import { ordinal, turnContext, snakeRailForRound, myPickSlots } from "@/lib/draftView";

describe("ordinal", () => {
  it("handles 1st, 2nd, 3rd, 4th", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
  });
  it("handles the 11–13 exception", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });
  it("handles 21st, 22nd, 23rd", () => {
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
  });
});

describe("turnContext (8 players, 3 teams each = 24 picks)", () => {
  it("pick 1 (picks_made 0) is round 1, your 1st team", () => {
    expect(turnContext(0, 24, 8)).toEqual({ pickNumber: 1, picksTotal: 24, round: 1, teamOrdinal: "1st" });
  });
  it("pick 11 (picks_made 10) is round 2, your 2nd team", () => {
    expect(turnContext(10, 24, 8)).toEqual({ pickNumber: 11, picksTotal: 24, round: 2, teamOrdinal: "2nd" });
  });
  it("the final pick (picks_made 23) is round 3, your 3rd team", () => {
    expect(turnContext(23, 24, 8)).toEqual({ pickNumber: 24, picksTotal: 24, round: 3, teamOrdinal: "3rd" });
  });
});

describe("snakeRailForRound (4 players: A B C D)", () => {
  const names = ["A", "B", "C", "D"];

  it("round 1, nobody picked yet: forward order, A on the clock, B next", () => {
    expect(snakeRailForRound(names, 0, 4)).toEqual({
      round: 1,
      entries: [
        { name: "A", status: "now" },
        { name: "B", status: "next" },
        { name: "C", status: "upcoming" },
        { name: "D", status: "upcoming" },
      ],
    });
  });

  it("round 1, two picked: A,B done, C now, D next", () => {
    expect(snakeRailForRound(names, 2, 4)).toEqual({
      round: 1,
      entries: [
        { name: "A", status: "done" },
        { name: "B", status: "done" },
        { name: "C", status: "now" },
        { name: "D", status: "next" },
      ],
    });
  });

  it("round 1, last picker on the clock: no 'next' (snake turns around)", () => {
    expect(snakeRailForRound(names, 3, 4)).toEqual({
      round: 1,
      entries: [
        { name: "A", status: "done" },
        { name: "B", status: "done" },
        { name: "C", status: "done" },
        { name: "D", status: "now" },
      ],
    });
  });

  it("round 2 reverses: visual order D C B A, D on the clock", () => {
    expect(snakeRailForRound(names, 4, 4)).toEqual({
      round: 2,
      entries: [
        { name: "D", status: "now" },
        { name: "C", status: "next" },
        { name: "B", status: "upcoming" },
        { name: "A", status: "upcoming" },
      ],
    });
  });
});

const board = [
  { id: "t1", name: "Argentina", flag_url: "ar.png" },
  { id: "t2", name: "Japan", flag_url: "jp.png" },
  { id: "t3", name: "USA", flag_url: null },
];

describe("myPickSlots", () => {
  it("pads to slotCount with nulls when fewer picks made", () => {
    expect(myPickSlots(["t1"], board, 3)).toEqual([
      { name: "Argentina", flag_url: "ar.png" },
      null,
      null,
    ]);
  });

  it("maps each owned id to its board team in pick order", () => {
    expect(myPickSlots(["t2", "t1"], board, 3)).toEqual([
      { name: "Japan", flag_url: "jp.png" },
      { name: "Argentina", flag_url: "ar.png" },
      null,
    ]);
  });

  it("fills every slot when the roster is complete", () => {
    expect(myPickSlots(["t1", "t2", "t3"], board, 3)).toEqual([
      { name: "Argentina", flag_url: "ar.png" },
      { name: "Japan", flag_url: "jp.png" },
      { name: "USA", flag_url: null },
    ]);
  });
});
