import { describe, it, expect } from "vitest";
import { relativeTime } from "@/lib/relativeTime";

describe("relativeTime", () => {
  const now = new Date("2026-06-24T12:00:00Z").getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

  it("shows 'just now' under a minute", () => {
    expect(relativeTime(ago(0), now)).toBe("just now");
    expect(relativeTime(ago(59 * S), now)).toBe("just now");
  });
  it("shows minutes", () => {
    expect(relativeTime(ago(M), now)).toBe("1m ago");
    expect(relativeTime(ago(59 * M), now)).toBe("59m ago");
  });
  it("shows hours", () => {
    expect(relativeTime(ago(H), now)).toBe("1h ago");
    expect(relativeTime(ago(23 * H), now)).toBe("23h ago");
  });
  it("shows days up to a week", () => {
    expect(relativeTime(ago(D), now)).toBe("1d ago");
    expect(relativeTime(ago(6 * D), now)).toBe("6d ago");
  });
  it("falls back to a date beyond a week", () => {
    expect(relativeTime(ago(8 * D), now)).toBe("16/06/2026");
  });
  it("returns 'never' for invalid input", () => {
    expect(relativeTime("not-a-date", now)).toBe("never");
  });
});
