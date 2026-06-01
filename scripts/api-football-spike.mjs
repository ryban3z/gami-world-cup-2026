// API-Football free-tier validation spike (throwaway).
//
// Purpose: definitively answer the project's #1 technical risk —
// does the RapidAPI free tier actually serve WC 2026 (league=1, season=2026)
// fixtures, live scores, and final results within its rate limits?
//
// WC 2026: league id = 1, season = 2026, 104 matches, 48 teams, Jun 11 – Jul 19.
//
// Usage (Node 18+, no dependencies — uses global fetch):
//   RapidAPI host (matches the spec):
//     $env:RAPIDAPI_KEY="<your key>"; node scripts/api-football-spike.mjs
//   Direct api-sports host (alternative):
//     $env:APISPORTS_KEY="<your key>"; node scripts/api-football-spike.mjs
//
// Get a free key: https://rapidapi.com/api-sports/api/api-football  → subscribe to the Free plan.

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const APISPORTS_KEY = process.env.APISPORTS_KEY;

// Prefer RapidAPI (the spec's chosen path); fall back to the direct host.
const mode = RAPIDAPI_KEY ? "rapidapi" : APISPORTS_KEY ? "apisports" : null;

if (!mode) {
  console.error(
    "No API key found. Set RAPIDAPI_KEY (preferred) or APISPORTS_KEY and re-run.\n" +
      'PowerShell:  $env:RAPIDAPI_KEY="<key>"; node scripts/api-football-spike.mjs'
  );
  process.exit(1);
}

const BASE =
  mode === "rapidapi"
    ? "https://api-football-v1.p.rapidapi.com/v3"
    : "https://v3.football.api-sports.io";

const HEADERS =
  mode === "rapidapi"
    ? {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
      }
    : { "x-apisports-key": APISPORTS_KEY };

const WC = { league: 1, season: 2026 };

async function call(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

// API-Football returns errors inside a 200 body as { errors: {...} } (object or array).
function apiErrors(json) {
  if (!json || !json.errors) return null;
  const e = json.errors;
  if (Array.isArray(e)) return e.length ? e : null;
  if (typeof e === "object") return Object.keys(e).length ? e : null;
  return null;
}

function line() {
  console.log("─".repeat(64));
}

async function main() {
  console.log(`Mode: ${mode}  Base: ${BASE}\n`);

  // 1) Account status: plan, subscription, requests used/limit.
  line();
  console.log("[1] /status — account plan & quota");
  const status = await call("/status");
  console.log("HTTP", status.status);
  if (apiErrors(status.json)) console.log("API errors:", apiErrors(status.json));
  const resp = status.json?.response;
  if (resp) {
    console.log("  Account :", resp.account?.firstname ?? "(n/a)");
    console.log("  Plan    :", resp.subscription?.plan ?? "(n/a)");
    console.log("  Active  :", resp.subscription?.active ?? "(n/a)");
    console.log("  End     :", resp.subscription?.end ?? "(n/a)");
    console.log(
      "  Requests:",
      `${resp.requests?.current ?? "?"} / ${resp.requests?.limit_day ?? "?"} per day`
    );
  }
  // RapidAPI also returns quota in response headers.
  const rlReq = status.headers.get("x-ratelimit-requests-remaining");
  const rlReqLimit = status.headers.get("x-ratelimit-requests-limit");
  if (rlReq || rlReqLimit) console.log(`  RapidAPI daily header: ${rlReq} remaining of ${rlReqLimit}`);

  // 2) Teams for WC 2026 — expect 48.
  line();
  console.log("[2] /teams?league=1&season=2026 — expect 48 teams");
  const teams = await call(`/teams?league=${WC.league}&season=${WC.season}`);
  console.log("HTTP", teams.status);
  const teamErr = apiErrors(teams.json);
  if (teamErr) console.log("API errors:", teamErr);
  const teamCount = teams.json?.results ?? teams.json?.response?.length ?? 0;
  console.log("  Teams returned:", teamCount);
  if (teams.json?.response?.[0]) {
    const t = teams.json.response[0].team;
    console.log("  Sample team   :", t?.id, t?.name);
  }

  // 3) Fixtures for WC 2026 — expect 104.
  line();
  console.log("[3] /fixtures?league=1&season=2026 — expect 104 matches");
  const fixtures = await call(`/fixtures?league=${WC.league}&season=${WC.season}`);
  console.log("HTTP", fixtures.status);
  const fixErr = apiErrors(fixtures.json);
  if (fixErr) console.log("API errors:", fixErr);
  const fixCount = fixtures.json?.results ?? fixtures.json?.response?.length ?? 0;
  console.log("  Fixtures returned:", fixCount);
  if (fixtures.json?.response?.[0]) {
    const f = fixtures.json.response[0];
    console.log(
      "  Sample fixture   :",
      f.fixture?.id,
      `${f.teams?.home?.name} vs ${f.teams?.away?.name}`,
      `@ ${f.fixture?.date}`,
      `[${f.fixture?.status?.short}]`
    );
  }

  // 4) Standings — expect 12 group tables.
  line();
  console.log("[4] /standings?league=1&season=2026 — expect 12 groups");
  const standings = await call(`/standings?league=${WC.league}&season=${WC.season}`);
  console.log("HTTP", standings.status);
  const stErr = apiErrors(standings.json);
  if (stErr) console.log("API errors:", stErr);
  const groups = standings.json?.response?.[0]?.league?.standings;
  console.log("  Group tables returned:", Array.isArray(groups) ? groups.length : 0);

  // 5) Live access test — free tier often blocks ?live=all.
  line();
  console.log("[5] /fixtures?live=all — does free tier allow live data?");
  const live = await call(`/fixtures?live=all`);
  console.log("HTTP", live.status);
  const liveErr = apiErrors(live.json);
  if (liveErr) console.log("API errors (live likely paid-only):", liveErr);
  else console.log("  Live fixtures right now:", live.json?.results ?? 0, "(0 is fine if no matches live)");

  // ── Verdict ────────────────────────────────────────────────
  line();
  console.log("VERDICT");
  const seasonOk = teamCount > 0 || fixCount > 0;
  console.log(
    `  WC 2026 season data on this plan : ${seasonOk ? "YES ✅" : "NO ❌ (season likely paid-only)"}`
  );
  console.log(`  Teams=${teamCount}/48  Fixtures=${fixCount}/104  Groups=${Array.isArray(groups) ? groups.length : 0}/12`);
  console.log(`  Live endpoint                    : ${liveErr ? "BLOCKED ❌ (poll final results instead)" : "allowed ✅"}`);
  if (!seasonOk) {
    console.log(
      "\n  → If NO: the automated-cron path as specced won't work on the free tier.\n" +
        "    Options: upgrade to a paid plan, switch provider, or fall back to admin manual entry."
    );
  } else if (liveErr) {
    console.log(
      "\n  → Season data works but live is blocked: drop the live polling, and have the\n" +
        "    cron poll /fixtures?date=YYYY-MM-DD on match days for status=FT final scores."
    );
  } else {
    console.log("\n  → Free tier looks viable for the cron path. Mind the 100 req/day cap.");
  }
  line();
}

main().catch((e) => {
  console.error("Spike failed:", e);
  process.exit(1);
});
