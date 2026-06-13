"use client";

import { useEffect, useState } from "react";

// Kickoff time in the *viewer's* local timezone, rendered inline after the stage
// label (e.g. "Group B · Sat 21:00"). The pages are server-rendered in UTC, so
// the formatting has to happen client-side: a timed kickoff renders nothing
// until the post-mount effect fills in the local-tz label — identical on the
// server and the first client render, so there's no hydration mismatch and no
// flash of the wrong timezone. A null kickoff (unscheduled fixture) is
// deterministic, so it renders "· TBD" on the server too.
export default function LocalKickoff({ iso }: { iso: string | null }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    setLabel(
      d.toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }, [iso]);

  if (!iso) return <span> · TBD</span>;
  if (!label) return null;
  return <span> · {label}</span>;
}
