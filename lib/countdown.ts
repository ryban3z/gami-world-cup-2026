export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLive: boolean;
}

/** Tournament kickoff — matches the canonical pool design (2026-05-28 spec). */
export const KICKOFF = new Date("2026-06-11T00:00:00Z");

export function getCountdown(now: Date, target: Date): Countdown {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isLive: true };
  }
  const total = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    isLive: false,
  };
}
