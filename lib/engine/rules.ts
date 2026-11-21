import { DIRS, addWallToMask, bfsDistance, bfsPath, blockedMask, goalRow, inBounds, opponent, sameCell, wallKey } from "./board";
import type { Cell, GameState, Move, Seat, Wall, WallCheck } from "./types";

export function defaultWalls(n: number): number {
  return n === 5 ? 5 : n === 7 ? 8 : 10;
}

export function createInitialState(n: number, walls: number = defaultWalls(n)): GameState {
  const mid = Math.floor(n / 2);
  return {
    pawns: [
      { r: n - 1, c: mid },
      { r: 0, c: mid },
    ],
    walls: [],
    wallsLeft: [walls, walls],
  };
}

/** All legal destination cells for `seat`'s pawn, including jumps and diagonals. */
export function legalPawnMoves(state: GameState, seat: Seat, n: number): Cell[] {
  const mask = blockedMask(state.walls, n);
  const me = state.pawns[seat];
  const opp = state.pawns[opponent(seat)];
  const out: Cell[] = [];
  const seen = new Set<number>();
  const push = (r: number, c: number) => {
    const k = r * n + c;
    if (seen.has(k)) return;
    if (r === me.r && c === me.c) return;
    if (r === opp.r && c === opp.c) return;
    seen.add(k);
    out.push({ r, c });
  };

  for (let i = 0; i < 4; i++) {
    const d = DIRS[i];
    if (mask[me.r * n + me.c] & d.bit) continue;
    const nr = me.r + d.dr;
    const nc = me.c + d.dc;
    if (!inBounds(nr, nc, n)) continue;
    if (nr !== opp.r || nc !== opp.c) {
      push(nr, nc);
      continue;
    }
    // Opponent adjacent with no wall between: try the straight jump.
    const jr = opp.r + d.dr;
    const jc = opp.c + d.dc;
    const straightBlocked = !!(mask[opp.r * n + opp.c] & d.bit) || !inBounds(jr, jc, n);
    if (!straightBlocked) {
      push(jr, jc);
      continue;
    }
    // Blocked behind: diagonal steps sideways from the opponent's cell.
    for (let j = 0; j < 4; j++) {
      const s = DIRS[j];
      if (s.dr === d.dr && s.dc === d.dc) continue; // forward
      if (s.dr === -d.dr && s.dc === -d.dc) continue; // back onto me
      if (mask[opp.r * n + opp.c] & s.bit) continue;
      const sr = opp.r + s.dr;
      const sc = opp.c + s.dc;
      if (!inBounds(sr, sc, n)) continue;
      push(sr, sc);
    }
  }
  return out;
}

export function isLegalPawnMove(state: GameState, seat: Seat, to: Cell, n: number): boolean {
  return legalPawnMoves(state, seat, n).some((c) => sameCell(c, to));
}

const keyCache = new WeakMap<Wall[], Set<string>>();
function wallKeySet(walls: Wall[]): Set<string> {
  let s = keyCache.get(walls);
  if (!s) {
    s = new Set(walls.map(wallKey));
    keyCache.set(walls, s);
  }
  return s;
}

/** Geometry-only checks: bounds, overlap, cross. */
export function wallGeometry(walls: Wall[], wall: Wall, n: number): WallCheck {
  const { r, c, o } = wall;
  if (
    !Number.isInteger(r) ||
    !Number.isInteger(c) ||
    (o !== "h" && o !== "v") ||
    r < 0 ||
    c < 0 ||
    r > n - 2 ||
    c > n - 2
  ) {
    return { ok: false, reason: "out_of_bounds" };
  }
  const keys = wallKeySet(walls);
  if (keys.has(wallKey(wall))) return { ok: false, reason: "overlap" };
  if (o === "h") {
    if (keys.has(`${r},${c - 1},h`) || keys.has(`${r},${c + 1},h`)) return { ok: false, reason: "overlap" };
    if (keys.has(`${r},${c},v`)) return { ok: false, reason: "cross" };
  } else {
    if (keys.has(`${r - 1},${c},v`) || keys.has(`${r + 1},${c},v`)) return { ok: false, reason: "overlap" };
    if (keys.has(`${r},${c},h`)) return { ok: false, reason: "cross" };
  }
  return { ok: true };
}

/**
 * Full wall legality. When `seat` is given, it also checks that seat has walls left.
 */
export function isLegalWall(state: GameState, wall: Wall, n: number, seat?: Seat): WallCheck {
  if (seat !== undefined && state.wallsLeft[seat] <= 0) return { ok: false, reason: "no_walls_left" };
  const geo = wallGeometry(state.walls, wall, n);
  if (!geo.ok) return geo;
  const mask = blockedMask(state.walls, n).slice();
  addWallToMask(mask, wall, n);
  if (
    bfsDistance(mask, n, state.pawns[0], goalRow(0, n)) < 0 ||
    bfsDistance(mask, n, state.pawns[1], goalRow(1, n)) < 0
  ) {
    return { ok: false, reason: "blocks_path" };
  }
  return { ok: true };
}

export class IllegalMoveError extends Error {
  constructor(public reason: string) {
    super(`Illegal move: ${reason}`);
    this.name = "IllegalMoveError";
  }
}

/** Validate a move; returns null when legal, otherwise a reason code. */
export function validateMove(state: GameState, seat: Seat, move: Move, n: number): string | null {
  if (!move || typeof move !== "object") return "bad_move";
  if (isWin(state, 0, n) || isWin(state, 1, n)) return "game_over";
  if (move.type === "pawn") {
    if (!Number.isInteger(move.r) || !Number.isInteger(move.c)) return "bad_move";
    return isLegalPawnMove(state, seat, move, n) ? null : "illegal_pawn_move";
  }
  if (move.type === "wall") {
    const res = isLegalWall(state, { r: move.r, c: move.c, o: move.o }, n, seat);
    return res.ok ? null : res.reason!;
  }
  return "bad_move";
}

/** Apply a move immutably. Throws IllegalMoveError if illegal. */
export function applyMove(state: GameState, seat: Seat, move: Move, n: number): GameState {
  const reason = validateMove(state, seat, move, n);
  if (reason) throw new IllegalMoveError(reason);
  return applyMoveUnchecked(state, seat, move);
}

/** Apply without validation (for search and replay of already-validated moves). */
export function applyMoveUnchecked(state: GameState, seat: Seat, move: Move): GameState {
  if (move.type === "pawn") {
    const pawns: [Cell, Cell] = [state.pawns[0], state.pawns[1]];
    pawns[seat] = { r: move.r, c: move.c };
    return { pawns, walls: state.walls, wallsLeft: state.wallsLeft };
  }
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  wallsLeft[seat] -= 1;
  return {
    pawns: state.pawns,
    walls: [...state.walls, { r: move.r, c: move.c, o: move.o }],
    wallsLeft,
  };
}

export function isWin(state: GameState, seat: Seat, n: number): boolean {
  return state.pawns[seat].r === goalRow(seat, n);
}

export function winner(state: GameState, n: number): Seat | null {
  if (isWin(state, 0, n)) return 0;
  if (isWin(state, 1, n)) return 1;
  return null;
}

/** Shortest path (including the start cell) for `seat` to its goal row, ignoring pawns. */
export function shortestPath(state: GameState, seat: Seat, n: number): Cell[] | null {
  return bfsPath(blockedMask(state.walls, n), n, state.pawns[seat], goalRow(seat, n));
}

/** Number of steps to goal (ignoring pawns), or Infinity if trapped. */
export function distanceToGoal(state: GameState, seat: Seat, n: number): number {
  const d = bfsDistance(blockedMask(state.walls, n), n, state.pawns[seat], goalRow(seat, n));
  return d < 0 ? Infinity : d;
}

/** All legal walls for a seat. */
export function legalWalls(state: GameState, seat: Seat, n: number): Wall[] {
  if (state.wallsLeft[seat] <= 0) return [];
  const out: Wall[] = [];
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      for (const o of ["h", "v"] as const) {
        const w: Wall = { r, c, o };
        if (isLegalWall(state, w, n).ok) out.push(w);
      }
  return out;
}

/** All legal moves for a seat. */
export function legalMoves(state: GameState, seat: Seat, n: number): Move[] {
  const moves: Move[] = legalPawnMoves(state, seat, n).map((c) => ({ type: "pawn", r: c.r, c: c.c }));
  for (const w of legalWalls(state, seat, n)) moves.push({ type: "wall", ...w });
  return moves;
}

/** Reason codes in plain words, for tooltips and toasts. */
export const MOVE_REASON_TEXT: Record<string, string> = {
  out_of_bounds: "Off the board",
  overlap: "Overlaps a wall",
  cross: "Crosses a wall",
  blocks_path: "Would trap a player",
  no_walls_left: "No walls left",
  illegal_pawn_move: "Your pawn can't move there",
  bad_move: "That isn't a valid move",
  game_over: "The game is already over",
};
