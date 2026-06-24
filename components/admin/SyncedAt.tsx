"use client";
import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/relativeTime";

// Renders a past timestamp as relative time ("3h ago"), with the full
// viewer-timezone timestamp on hover (title). Formatting happens after mount and
// on a 1-minute tick — both so it stays fresh and to avoid an SSR/client
// hydration mismatch (the server has no access to the browser's clock/timezone).
export default function SyncedAt({ iso }: { iso: string | null }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    const update = () => setText(relativeTime(iso));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [iso]);

  if (!iso) return <>never</>;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("en-GB")}>
      {text ?? "…"}
    </time>
  );
}
