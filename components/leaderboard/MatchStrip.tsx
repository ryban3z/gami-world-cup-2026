import type { MatchStripItem, OwnerBadge } from "@/lib/leaderboardView";
import LocalKickoff from "./LocalKickoff";

// Small round photo of the manager who owns a team in this fixture. Sized just
// above the flag height so head-to-heads read at a glance without crowding.
function OwnerAvatar({ owner }: { owner: OwnerBadge }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={owner.avatarUrl}
      alt={owner.name}
      title={owner.name}
      className="h-4 w-4 shrink-0 rounded-full border border-glow object-cover"
    />
  );
}

function MatchRow({ m }: { m: MatchStripItem }) {
  const done = m.status === "final";
  return (
    <li className="flex flex-col items-center gap-0.5 py-1.5 text-center">
      {/* Meta line: stage + (for upcoming fixtures) the local kickoff time. Kept
          on its own line above the matchup so neither competes for width. */}
      <span className="text-xs text-caption">
        {m.stageLabel}
        {!done && <LocalKickoff iso={m.kickoffAt} />}
      </span>
      {/* Capped width + centered so the matchup clusters in the middle of the
          card rather than stretching edge-to-edge on a wide desktop layout. */}
      <span className="flex w-full max-w-lg items-center gap-2 text-sm leading-5">
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-white">
          {/* Owner photo on the outer edge — flags stay hugging the score. */}
          {m.homeOwner && <OwnerAvatar owner={m.homeOwner} />}
          <span className="truncate">{m.homeName}</span>
          {m.homeFlag && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={m.homeFlag} alt="" className="h-3 w-5 shrink-0 rounded-sm object-cover" />
          )}
        </span>
        <span className="shrink-0 font-bold text-gold">
          {/* A final can briefly lack scores (provider lag, manual override) —
              show FT rather than interpolating nulls. */}
          {done
            ? m.homeScore != null && m.awayScore != null
              ? `${m.homeScore}–${m.awayScore}`
              : "FT"
            : "v"}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1 text-white">
          {m.awayFlag && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={m.awayFlag} alt="" className="h-3 w-5 shrink-0 rounded-sm object-cover" />
          )}
          <span className="truncate">{m.awayName}</span>
          {m.awayOwner && <OwnerAvatar owner={m.awayOwner} />}
        </span>
      </span>
    </li>
  );
}

// Two stacked cards: most recent finished results, then the next upcoming fixtures.
export default function MatchStrip({
  recent,
  upcoming,
}: {
  recent: MatchStripItem[];
  upcoming: MatchStripItem[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-glow bg-panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Recent results</h2>
        {recent.length > 0 ? (
          <ul className="flex flex-col">{recent.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        ) : (
          <p className="text-sm text-caption">Nothing yet.</p>
        )}
      </div>
      <div className="rounded-xl border border-glow bg-panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Next up</h2>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col">{upcoming.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        ) : (
          <p className="text-sm text-caption">Nothing scheduled.</p>
        )}
      </div>
    </section>
  );
}
