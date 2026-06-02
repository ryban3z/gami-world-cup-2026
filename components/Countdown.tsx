"use client";

import { useEffect, useState } from "react";
import { getCountdown, KICKOFF, type Countdown } from "@/lib/countdown";

const UNITS: { key: keyof Omit<Countdown, "isLive">; label: string }[] = [
  { key: "days", label: "DAYS" },
  { key: "hours", label: "HRS" },
  { key: "minutes", label: "MIN" },
  { key: "seconds", label: "SEC" },
];

export default function Countdown() {
  const [c, setC] = useState<Countdown | null>(null);

  useEffect(() => {
    const tick = () => setC(getCountdown(new Date(), KICKOFF));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (c?.isLive) {
    return <p className="mt-4 text-gold font-extrabold tracking-wide">KICK-OFF! ⚽</p>;
  }

  return (
    <div>
      <div className="flex justify-center gap-2">
        {UNITS.map(({ key, label }) => (
          <div
            key={key}
            className="rounded-xl border border-gold/20 bg-panel px-3 py-2 min-w-[3.5rem]"
          >
            <div className="text-2xl font-extrabold text-gold tabular-nums">
              {c ? String(c[key]).padStart(2, "0") : "--"}
            </div>
            <div className="text-[7px] tracking-widest text-bodytext/60">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[9px] text-caption">until kickoff · 11 June 2026</div>
    </div>
  );
}
