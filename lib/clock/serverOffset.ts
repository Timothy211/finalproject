"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase } from "@/lib/supabase/client";

/** offset = server − client (ms). serverNow() = Date.now() + offset. */
let offset = 0;
let synced = false;
let bestRtt = Infinity;
const listeners = new Set<() => void>();

export const serverNow = () => Date.now() + offset;
export const getOffset = () => offset;

/** Take several samples; keep the one with the lowest round-trip time. */
export async function syncServerTime(samples = 4): Promise<void> {
  const sb = getSupabase();
  let best: { rtt: number; off: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const { data, error } = await sb.rpc("get_server_time");
    const t1 = Date.now();
    if (error || data == null) continue;
    const server = Number(data);
    const rtt = t1 - t0;
    const off = server - (t0 + t1) / 2;
    if (!best || rtt < best.rtt) best = { rtt, off };
  }
  if (!best) return;
  // Prefer a new estimate unless it's much noisier than one we already have.
  if (!synced || best.rtt <= bestRtt * 1.5 + 20) {
    offset = best.off;
    bestRtt = Math.min(bestRtt, best.rtt);
    synced = true;
    listeners.forEach((l) => l());
  }
}

/** Keeps the offset fresh (on mount and every ~60 s). */
export function useServerTimeSync(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    void syncServerTime(5);
    const id = window.setInterval(() => void syncServerTime(3), 60_000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => offset,
    () => 0,
  );
}
