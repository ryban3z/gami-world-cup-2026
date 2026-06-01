import { describe, it, expect } from "vitest";
import { getCountdown, KICKOFF } from "./countdown";

describe("getCountdown", () => {
  it("breaks a future gap into d/h/m/s", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    const now = new Date("2026-06-01T19:37:55Z"); // 9d 4h 22m 5s before
    expect(getCountdown(now, target)).toEqual({
      days: 9,
      hours: 4,
      minutes: 22,
      seconds: 5,
      isLive: false,
    });
  });

  it("reports isLive exactly at the target", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    expect(getCountdown(target, target)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isLive: true,
    });
  });

  it("reports isLive after the target", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    const now = new Date("2026-07-01T00:00:00Z");
    expect(getCountdown(now, target).isLive).toBe(true);
  });

  it("handles the final second before kickoff", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    const now = new Date("2026-06-10T23:59:59Z");
    expect(getCountdown(now, target)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
      isLive: false,
    });
  });

  it("exposes the kickoff constant as 11 June 2026 UTC", () => {
    expect(KICKOFF.toISOString()).toBe("2026-06-11T00:00:00.000Z");
  });
});
