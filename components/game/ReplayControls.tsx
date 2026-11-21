"use client";

import { useEffect } from "react";

export function ReplayControls({
  ply,
  total,
  onChange,
  onExit,
  onCopy,
}: {
  ply: number;
  total: number;
  onChange: (ply: number) => void;
  onExit?: () => void;
  onCopy?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (document.querySelector("[role=dialog]")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onChange(Math.max(0, ply - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onChange(Math.min(total, ply + 1));
      } else if (e.key === "Home") onChange(0);
      else if (e.key === "End") onChange(total);
      else if (e.key === "Escape") onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, total, onChange, onExit]);

  const btn = "rounded-lg bg-card-2 px-3 py-2 text-sm font-semibold ring-1 ring-border disabled:opacity-40";
  return (
    <div className="space-y-2 rounded-2xl bg-card p-3 ring-1 ring-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Review</span>
        <span className="tabular-nums text-muted">
          Move {ply} / {total}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={total}
        value={ply}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
        aria-label="Replay position"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} onClick={() => onChange(0)} disabled={ply === 0} aria-label="First move">
          ⏮
        </button>
        <button className={btn} onClick={() => onChange(Math.max(0, ply - 1))} disabled={ply === 0} aria-label="Previous move">
          ◀
        </button>
        <button className={btn} onClick={() => onChange(Math.min(total, ply + 1))} disabled={ply === total} aria-label="Next move">
          ▶
        </button>
        <button className={btn} onClick={() => onChange(total)} disabled={ply === total} aria-label="Last move">
          ⏭
        </button>
        <div className="flex-1" />
        {onCopy && (
          <button className={btn} onClick={onCopy}>
            Copy notation
          </button>
        )}
        {onExit && (
          <button className={btn} onClick={onExit}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
