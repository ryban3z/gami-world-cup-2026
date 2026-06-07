"use client";
import { useEffect, useState } from "react";

// The admin page is a server component, so a plain `new Date(iso).toLocaleString()`
// would format on Vercel (US locale, UTC). Render the timestamp on the client so it
// uses the viewer's own timezone, day-first via en-GB. We format after mount to avoid
// an SSR/client hydration mismatch (server has no access to the browser's timezone).
export default function SyncedAt({ iso }: { iso: string | null }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (iso) setText(new Date(iso).toLocaleString("en-GB"));
  }, [iso]);

  if (!iso) return <>never</>;
  return <>{text ?? "…"}</>;
}
