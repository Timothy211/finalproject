"use client";

import { useEffect, useRef } from "react";

export interface HistoryEntry {
  notation: string;
  /** milliseconds spent on this move, if known */
  usedMs?: number | null;
}

export function formatUsed(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** firstSeat: who made ply 1 (always seat 0 in Quoridor). */
export function MoveHistory({
  entries,
  current,
  onSelect,
  className = "",
}: {
  entries: HistoryEntry[];
  /** highlighted ply count (0 = initial), defaults to latest */
  current?: number;
  onSelect?: (ply: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cur = current ?? entries.length;
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-ply="${cur}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
    else if (ref.current && cur === entries.length) ref.current.scrollTop = ref.current.scrollHeight;
  }, [cur, entries.length]);

  const rows: { n: number; a?: HistoryEntry; b?: HistoryEntry }[] = [];
  for (let i = 0; i < entries.length; i += 2) rows.push({ n: i / 2 + 1, a: entries[i], b: entries[i + 1] });

  const cell = (e: HistoryEntry | undefined, ply: number, seat: 0 | 1) =>
    e ? (
      <button
        type="button"
        data-ply={ply}
        disabled={!onSelect}
        onClick={() => onSelect?.(ply)}
        className={`flex items-baseline justify-between gap-2 rounded-md px-2 py-0.5 text-left font-mono text-sm ${
          cur === ply ? (seat === 0 ? "bg-p0/20" : "bg-p1/20") : onSelect ? "hover:bg-card-2" : ""
        }`}
      >
        <span className="font-semibold">{e.notation}</span>
        <span className="text-[11px] text-muted">{formatUsed(e.usedMs)}</span>
      </button>
    ) : (
      <span />
    );

  return (
    <div ref={ref} className={`overflow-y-auto rounded-xl bg-card ring-1 ring-border ${className}`}>
      {rows.length === 0 ? (
        <p className="p-3 text-sm text-muted">No moves yet.</p>
      ) : (
        <div className="grid grid-cols-[2rem_1fr_1fr] gap-x-1 gap-y-0.5 p-2">
          {rows.map((row) => (
            <div key={row.n} className="contents">
              <span className="py-0.5 text-right font-mono text-xs leading-6 text-muted">{row.n}.</span>
              {cell(row.a, row.n * 2 - 1, 0)}
              {cell(row.b, row.n * 2, 1)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
