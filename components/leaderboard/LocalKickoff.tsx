"use client";

import { useEffect, useState } from "react";

// Kickoff time in the *viewer's* local timezone. The pages are server-rendered
// in UTC, so formatting has to happen client-side — we hold the slot empty until
// after mount, then fill it in. This avoids a hydration mismatch (server UTC vs
// client local) and the brief flash of the wrong timezone that comes with it.
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

  // Reserve the line so the row doesn't jump when the label appears. "TBD" for
  // unscheduled fixtures (null kickoff); a non-breaking space pre-mount.
  return (
    <span className="text-[11px] text-caption" suppressHydrationWarning>
      {iso ? (label ?? " ") : "TBD"}
    </span>
  );
}
