// Pure relative-time formatting for a past timestamp, e.g. "just now", "5m ago",
// "3h ago", "2d ago", falling back to a date for anything older than a week. No
// IO — rendered client-side (see components/admin/SyncedAt) so `nowMs` is the
// viewer's own clock. Invalid input returns "never".
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";

  const sec = Math.floor((nowMs - then) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  return new Date(iso).toLocaleDateString("en-GB");
}
