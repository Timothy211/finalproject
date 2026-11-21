"use client";

import { useEffect, useState } from "react";
import { serverNow } from "./serverOffset";
import type { GameRow } from "@/lib/types";
import type { Seat } from "@/lib/engine";

/** Remaining ms for each seat at server time `now`. */
export function remainingMs(g: GameRow, seat: Seat, now: number): number {
  const base = g.clock_ms[seat];
  if (g.status !== "active" || g.initial_time_ms === 0 || !g.turn_started_at || g.turn !== seat) return base;
  const started = Date.parse(g.turn_started_at);
  return base - Math.max(0, now - started);
}

/** Re-renders on every animation frame while `running`, returning server-time now. */
export function useServerNowRaf(running: boolean): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const loop = () => {
      const t = serverNow();
      // ~20 fps is plenty for tenths and keeps CPU low.
      if (t - last >= 50) {
        last = t;
        setNow(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // rAF pauses in background tabs; a slow interval keeps flag detection alive.
    const iv = window.setInterval(() => setNow(serverNow()), 500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(iv);
    };
  }, [running]);
  return now;
}
