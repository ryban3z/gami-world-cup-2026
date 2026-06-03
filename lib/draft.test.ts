import { describe, it, expect } from "vitest";
import { playerIndexForPick, snakeRoundForPick } from "@/lib/draft";

describe("playerIndexForPick (8 players, 3 rounds)", () => {
  const N = 8;
  it("round 1 (picks 0–7) runs forward 0→7", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => playerIndexForPick(k, N))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });
  it("round 2 (picks 8–15) runs reverse 7→0", () => {
    expect([8, 9, 10, 11, 12, 13, 14, 15].map((k) => playerIndexForPick(k, N))).toEqual([
      7, 6, 5, 4, 3, 2, 1, 0,
    ]);
  });
  it("round 3 (picks 16–23) runs forward 0→7", () => {
    expect([16, 17, 18, 19, 20, 21, 22, 23].map((k) => playerIndexForPick(k, N))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe("playerIndexForPick (2 players)", () => {
  it("snakes 0,1,1,0,0,1", () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => playerIndexForPick(k, 2))).toEqual([
      0, 1, 1, 0, 0, 1,
    ]);
  });
});

describe("snakeRoundForPick (8 players)", () => {
  it("is 1-based and changes every N picks", () => {
    expect(snakeRoundForPick(0, 8)).toBe(1);
    expect(snakeRoundForPick(7, 8)).toBe(1);
    expect(snakeRoundForPick(8, 8)).toBe(2);
    expect(snakeRoundForPick(15, 8)).toBe(2);
    expect(snakeRoundForPick(16, 8)).toBe(3);
  });
});
