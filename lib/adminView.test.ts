import { describe, it, expect } from "vitest";
import {
  phaseSteps,
  currentKnockoutRound,
  refreshCooldownRemainingMs,
  REFRESH_COOLDOWN_MS,
} from "./adminView";

describe("phaseSteps", () => {
  it("expands knockouts into its rounds — ten steps keyed by phase/round", () => {
    const steps = phaseSteps("draft");
    expect(steps.map((s) => s.key)).toEqual([
      "registration",
      "draft",
      "group_locked",
      "knockout_realloc",
      "r32",
      "r16",
      "qf",
      "sf",
      "final",
      "complete",
    ]);
    expect(steps.map((s) => s.label)).toEqual([
      "Registration",
      "Draft",
      "Group stage",
      "Knockout swap",
      "RO32",
      "RO16",
      "QF",
      "SF",
      "Final",
      "Complete",
    ]);
  });

  it("marks the first step current at registration, the rest upcoming", () => {
    const steps = phaseSteps("registration");
    expect(steps[0].status).toBe("current");
    expect(steps.slice(1).every((s) => s.status === "upcoming")).toBe(true);
  });

  it("marks earlier phases done and the rest upcoming at a middle phase", () => {
    const steps = phaseSteps("group_locked");
    expect(steps.map((s) => s.status)).toEqual([
      "done", "done", "current",
      "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming",
    ]);
  });

  it("highlights the live knockout round during knockout_locked", () => {
    const steps = phaseSteps("knockout_locked", "qf");
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.status]));
    expect(byKey).toMatchObject({
      knockout_realloc: "done",
      r32: "done",
      r16: "done",
      qf: "current",
      sf: "upcoming",
      final: "upcoming",
      complete: "upcoming",
    });
  });

  it("defaults to RO32 during knockout_locked before any round has started", () => {
    const steps = phaseSteps("knockout_locked", null);
    expect(steps.find((s) => s.key === "r32")?.status).toBe("current");
  });

  it("marks every prior step done with the last current at complete", () => {
    const steps = phaseSteps("complete");
    expect(steps[steps.length - 1].status).toBe("current");
    expect(steps.slice(0, -1).every((s) => s.status === "done")).toBe(true);
  });
});

describe("currentKnockoutRound", () => {
  it("returns null when there are no knockout fixtures", () => {
    expect(currentKnockoutRound([{ stage: "group", status: "final" }])).toBeNull();
    expect(currentKnockoutRound([])).toBeNull();
  });

  it("returns the shallowest round with an unplayed fixture", () => {
    expect(
      currentKnockoutRound([
        { stage: "r32", status: "final" },
        { stage: "r32", status: "live" },
      ]),
    ).toBe("r32");
  });

  it("advances to the next round once the prior one is fully played", () => {
    expect(
      currentKnockoutRound([
        { stage: "r32", status: "final" },
        { stage: "r32", status: "final" },
        { stage: "r16", status: "scheduled" },
      ]),
    ).toBe("r16");
  });

  it("returns the deepest round when every fixture is final", () => {
    expect(
      currentKnockoutRound([
        { stage: "r32", status: "final" },
        { stage: "final", status: "final" },
      ]),
    ).toBe("final");
  });
});

describe("refreshCooldownRemainingMs", () => {
  const now = new Date("2026-06-20T12:00:00Z").getTime();

  it("returns 0 when never synced", () => {
    expect(refreshCooldownRemainingMs(null, now)).toBe(0);
  });

  it("returns 0 for an unparseable timestamp", () => {
    expect(refreshCooldownRemainingMs("not-a-date", now)).toBe(0);
  });

  it("returns 0 once the cooldown window has fully elapsed", () => {
    const last = new Date(now - REFRESH_COOLDOWN_MS - 1).toISOString();
    expect(refreshCooldownRemainingMs(last, now)).toBe(0);
  });

  it("returns the remaining ms during the cooldown window", () => {
    const last = new Date(now - 10_000).toISOString();
    expect(refreshCooldownRemainingMs(last, now)).toBe(REFRESH_COOLDOWN_MS - 10_000);
  });

  it("returns the full window for a sync that just happened", () => {
    const last = new Date(now).toISOString();
    expect(refreshCooldownRemainingMs(last, now)).toBe(REFRESH_COOLDOWN_MS);
  });
});
