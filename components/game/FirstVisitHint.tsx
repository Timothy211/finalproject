"use client";

import { useSetting, useIsTouch } from "@/lib/settings";

export function FirstVisitHint({ onRules }: { onRules: () => void }) {
  const [seen, setSeen] = useSetting("seenHint");
  const touch = useIsTouch();
  if (seen) return null;
  return (
    <div className="pop-in flex items-start gap-3 rounded-2xl bg-accent/10 p-3 text-sm ring-1 ring-accent/40" role="note">
      <span aria-hidden className="text-lg">💡</span>
      <div className="flex-1">
        {touch ? (
          <p>
            Tap a <b>green dot</b> to move. Tap a <b>groove</b> between squares to preview a wall, then tap it again to place it.
          </p>
        ) : (
          <p>
            Click a <b>green dot</b> (or drag your pawn) to move. Hover a <b>groove</b> to preview a wall — scroll or press{" "}
            <kbd className="rounded bg-card px-1 font-mono text-xs ring-1 ring-border">R</kbd> to rotate, click to place.
          </p>
        )}
        <button onClick={onRules} className="mt-1 font-semibold text-accent underline-offset-2 hover:underline">
          Full rules
        </button>
      </div>
      <button onClick={() => setSeen(true)} className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-card" aria-label="Dismiss tip">
        Got it
      </button>
    </div>
  );
}
