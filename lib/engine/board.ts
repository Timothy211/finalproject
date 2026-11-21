import type { Cell, GameState, Seat, Wall } from "./types";

/** Direction bits used in the blocked-edge mask. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export const DIRS: ReadonlyArray<{ bit: number; dr: number; dc: number }> = [
  { bit: N, dr: -1, dc: 0 },
  { bit: E, dr: 0, dc: 1 },
  { bit: S, dr: 1, dc: 0 },
  { bit: W, dr: 0, dc: -1 },
];

export const goalRow = (seat: Seat, n: number) => (seat === 0 ? 0 : n - 1);
export const opponent = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
export const inBounds = (r: number, c: number, n: number) => r >= 0 && c >= 0 && r < n && c < n;
export const sameCell = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
export const wallKey = (w: Wall) => `${w.r},${w.c},${w.o}`;

/** Add the edges blocked by one wall to a mask (mutates). */
export function addWallToMask(mask: Uint8Array, w: Wall, n: number): void {
  const { r, c } = w;
  if (w.o === "h") {
    // blocks (r,c)<->(r+1,c) and (r,c+1)<->(r+1,c+1)
    mask[r * n + c] |= S;
    mask[(r + 1) * n + c] |= N;
    mask[r * n + c + 1] |= S;
    mask[(r + 1) * n + c + 1] |= N;
  } else {
    // blocks (r,c)<->(r,c+1) and (r+1,c)<->(r+1,c+1)
    mask[r * n + c] |= E;
    mask[r * n + c + 1] |= W;
    mask[(r + 1) * n + c] |= E;
    mask[(r + 1) * n + c + 1] |= W;
  }
}

const maskCache = new WeakMap<Wall[], { n: number; mask: Uint8Array }>();

/**
 * Per-cell bitmask of blocked directions. Cached by the identity of the walls
 * array, so treat `state.walls` as immutable (applyMove always creates a new array).
 */
export function blockedMask(walls: Wall[], n: number): Uint8Array {
  const hit = maskCache.get(walls);
  if (hit && hit.n === n) return hit.mask;
  const mask = new Uint8Array(n * n);
  for (const w of walls) addWallToMask(mask, w, n);
  maskCache.set(walls, { n, mask });
  return mask;
}

/** BFS from `from` to any cell on the `goal` row. Returns the path (inclusive) or null. */
export function bfsPath(mask: Uint8Array, n: number, from: Cell, goal: number): Cell[] | null {
  if (from.r === goal) return [{ r: from.r, c: from.c }];
  const size = n * n;
  const prev = new Int16Array(size).fill(-1);
  const queue = new Int16Array(size);
  const start = from.r * n + from.c;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  prev[start] = start;
  while (head < tail) {
    const cur = queue[head++];
    const r = (cur / n) | 0;
    const c = cur - r * n;
    const m = mask[cur];
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      if (m & d.bit) continue;
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const nx = nr * n + nc;
      if (prev[nx] !== -1) continue;
      prev[nx] = cur;
      if (nr === goal) {
        const path: Cell[] = [];
        let k = nx;
        while (k !== start) {
          path.push({ r: (k / n) | 0, c: k % n });
          k = prev[k];
        }
        path.push({ r: from.r, c: from.c });
        return path.reverse();
      }
      queue[tail++] = nx;
    }
  }
  return null;
}

/** Shortest distance to goal row, or -1 if unreachable (cheaper than bfsPath). */
export function bfsDistance(mask: Uint8Array, n: number, from: Cell, goal: number): number {
  if (from.r === goal) return 0;
  const size = n * n;
  const dist = new Int16Array(size).fill(-1);
  const queue = new Int16Array(size);
  const start = from.r * n + from.c;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const cur = queue[head++];
    const r = (cur / n) | 0;
    const c = cur - r * n;
    const m = mask[cur];
    const nd = dist[cur] + 1;
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      if (m & d.bit) continue;
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      if (nr === goal) return nd;
      const nx = nr * n + nc;
      if (dist[nx] !== -1) continue;
      dist[nx] = nd;
      queue[tail++] = nx;
    }
  }
  return -1;
}

export function cloneState(s: GameState): GameState {
  return {
    pawns: [{ ...s.pawns[0] }, { ...s.pawns[1] }],
    walls: s.walls.slice(),
    wallsLeft: [s.wallsLeft[0], s.wallsLeft[1]],
  };
}
