"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cellName,
  isLegalWall,
  legalPawnMoves,
  MOVE_REASON_TEXT,
  opponent,
  sameCell,
  shortestPath,
  type Cell,
  type GameState,
  type Move,
  type Orientation,
  type Seat,
  type Wall,
  type WallCheck,
} from "@/lib/engine";
import { G, LABEL, S, boardSize, cellAt, cellCenter, cellX, cellY, nearestWall, sameWall, wallCenter, wallRect } from "./geometry";

export interface LastMoveInfo {
  move: Move;
  seat: Seat;
  from?: Cell;
}

export interface BoardProps {
  n: number;
  state: GameState;
  /** Draw seat 1 at the bottom (rotate 180°). */
  flipped: boolean;
  /** The seat allowed to act right now, or null for read-only. */
  activeSeat: Seat | null;
  onMove?: (m: Move) => void;
  lastMove?: LastMoveInfo | null;
  /** Require a second tap / ✓ for pawn moves (walls on touch are always confirmed). */
  confirm?: boolean;
  /** Seat whose shortest path to draw. */
  showPathFor?: Seat | null;
  /** Opponent's hovered wall ("thinking" ghost). */
  remoteGhost?: Wall | null;
  /** Called with the locally hovered legal wall (for broadcasting). */
  onHoverWall?: (w: Wall | null) => void;
  /** Enable window-level keyboard shortcuts. */
  keyboard?: boolean;
  names?: [string, string];
}

type Hover = { kind: "pawn"; cell: Cell } | { kind: "wall"; wall: Wall; check: WallCheck } | null;
type Pending = { kind: "pawn"; cell: Cell } | { kind: "wall"; wall: Wall } | null;

const DIR_KEYS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  w: [-1, 0],
  s: [1, 0],
  a: [0, -1],
  d: [0, 1],
};

export function Board({
  n,
  state,
  flipped,
  activeSeat,
  onMove,
  lastMove,
  confirm = false,
  showPathFor = null,
  remoteGhost = null,
  onHoverWall,
  keyboard = true,
  names,
}: BoardProps) {
  const B = boardSize(n);
  const groupRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [hover, setHover] = useState<Hover>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [lockedO, setLockedO] = useState<Orientation | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; moved: boolean } | null>(null);
  const [kbMode, setKbMode] = useState<"pawn" | "wall">("pawn");
  const [kbWall, setKbWall] = useState<Wall>({ r: Math.floor(n / 2) - 1, c: Math.floor(n / 2) - 1, o: "h" });
  const [kbDiag, setKbDiag] = useState<Cell[] | null>(null);

  // Reset transient UI whenever the position or the active seat changes.
  const [seen, setSeen] = useState({ state, activeSeat });
  if (seen.state !== state || seen.activeSeat !== activeSeat) {
    setSeen({ state, activeSeat });
    setPending(null);
    setHover(null);
    setDrag(null);
    setKbDiag(null);
  }

  const active = activeSeat !== null && !!onMove;
  const legal = useMemo(() => (active ? legalPawnMoves(state, activeSeat!, n) : []), [active, state, activeSeat, n]);
  const canWall = active && state.wallsLeft[activeSeat!] > 0;
  const isLegalDest = useCallback((cell: Cell) => legal.some((l) => sameCell(l, cell)), [legal]);

  const path = useMemo(
    () => (showPathFor !== null && showPathFor !== undefined ? shortestPath(state, showPathFor, n) : null),
    [showPathFor, state, n],
  );

  const checkWall = useCallback(
    (w: Wall): WallCheck => (activeSeat === null ? { ok: false } : isLegalWall(state, w, n, activeSeat)),
    [state, n, activeSeat],
  );

  const commit = useCallback(
    (m: Move) => {
      setPending(null);
      setHover(null);
      setKbDiag(null);
      setLockedO(null);
      onMove?.(m);
    },
    [onMove],
  );

  // Report hovered legal wall (for the opponent's "thinking" ghost).
  const hoverWallForReport =
    hover?.kind === "wall" && hover.check.ok ? hover.wall : pending?.kind === "wall" ? pending.wall : null;
  const reportKey = hoverWallForReport ? `${hoverWallForReport.r},${hoverWallForReport.c},${hoverWallForReport.o}` : "";
  const onHoverWallRef = useRef(onHoverWall);
  useEffect(() => {
    onHoverWallRef.current = onHoverWall;
  });
  useEffect(() => {
    if (!onHoverWallRef.current) return;
    if (!reportKey) return onHoverWallRef.current(null);
    const [r, c, o] = reportKey.split(",");
    onHoverWallRef.current({ r: +r, c: +c, o: o as Orientation });
  }, [reportKey]);

  // ---- pointer handling -------------------------------------------------

  const toBoard = useCallback((clientX: number, clientY: number) => {
    const g = groupRef.current;
    const svg = svgRef.current;
    if (!g || !svg) return null;
    const m = g.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  const targetAt = useCallback(
    (x: number, y: number, forced: Orientation | null): Hover => {
      if (!active) return null;
      const cell = cellAt(x, y, n);
      const me = state.pawns[activeSeat!];
      if (cell && (isLegalDest(cell) || sameCell(cell, me))) return { kind: "pawn", cell };
      if (!canWall) return null;
      if (x < -1 || y < -1 || x > B + 1 || y > B + 1) return null;
      const wall = nearestWall(x, y, n, forced);
      return { kind: "wall", wall, check: checkWall(wall) };
    },
    [active, n, state, activeSeat, isLegalDest, canWall, B, checkWall],
  );

  const pointerDown = useRef<{ x: number; y: number; type: string; onPawn: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active || e.button === 2) return;
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;
    const cell = cellAt(p.x, p.y, n);
    const onPawn = !!cell && sameCell(cell, state.pawns[activeSeat!]);
    pointerDown.current = { x: p.x, y: p.y, type: e.pointerType, onPawn };
    if (onPawn) {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setDrag({ x: p.x, y: p.y, moved: false });
      setPending(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;
    if (drag) {
      const d0 = pointerDown.current;
      const moved = drag.moved || (!!d0 && Math.hypot(p.x - d0.x, p.y - d0.y) > 2.5);
      setDrag({ x: p.x, y: p.y, moved });
      const cell = cellAt(p.x, p.y, n);
      setHover(cell && isLegalDest(cell) ? { kind: "pawn", cell } : null);
      return;
    }
    if (e.pointerType !== "mouse") return; // no hover on touch
    const t = targetAt(p.x, p.y, lockedO);
    if (t?.kind === "wall" && hover?.kind === "wall" && sameWall(t.wall, hover.wall)) return;
    if (t?.kind === "pawn" && hover?.kind === "pawn" && sameCell(t.cell, hover.cell)) return;
    // A rotation (lockedO) persists while sliding along; it resets when leaving the board.
    setHover(t);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d0 = pointerDown.current;
    pointerDown.current = null;
    if (!active || !d0) return;
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;

    if (drag) {
      const wasDragged = drag.moved;
      setDrag(null);
      const cell = cellAt(p.x, p.y, n);
      if (wasDragged) {
        if (cell && isLegalDest(cell)) commit({ type: "pawn", r: cell.r, c: cell.c });
        setHover(null);
        return;
      }
      // a tap on the pawn just cancels anything pending
      setPending(null);
      return;
    }

    const isTouch = d0.type !== "mouse";
    if (isTouch && Math.hypot(p.x - d0.x, p.y - d0.y) > 4) return; // scroll / swipe, not a tap
    const t = targetAt(p.x, p.y, isTouch ? (pending?.kind === "wall" ? pending.wall.o : null) : lockedO);

    // Tapping the pending ghost again confirms it.
    if (pending?.kind === "wall") {
      const sameAnchor = t?.kind === "wall" && t.wall.r === pending.wall.r && t.wall.c === pending.wall.c;
      if (sameAnchor && checkWall(pending.wall).ok) return commit({ type: "wall", ...pending.wall });
    }
    if (pending?.kind === "pawn" && t?.kind === "pawn" && sameCell(t.cell, pending.cell)) {
      return commit({ type: "pawn", r: pending.cell.r, c: pending.cell.c });
    }

    if (!t) return setPending(null);
    if (t.kind === "pawn") {
      if (sameCell(t.cell, state.pawns[activeSeat!])) return setPending(null);
      if (confirm) return setPending({ kind: "pawn", cell: t.cell });
      return commit({ type: "pawn", r: t.cell.r, c: t.cell.c });
    }
    // wall
    if (isTouch || confirm) {
      setPending({ kind: "wall", wall: t.wall });
      return;
    }
    if (t.check.ok) commit({ type: "wall", ...t.wall });
  };

  const rotate = useCallback(() => {
    if (pending?.kind === "wall") {
      const o: Orientation = pending.wall.o === "h" ? "v" : "h";
      setPending({ kind: "wall", wall: { ...pending.wall, o } });
      return;
    }
    if (kbMode === "wall") {
      setKbWall((w) => ({ ...w, o: w.o === "h" ? "v" : "h" }));
      return;
    }
    if (hover?.kind === "wall") {
      const o: Orientation = hover.wall.o === "h" ? "v" : "h";
      const wall = { ...hover.wall, o };
      setLockedO(o);
      setHover({ kind: "wall", wall, check: checkWall(wall) });
    }
  }, [pending, kbMode, hover, checkWall]);

  // Mouse wheel rotates (needs a non-passive listener to prevent page scroll).
  const rotateRef = useRef(rotate);
  const hoverIsWall = hover?.kind === "wall";
  useEffect(() => {
    rotateRef.current = rotate;
  });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !hoverIsWall) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - last < 120) return;
      last = now;
      rotateRef.current();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [hoverIsWall]);

  // ---- keyboard ---------------------------------------------------------

  const kbHandler = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (document.querySelector("[role=dialog]")) return;
      const onButton = tag === "BUTTON" || tag === "A";
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === " " && !onButton) {
        e.preventDefault();
        if (!canWall) return;
        setPending(null);
        setKbDiag(null);
        setKbMode((m) => (m === "pawn" ? "wall" : "pawn"));
        return;
      }
      if (key === "r") {
        e.preventDefault();
        rotate();
        return;
      }
      if (key === "Escape") {
        setPending(null);
        setKbDiag(null);
        setKbMode("pawn");
        setHover(null);
        return;
      }
      if (key === "Enter" && !onButton) {
        e.preventDefault();
        if (pending?.kind === "pawn") return commit({ type: "pawn", ...pending.cell });
        if (pending?.kind === "wall") {
          if (checkWall(pending.wall).ok) commit({ type: "wall", ...pending.wall });
          return;
        }
        if (kbMode === "wall") {
          if (checkWall(kbWall).ok) {
            commit({ type: "wall", ...kbWall });
            setKbMode("pawn");
          }
        }
        return;
      }
      const dir = DIR_KEYS[key];
      if (!dir) return;
      e.preventDefault();
      // Screen-relative → absolute.
      const dr = flipped ? -dir[0] : dir[0];
      const dc = flipped ? -dir[1] : dir[1];

      if (kbMode === "wall") {
        setKbWall((w) => ({
          ...w,
          r: Math.max(0, Math.min(n - 2, w.r + dr)),
          c: Math.max(0, Math.min(n - 2, w.c + dc)),
        }));
        return;
      }

      const me = state.pawns[activeSeat!];
      const choose = (cell: Cell) => {
        setKbDiag(null);
        if (confirm) setPending({ kind: "pawn", cell });
        else commit({ type: "pawn", r: cell.r, c: cell.c });
      };
      if (kbDiag) {
        const pick = kbDiag.find((d) => {
          const opp = state.pawns[opponent(activeSeat!)];
          return d.r - opp.r === dr && d.c - opp.c === dc;
        });
        if (pick) return choose(pick);
      }
      const step = { r: me.r + dr, c: me.c + dc };
      if (isLegalDest(step)) return choose(step);
      const jump = { r: me.r + 2 * dr, c: me.c + 2 * dc };
      if (isLegalDest(jump)) return choose(jump);
      const opp = state.pawns[opponent(activeSeat!)];
      if (sameCell(opp, step)) {
        const diags = legal.filter((l) => Math.abs(l.r - me.r) === 1 && Math.abs(l.c - me.c) === 1);
        if (diags.length === 1) return choose(diags[0]);
        if (diags.length > 1) return setKbDiag(diags);
      }
    },
    [active, canWall, rotate, pending, commit, checkWall, kbMode, kbWall, flipped, n, state, activeSeat, confirm, kbDiag, isLegalDest, legal],
  );

  useEffect(() => {
    if (!keyboard) return;
    window.addEventListener("keydown", kbHandler);
    return () => window.removeEventListener("keydown", kbHandler);
  }, [keyboard, kbHandler]);

  // ---- rendering --------------------------------------------------------

  const ghost: { wall: Wall; ok: boolean; reason?: string; pending?: boolean } | null = useMemo(() => {
    if (pending?.kind === "wall") {
      const chk = checkWall(pending.wall);
      return { wall: pending.wall, ok: chk.ok, reason: chk.reason, pending: true };
    }
    if (active && kbMode === "wall") {
      const chk = checkWall(kbWall);
      return { wall: kbWall, ok: chk.ok, reason: chk.reason };
    }
    if (hover?.kind === "wall") return { wall: hover.wall, ok: hover.check.ok, reason: hover.check.reason };
    return null;
  }, [pending, active, kbMode, kbWall, hover, checkWall]);

  const pendingCell = pending?.kind === "pawn" ? pending.cell : null;
  const hoverCell = hover?.kind === "pawn" ? hover.cell : null;
  const view = B + LABEL;

  const toDisplay = (x: number, y: number) => (flipped ? { x: B - x, y: B - y } : { x, y });

  const files = Array.from({ length: n }, (_, j) => String.fromCharCode(97 + (flipped ? n - 1 - j : j)));
  const ranks = Array.from({ length: n }, (_, i) => n - (flipped ? n - 1 - i : i));

  const tooltip = ghost && !ghost.ok && ghost.reason ? (() => {
    const c = wallCenter(ghost.wall);
    const d = toDisplay(c.x, c.y);
    return { left: ((d.x + LABEL) / view) * 100, top: (d.y / view) * 100, text: MOVE_REASON_TEXT[ghost.reason] ?? ghost.reason };
  })() : null;

  const lastFrom = lastMove?.move.type === "pawn" ? lastMove.from : undefined;
  const lastTo = lastMove?.move.type === "pawn" ? { r: lastMove.move.r, c: lastMove.move.c } : undefined;
  const lastWall = lastMove?.move.type === "wall" ? (lastMove.move as Wall) : undefined;

  const ariaTurn =
    activeSeat !== null ? `${names?.[activeSeat] ?? (activeSeat === 0 ? "Player 1" : "Player 2")} to move` : "Board";

  return (
    <div className="w-full select-none">
      <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${-LABEL} 0 ${view} ${view}`}
        className="block h-auto w-full touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        role="application"
        aria-label={`Quoridor board, ${n} by ${n}. ${ariaTurn}. Arrow keys move, Space toggles wall mode, R rotates, Enter confirms.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDrag(null);
          pointerDown.current = null;
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !drag) {
            setHover(null);
            setLockedO(null);
          }
        }}
        onContextMenu={(e) => {
          if (active) {
            e.preventDefault();
            rotate();
          }
        }}
        style={{ touchAction: drag ? "none" : "manipulation", cursor: drag ? "grabbing" : undefined }}
      >
        {/* coordinate labels (not rotated) */}
        <g fontSize={3} fill="var(--muted)" textAnchor="middle" dominantBaseline="central" fontWeight={600} aria-hidden>
          {files.map((f, j) => (
            <text key={`f${j}`} x={cellX(j) + S / 2} y={B + LABEL / 2}>
              {f}
            </text>
          ))}
          {ranks.map((rk, i) => (
            <text key={`r${i}`} x={-LABEL / 2} y={cellY(i) + S / 2}>
              {rk}
            </text>
          ))}
        </g>

        <g ref={groupRef} transform={flipped ? `rotate(180 ${B / 2} ${B / 2})` : undefined}>
          <rect x={0} y={0} width={B} height={B} rx={2} fill="var(--board-groove)" />
          {/* goal edges */}
          <rect x={G} y={0} width={B - 2 * G} height={G * 0.55} rx={0.6} fill="var(--p0)" opacity={0.9} />
          <rect x={G} y={B - G * 0.55} width={B - 2 * G} height={G * 0.55} rx={0.6} fill="var(--p1)" opacity={0.9} />

          {/* cells */}
          {Array.from({ length: n * n }, (_, k) => {
            const r = Math.floor(k / n);
            const c = k % n;
            const isLegal = active && legal.some((l) => l.r === r && l.c === c);
            return (
              <rect
                key={k}
                x={cellX(c)}
                y={cellY(r)}
                width={S}
                height={S}
                rx={1.1}
                fill={(r + c) % 2 ? "var(--board-cell-alt)" : "var(--board-cell)"}
                aria-label={`${cellName(r, c, n)}${isLegal ? ", legal move" : ""}`}
              />
            );
          })}

          {/* last move */}
          {lastFrom && (
            <rect x={cellX(lastFrom.c)} y={cellY(lastFrom.r)} width={S} height={S} rx={1.1} fill="var(--board-last)" opacity={0.55} />
          )}
          {lastTo && <rect x={cellX(lastTo.c)} y={cellY(lastTo.r)} width={S} height={S} rx={1.1} fill="var(--board-last)" />}

          {/* shortest path */}
          {path && path.length > 1 && (
            <polyline
              points={path.map((p) => `${cellCenter(p).x},${cellCenter(p).y}`).join(" ")}
              fill="none"
              stroke={showPathFor === 0 ? "var(--p0)" : "var(--p1)"}
              strokeWidth={0.9}
              strokeDasharray="1.6 1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.75}
              pointerEvents="none"
            />
          )}

          {/* legal destinations */}
          {active &&
            legal.map((l) => {
              const cc = cellCenter(l);
              const hot = (hoverCell && sameCell(hoverCell, l)) || (pendingCell && sameCell(pendingCell, l));
              const diagHint = kbDiag?.some((d) => sameCell(d, l));
              return (
                <g key={`l${l.r},${l.c}`} pointerEvents="none">
                  {hot && <rect x={cellX(l.c)} y={cellY(l.r)} width={S} height={S} rx={1.1} fill="var(--board-hl)" opacity={0.6} />}
                  <circle cx={cc.x} cy={cc.y} r={diagHint ? 2.4 : 1.7} fill="var(--board-hl)" />
                </g>
              );
            })}

          {/* placed walls */}
          {state.walls.map((w) => {
            const rc = wallRect(w);
            const isLast = sameWall(w, lastWall);
            return (
              <rect
                key={`${w.r},${w.c},${w.o}`}
                className={isLast ? "wall-drop" : undefined}
                x={rc.x - (w.o === "v" ? 0.25 : 0)}
                y={rc.y - (w.o === "h" ? 0.25 : 0)}
                width={rc.w + (w.o === "v" ? 0.5 : 0)}
                height={rc.h + (w.o === "h" ? 0.5 : 0)}
                rx={0.9}
                fill="var(--board-wall)"
                stroke={isLast ? "var(--accent)" : "var(--board-wall-edge)"}
                strokeWidth={isLast ? 0.55 : 0.3}
              />
            );
          })}

          {/* opponent's thinking ghost */}
          {remoteGhost && !state.walls.some((w) => sameWall(w, remoteGhost)) && (() => {
            const rc = wallRect(remoteGhost);
            return (
              <rect
                x={rc.x}
                y={rc.y}
                width={rc.w}
                height={rc.h}
                rx={0.9}
                fill="var(--board-wall)"
                opacity={0.3}
                strokeDasharray="1 0.8"
                stroke="var(--board-wall)"
                strokeWidth={0.3}
                pointerEvents="none"
              />
            );
          })()}

          {/* local ghost */}
          {ghost && (() => {
            const rc = wallRect(ghost.wall);
            return (
              <rect
                x={rc.x}
                y={rc.y}
                width={rc.w}
                height={rc.h}
                rx={0.9}
                fill={ghost.ok ? "var(--board-hl)" : "var(--danger)"}
                opacity={ghost.pending ? 0.95 : 0.75}
                stroke={ghost.ok ? "var(--board-wall)" : "var(--danger)"}
                strokeWidth={ghost.pending ? 0.6 : 0.3}
                pointerEvents="none"
              />
            );
          })()}

          {/* pawns */}
          {([0, 1] as Seat[]).map((seat) => {
            const isDragging = drag && drag.moved && activeSeat === seat;
            const pos = isDragging ? { x: drag!.x, y: drag!.y } : cellCenter(state.pawns[seat]);
            return (
              <g
                key={seat}
                style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
                className={isDragging ? "" : "transition-transform duration-150 ease-out"}
                pointerEvents="none"
              >
                <Pawn seat={seat} active={activeSeat === seat && active} />
                {active && activeSeat === seat && (
                  // Hit area that disables touch panning so the pawn can be dragged on phones.
                  <circle r={S / 2} fill="transparent" pointerEvents="all" style={{ touchAction: "none", cursor: "grab" }} />
                )}
              </g>
            );
          })}

          {/* pending pawn destination ghost */}
          {pendingCell && (
            <g style={{ transform: `translate(${cellCenter(pendingCell).x}px, ${cellCenter(pendingCell).y}px)` }} opacity={0.5} pointerEvents="none">
              <Pawn seat={activeSeat!} active={false} />
            </g>
          )}
        </g>
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[160%] whitespace-nowrap rounded-md bg-danger px-2 py-1 text-xs font-semibold text-white shadow"
          style={{ left: `${tooltip.left}%`, top: `${tooltip.top}%` }}
        >
          {tooltip.text}
        </div>
      )}
      </div>

      {onMove && (
        <div className="flex min-h-12 items-center justify-center gap-2 pt-2">
          {active && (pending || kbMode === "wall" || kbDiag) && (<>
          {(pending?.kind === "wall" || kbMode === "wall") && (
            <button onClick={rotate} className="rounded-full bg-card px-4 py-2 text-sm font-semibold shadow ring-1 ring-border" aria-label="Rotate wall">
              ⟳ Rotate
            </button>
          )}
          {pending && (
            <>
              <button
                onClick={() => setPending(null)}
                className="rounded-full bg-card px-4 py-2 text-sm font-semibold shadow ring-1 ring-border"
                aria-label="Cancel"
              >
                ✕ Cancel
              </button>
              <button
                disabled={pending.kind === "wall" && !checkWall(pending.wall).ok}
                onClick={() =>
                  pending.kind === "pawn"
                    ? commit({ type: "pawn", ...pending.cell })
                    : commit({ type: "wall", ...pending.wall })
                }
                className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-fg shadow disabled:opacity-40"
                aria-label="Confirm move"
              >
                ✓ Confirm
              </button>
            </>
          )}
          {!pending && kbMode === "wall" && (
            <span className="rounded-full bg-card px-3 py-2 text-xs text-muted shadow ring-1 ring-border">
              Wall mode · arrows move · Enter places · Space exits
            </span>
          )}
          {!pending && kbDiag && (
            <span className="rounded-full bg-card px-3 py-2 text-xs text-muted shadow ring-1 ring-border">Pick a side with ← →</span>
          )}
          </>)}
        </div>
      )}
    </div>
  );
}

export function Pawn({ seat, active }: { seat: Seat; active: boolean }) {
  const color = seat === 0 ? "var(--p0)" : "var(--p1)";
  return (
    <g>
      {active && <circle r={4.6} fill="none" stroke="var(--board-hl)" strokeWidth={0.7} />}
      <ellipse cx={0} cy={0.8} rx={3.4} ry={3.2} fill="black" opacity={0.25} />
      {seat === 0 ? (
        <>
          <circle r={3.5} fill={color} stroke="white" strokeWidth={0.55} />
          <circle r={1.4} fill="white" opacity={0.9} />
        </>
      ) : (
        <>
          <rect x={-3.2} y={-3.2} width={6.4} height={6.4} rx={1.6} fill={color} stroke="white" strokeWidth={0.55} />
          <rect x={-1.3} y={-1.3} width={2.6} height={2.6} rx={0.4} fill="none" stroke="white" strokeWidth={0.6} opacity={0.9} />
        </>
      )}
    </g>
  );
}

export function PawnIcon({ seat, size = 16 }: { seat: Seat; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-5 -5 10 10" aria-hidden className="shrink-0">
      <Pawn seat={seat} active={false} />
    </svg>
  );
}
