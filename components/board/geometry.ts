import type { Cell, Orientation, Wall } from "@/lib/engine";

/** Board geometry in SVG user units. */
export const S = 10; // cell size
export const G = 2.6; // groove width
export const P = S + G; // pitch
export const LABEL = 6; // margin for coordinate labels

export const boardSize = (n: number) => n * P + G;

export const cellX = (c: number) => G + c * P;
export const cellY = (r: number) => G + r * P;
export const cellCenter = (cell: Cell) => ({ x: cellX(cell.c) + S / 2, y: cellY(cell.r) + S / 2 });

export function wallRect(w: Wall) {
  if (w.o === "h") return { x: G + w.c * P, y: (w.r + 1) * P, w: 2 * S + G, h: G };
  return { x: (w.c + 1) * P, y: G + w.r * P, w: G, h: 2 * S + G };
}

export const wallCenter = (w: Wall) => ({ x: (w.c + 1) * P + G / 2, y: (w.r + 1) * P + G / 2 });

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cell containing an absolute board point, or null when in a groove / off-board. */
export function cellAt(x: number, y: number, n: number): Cell | null {
  const c = Math.floor((x - G) / P);
  const r = Math.floor((y - G) / P);
  if (r < 0 || c < 0 || r >= n || c >= n) return null;
  const ox = x - G - c * P;
  const oy = y - G - r * P;
  if (ox > S || oy > S) return null;
  return { r, c };
}

/** Nearest wall anchor and the orientation of the closest groove. */
export function nearestWall(x: number, y: number, n: number, forced?: Orientation | null): Wall {
  const fx = (x - G / 2) / P;
  const fy = (y - G / 2) / P;
  const c = clamp(Math.round(fx) - 1, 0, n - 2);
  const r = clamp(Math.round(fy) - 1, 0, n - 2);
  const dv = Math.abs(fx - Math.round(fx)); // distance to nearest vertical groove line
  const dh = Math.abs(fy - Math.round(fy)); // distance to nearest horizontal groove line
  const o: Orientation = forced ?? (dh <= dv ? "h" : "v");
  return { r, c, o };
}

export const sameWall = (a: Wall | null | undefined, b: Wall | null | undefined) =>
  !!a && !!b && a.r === b.r && a.c === b.c && a.o === b.o;
