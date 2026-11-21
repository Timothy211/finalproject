import { addWallToMask, bfsDistance, blockedMask, bfsPath, goalRow, opponent } from "../engine/board";
import { applyMoveUnchecked, isLegalWall, legalPawnMoves, wallGeometry } from "../engine/rules";
import type { Cell, GameState, Move, Seat, Wall } from "../engine/types";

export type BotLevel = "easy" | "medium" | "hard";

const WIN = 10_000;

function dist(state: GameState, seat: Seat, n: number): number {
  const d = bfsDistance(blockedMask(state.walls, n), n, state.pawns[seat], goalRow(seat, n));
  return d < 0 ? 999 : d;
}

/** Walls that would block an edge on `seat`'s current shortest path. */
export function wallsNearPath(state: GameState, seat: Seat, n: number, maxSteps = 99): Wall[] {
  const path = bfsPath(blockedMask(state.walls, n), n, state.pawns[seat], goalRow(seat, n));
  if (!path) return [];
  const out = new Map<string, Wall>();
  const add = (w: Wall) => {
    if (w.r < 0 || w.c < 0 || w.r > n - 2 || w.c > n - 2) return;
    out.set(`${w.r},${w.c},${w.o}`, w);
  };
  for (let i = 0; i + 1 < path.length && i < maxSteps; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (a.r !== b.r) {
      const r = Math.min(a.r, b.r);
      add({ r, c: a.c - 1, o: "h" });
      add({ r, c: a.c, o: "h" });
    } else {
      const c = Math.min(a.c, b.c);
      add({ r: a.r - 1, c, o: "v" });
      add({ r: a.r, c, o: "v" });
    }
  }
  return [...out.values()];
}

/** Candidate walls: near the opponent's shortest path, cheaply pre-filtered. */
function candidateWalls(state: GameState, seat: Seat, n: number, ownToo = false): Wall[] {
  if (state.wallsLeft[seat] <= 0) return [];
  const opp = opponent(seat);
  const ws = wallsNearPath(state, opp, n);
  if (ownToo) {
    const seen = new Set(ws.map((w) => `${w.r},${w.c},${w.o}`));
    for (const w of wallsNearPath(state, seat, n, 3)) if (!seen.has(`${w.r},${w.c},${w.o}`)) ws.push(w);
  }
  return ws.filter((w) => wallGeometry(state.walls, w, n).ok);
}

/** Like isLegalWall but returns both distances (or null if illegal path-wise). */
function wallDistances(state: GameState, w: Wall, n: number): [number, number] | null {
  const mask = blockedMask(state.walls, n).slice();
  addWallToMask(mask, w, n);
  const d0 = bfsDistance(mask, n, state.pawns[0], goalRow(0, n));
  if (d0 < 0) return null;
  const d1 = bfsDistance(mask, n, state.pawns[1], goalRow(1, n));
  if (d1 < 0) return null;
  return [d0, d1];
}

function pawnMoves(state: GameState, seat: Seat, n: number): Move[] {
  return legalPawnMoves(state, seat, n).map((c) => ({ type: "pawn", r: c.r, c: c.c }));
}

function bestPawnMove(state: GameState, seat: Seat, n: number, rand: () => number): Move {
  const moves = pawnMoves(state, seat, n);
  let best: Move[] = [];
  let bestD = Infinity;
  for (const m of moves) {
    const s = applyMoveUnchecked(state, seat, m);
    const d = s.pawns[seat].r === goalRow(seat, n) ? -1 : dist(s, seat, n);
    if (d < bestD) {
      bestD = d;
      best = [m];
    } else if (d === bestD) best.push(m);
  }
  return best[Math.floor(rand() * best.length)];
}

// ---- Easy ---------------------------------------------------------------

function easy(state: GameState, seat: Seat, n: number, rand: () => number): Move {
  if (state.wallsLeft[seat] > 0 && rand() < 0.18) {
    const ws = candidateWalls(state, seat, n).filter(() => rand() < 0.6);
    const pool = ws.length ? ws : candidateWalls(state, seat, n);
    for (let i = 0; i < 6 && pool.length; i++) {
      const w = pool[Math.floor(rand() * pool.length)];
      if (isLegalWall(state, w, n, seat).ok) return { type: "wall", ...w };
    }
  }
  if (rand() < 0.1) {
    const ms = pawnMoves(state, seat, n);
    return ms[Math.floor(rand() * ms.length)];
  }
  return bestPawnMove(state, seat, n, rand);
}

// ---- Medium (greedy 1-ply) ----------------------------------------------

function medium(state: GameState, seat: Seat, n: number, rand: () => number): Move {
  const opp = opponent(seat);
  let best: Move[] = [];
  let bestScore = -Infinity;
  const consider = (m: Move, score: number) => {
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = [m];
    } else if (Math.abs(score - bestScore) < 1e-9) best.push(m);
  };
  for (const m of pawnMoves(state, seat, n)) {
    const s = applyMoveUnchecked(state, seat, m);
    if (s.pawns[seat].r === goalRow(seat, n)) return m;
    consider(m, dist(s, opp, n) - dist(s, seat, n));
  }
  // Walls cost a resource, so spend them only when they help — unless the opponent is nearly home.
  const wallBias = dist(state, opp, n) <= 2 ? 0.25 : -0.6;
  for (const w of candidateWalls(state, seat, n)) {
    const ds = wallDistances(state, w, n);
    if (!ds) continue;
    consider({ type: "wall", ...w }, ds[opp] - ds[seat] + wallBias);
  }
  return best[Math.floor(rand() * best.length)];
}

// ---- Hard (alpha-beta) --------------------------------------------------

interface SearchCtx {
  n: number;
  deadline: number;
  nodes: number;
  aborted: boolean;
}

function evaluate(state: GameState, toMove: Seat, n: number): number {
  const me = toMove;
  const opp = opponent(me);
  const dm = dist(state, me, n);
  const dop = dist(state, opp, n);
  // Being on move is worth about half a step.
  return dop - dm + 0.5 + 0.12 * (state.wallsLeft[me] - state.wallsLeft[opp]);
}

function orderedMoves(state: GameState, seat: Seat, n: number): Move[] {
  const opp = opponent(seat);
  const scored: { m: Move; s: number }[] = [];
  for (const m of pawnMoves(state, seat, n)) {
    const s = applyMoveUnchecked(state, seat, m);
    scored.push({ m, s: dist(s, opp, n) - dist(s, seat, n) + 0.3 });
  }
  for (const w of candidateWalls(state, seat, n, true)) {
    const ds = wallDistances(state, w, n);
    if (!ds) continue;
    scored.push({ m: { type: "wall", ...w }, s: ds[opp] - ds[seat] - 0.4 });
  }
  scored.sort((a, b) => b.s - a.s);
  // Keep the search narrow: all pawn moves + best walls.
  let wallsKept = 0;
  return scored.filter((x) => x.m.type === "pawn" || wallsKept++ < 14).map((x) => x.m);
}

function negamax(state: GameState, seat: Seat, depth: number, alpha: number, beta: number, ctx: SearchCtx): number {
  ctx.nodes++;
  if ((ctx.nodes & 63) === 0 && performance.now() > ctx.deadline) ctx.aborted = true;
  if (ctx.aborted) return 0;
  const n = ctx.n;
  const opp = opponent(seat);
  if (state.pawns[opp].r === goalRow(opp, n)) return -WIN - depth;
  if (depth === 0) return evaluate(state, seat, n);
  let best = -Infinity;
  for (const m of orderedMoves(state, seat, n)) {
    const s = applyMoveUnchecked(state, seat, m);
    const v = -negamax(s, opp, depth - 1, -beta, -alpha, ctx);
    if (ctx.aborted) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function hard(state: GameState, seat: Seat, n: number, rand: () => number, budgetMs = 500): Move {
  const start = performance.now();
  const ctx: SearchCtx = { n, deadline: start + budgetMs, nodes: 0, aborted: false };
  const opp = opponent(seat);
  let moves = orderedMoves(state, seat, n);
  // Immediate win.
  for (const m of moves) {
    if (m.type === "pawn" && m.r === goalRow(seat, n)) return m;
  }
  let bestMove = moves[0] ?? medium(state, seat, n, rand);
  for (let depth = 1; depth <= 3; depth++) {
    let alpha = -Infinity;
    let iterBest: Move | null = null;
    const scores: { m: Move; v: number }[] = [];
    for (const m of moves) {
      const s = applyMoveUnchecked(state, seat, m);
      const v = -negamax(s, opp, depth - 1, -Infinity, -alpha, ctx);
      if (ctx.aborted) break;
      scores.push({ m, v });
      if (v > alpha) {
        alpha = v;
        iterBest = m;
      }
    }
    if (ctx.aborted) break;
    if (iterBest) bestMove = iterBest;
    // Principal-variation-first ordering for the next iteration.
    scores.sort((a, b) => b.v - a.v);
    moves = scores.map((x) => x.m);
  }
  return bestMove;
}

export function chooseMove(
  state: GameState,
  seat: Seat,
  n: number,
  level: BotLevel,
  opts: { seed?: number; budgetMs?: number } = {},
): Move {
  const rand = mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  if (level === "easy") return easy(state, seat, n, rand);
  if (level === "medium") return medium(state, seat, n, rand);
  return hard(state, seat, n, rand, opts.budgetMs ?? 500);
}

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type { Cell };
