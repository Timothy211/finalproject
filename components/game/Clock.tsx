"use client";

import { formatClock } from "@/lib/timeControl";

export function Clock({ ms, running, label }: { ms: number; running: boolean; label: string }) {
  const low = ms < 10_000;
  const warn = ms < 30_000;
  return (
    <div
      role="timer"
      aria-label={`${label}: ${formatClock(ms)}`}
      className={`min-w-[5.5rem] rounded-xl px-3 py-1.5 text-right font-mono text-2xl font-bold tabular-nums transition-colors ${
        running
          ? low
            ? "animate-pulse bg-danger text-white"
            : warn
              ? "bg-warn text-black"
              : "bg-fg text-bg"
          : low
            ? "bg-card-2 text-danger"
            : "bg-card-2 text-muted"
      }`}
    >
      {formatClock(ms)}
    </div>
  );
}
