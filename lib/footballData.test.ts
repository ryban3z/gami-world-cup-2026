import { describe, it, expect } from "vitest";
import { mapApiMatch, mapApiScorer } from "@/lib/footballData";

const groupMatch = {
  id: 537327, utcDate: "2026-06-11T19:00:00Z", stage: "GROUP_STAGE", group: "GROUP_A", status: "TIMED",
  homeTeam: { id: 769 }, awayTeam: { id: 774 },
  score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
};
const finishedMatch = {
  id: 537400, utcDate: "2026-06-20T16:00:00Z", stage: "GROUP_STAGE", group: "GROUP_B", status: "FINISHED",
  homeTeam: { id: 770 }, awayTeam: { id: 771 },
  score: { winner: "AWAY_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 2 } },
};
const knockoutTbd = {
  id: 537417, utcDate: "2026-06-28T19:00:00Z", stage: "LAST_32", group: null, status: "TIMED",
  homeTeam: { id: null }, awayTeam: { id: null },
  score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
};

describe("mapApiMatch", () => {
  it("maps a scheduled group match", () => {
    expect(mapApiMatch(groupMatch)).toEqual({
      externalId: "537327", stage: "group", groupLetter: "A",
      homeExternalId: "769", awayExternalId: "774", kickoffAt: "2026-06-11T19:00:00Z",
      status: "scheduled", homeScore: null, awayScore: null,
      homePenalties: null, awayPenalties: null, winner: null,
    });
  });
  it("maps a finished match with scores + winner", () => {
    const m = mapApiMatch(finishedMatch)!;
    expect(m.status).toBe("final");
    expect(m.homeScore).toBe(1);
    expect(m.awayScore).toBe(2);
    expect(m.winner).toBe("AWAY_TEAM");
  });
  it("maps a knockout fixture with null teams", () => {
    const m = mapApiMatch(knockoutTbd)!;
    expect(m.stage).toBe("r32");
    expect(m.groupLetter).toBeNull();
    expect(m.homeExternalId).toBeNull();
    expect(m.awayExternalId).toBeNull();
  });
  it("holds a FINISHED match with no score at live until the result is entered", () => {
    const m = mapApiMatch({
      ...finishedMatch,
      score: { winner: null, fullTime: { home: null, away: null } },
    })!;
    expect(m.status).toBe("live");
    expect(m.homeScore).toBeNull();
    expect(m.awayScore).toBeNull();
  });
  it("treats extra time / penalties / LIVE as live, AWARDED as final", () => {
    const at = (status: string) => mapApiMatch({ ...finishedMatch, status })!.status;
    expect(at("EXTRA_TIME")).toBe("live");
    expect(at("PENALTY_SHOOTOUT")).toBe("live");
    expect(at("LIVE")).toBe("live");
    expect(at("AWARDED")).toBe("final");
    // No result to score yet for these — fall back to scheduled.
    expect(at("POSTPONED")).toBe("scheduled");
    expect(at("SUSPENDED")).toBe("scheduled");
    expect(at("CANCELLED")).toBe("scheduled");
  });
  it("peels a penalty shootout out of the fullTime score", () => {
    // football-data folds the shootout into fullTime: a 1–1 decided 4–3 on pens
    // arrives as fullTime 5–4. The on-pitch score must read 1–1 with the pens
    // reported separately.
    const m = mapApiMatch({
      id: 537500, utcDate: "2026-06-29T19:00:00Z", stage: "LAST_32", group: null, status: "FINISHED",
      homeTeam: { id: 770 }, awayTeam: { id: 771 },
      score: { winner: "HOME_TEAM", fullTime: { home: 5, away: 4 }, penalties: { home: 4, away: 3 } },
    })!;
    expect(m.status).toBe("final");
    expect(m.homeScore).toBe(1);
    expect(m.awayScore).toBe(1);
    expect(m.homePenalties).toBe(4);
    expect(m.awayPenalties).toBe(3);
    expect(m.winner).toBe("HOME_TEAM");
  });
  it("leaves a non-shootout result untouched with null penalties", () => {
    const m = mapApiMatch(finishedMatch)!;
    expect(m.homeScore).toBe(1);
    expect(m.awayScore).toBe(2);
    expect(m.homePenalties).toBeNull();
    expect(m.awayPenalties).toBeNull();
  });
  it("returns null for an unknown stage instead of throwing", () => {
    expect(mapApiMatch({ ...knockoutTbd, stage: "PLAY_OFFS" })).toBeNull();
  });
});

describe("mapApiScorer", () => {
  it("maps a full scorer entry", () => {
    expect(
      mapApiScorer({
        player: { name: "Kylian Mbappé" },
        team: { id: 773, name: "France" },
        goals: 5, assists: 2, penalties: 1, playedMatches: 4,
      }),
    ).toEqual({
      playerName: "Kylian Mbappé", teamExternalId: "773", teamName: "France",
      goals: 5, assists: 2, penalties: 1, playedMatches: 4,
    });
  });
  it("keeps free-tier null assists/penalties as null (not 0)", () => {
    const s = mapApiScorer({
      player: { name: "Someone" }, team: { id: 1, name: "X" },
      goals: 3, assists: null, penalties: null, playedMatches: null,
    })!;
    expect(s.assists).toBeNull();
    expect(s.penalties).toBeNull();
    expect(s.playedMatches).toBeNull();
  });
  it("drops entries with no name or no goal count", () => {
    expect(mapApiScorer({ player: { name: "  " }, team: { id: 1, name: "X" }, goals: 2, assists: null, penalties: null, playedMatches: null })).toBeNull();
    expect(mapApiScorer({ player: { name: "A" }, team: { id: 1, name: "X" }, goals: null, assists: null, penalties: null, playedMatches: null })).toBeNull();
  });
  it("tolerates a missing team", () => {
    const s = mapApiScorer({ player: { name: "A" }, team: null, goals: 1, assists: null, penalties: null, playedMatches: null })!;
    expect(s.teamExternalId).toBeNull();
    expect(s.teamName).toBeNull();
  });
});
