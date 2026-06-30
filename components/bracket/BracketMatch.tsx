import type { BracketMatchCell, BracketTeamCell, BracketOwner } from "@/lib/bracketView";

// Manager who owns a team, shown beside it so head-to-heads read at a glance.
// Photo when uploaded, otherwise a small initials chip (the bracket wants every
// owner visible, unlike the photo-only match strip).
function OwnerChip({ owner }: { owner: BracketOwner }) {
  if (owner.avatarUrl) {
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
  const initials = owner.name.trim().slice(0, 2).toUpperCase();
  return (
    <span
      title={owner.name}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-glow bg-glow/40 text-[8px] font-bold text-bodytext"
    >
      {initials}
    </span>
  );
}

function TeamRow({ team }: { team: BracketTeamCell }) {
  const named = team.name != null;
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 ${
        team.isWinner ? "font-bold text-white" : named ? "text-bodytext" : "text-caption"
      }`}
    >
      {team.flag ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={team.flag} alt="" className="h-3 w-5 shrink-0 rounded-sm object-cover" />
      ) : (
        <span className="h-3 w-5 shrink-0 rounded-sm bg-glow/40" />
      )}
      <span className="min-w-0 flex-1 truncate text-xs">
        {named ? team.name : <span className="italic">{team.placeholder}</span>}
      </span>
      {team.owner && <OwnerChip owner={team.owner} />}
      <span className="w-3 shrink-0 text-right text-xs tabular-nums text-white">
        {team.score ?? ""}
        {team.penalties != null && (
          <span className="text-caption"> ({team.penalties})</span>
        )}
      </span>
    </div>
  );
}

// One fixture: two stacked team rows. `live` matches get a subtle gold ring.
export default function BracketMatch({ match }: { match: BracketMatchCell }) {
  return (
    <div
      className={`w-40 overflow-hidden rounded-lg border bg-panel sm:w-44 ${
        match.status === "live" ? "border-gold/70" : "border-glow"
      }`}
    >
      <TeamRow team={match.home} />
      <div className="border-t border-glow/50" />
      <TeamRow team={match.away} />
    </div>
  );
}
