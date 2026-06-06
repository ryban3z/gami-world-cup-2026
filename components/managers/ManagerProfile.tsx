import type { ManagerProfileView } from "@/lib/managerProfileView";
import { pressableLink } from "@/lib/ui";

// One manager's public profile: blurb, roster, bonus predictions. Points are
// intentionally absent until the scoring subsystem exists.
export default function ManagerProfile({ view }: { view: ManagerProfileView }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-3xl">
      <a href="/home" className={`self-start text-sm text-caption underline ${pressableLink}`}>
        ← Home
      </a>

      <header>
        <h1 className="text-2xl font-bold">
          {view.displayName}
          {view.isSelf && (
            <span className="ml-2 text-sm font-normal text-caption">(you)</span>
          )}
        </h1>
        {view.summary && (
          <p className="mt-2 whitespace-pre-line text-bodytext">{view.summary}</p>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Roster</h2>
        {view.rosterVisible ? (
          <ul className="flex flex-col gap-1">
            {view.teams.map((t, i) => (
              <li key={`${t.name}-${i}`} className="flex items-center gap-2 text-sm text-white">
                {t.flagUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={t.flagUrl} alt="" className="h-4 w-6 rounded-sm object-cover" />
                )}
                <span>{t.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-bodytext">Roster hidden until the draft is revealed.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-caption">
          Bonus predictions
        </h2>
        {view.predictionsVisible ? (
          view.predictionsByCategory.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {view.predictionsByCategory.map((c) => (
                <li key={c.categoryName} className="text-sm">
                  <span className="text-caption">{c.categoryName}: </span>
                  <span className="text-white">{c.picks.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-bodytext">No predictions submitted.</p>
          )
        ) : (
          <p className="text-sm text-bodytext">Predictions hidden until kickoff lock.</p>
        )}
      </section>

      <p className="text-sm text-caption">Points will appear here once matches begin.</p>
    </main>
  );
}
