"use client";

import type { Seat } from "@/lib/engine";
import { PawnIcon } from "@/components/board/Board";

export function WallCounter({ left, total, seat }: { left: number; total: number; seat: Seat }) {
  const max = Math.max(total, left);
  return (
    <div className="flex items-center gap-[3px]" aria-label={`${left} of ${max} walls left`} title={`${left} walls left`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`h-3.5 w-[5px] rounded-[2px] ${i < left ? (seat === 0 ? "bg-p0" : "bg-p1") : "bg-border"}`}
        />
      ))}
      <span className="ml-1 text-xs font-semibold tabular-nums text-muted">{left}</span>
    </div>
  );
}

export function PlayerCard({
  seat,
  name,
  wallsLeft,
  totalWalls,
  distance,
  isTurn,
  isMe,
  online,
  clock,
  badge,
  compact,
}: {
  seat: Seat;
  name: string;
  wallsLeft: number;
  totalWalls: number;
  distance?: number;
  isTurn: boolean;
  isMe?: boolean;
  online?: boolean | null;
  clock?: React.ReactNode;
  badge?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-card px-3 ring-1 transition ${compact ? "py-2" : "py-2.5"} ${
        isTurn ? (seat === 0 ? "ring-2 ring-p0" : "ring-2 ring-p1") : "ring-border"
      }`}
    >
      <div className="relative">
        <PawnIcon seat={seat} size={28} />
        {online !== undefined && online !== null && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card ${online ? "bg-green-500" : "bg-gray-400"}`}
            title={online ? "Online" : "Offline"}
            aria-label={online ? "Online" : "Offline"}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{name}</span>
          {isMe && <span className="rounded bg-card-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">You</span>}
          {badge}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <WallCounter left={wallsLeft} total={totalWalls} seat={seat} />
          {distance !== undefined && Number.isFinite(distance) && (
            <span className="text-xs text-muted" title="Shortest path to goal">
              <span className="font-semibold tabular-nums text-fg">{distance}</span> to goal
            </span>
          )}
        </div>
      </div>
      {clock}
    </div>
  );
}
