import type { Move } from "./types";

const FILES = "abcdefghijklmnopqrstuvwxyz";

export const fileOf = (c: number) => FILES[c];
/** Ranks count 1…n from the bottom. */
export const rankOf = (r: number, n: number) => n - r;

export function cellName(r: number, c: number, n: number): string {
  return `${fileOf(c)}${rankOf(r, n)}`;
}

/**
 * Pawn: destination square ("e2"). Wall: top-left cell of the 2×2 block around
 * its center — which is the anchor cell {r, c} — plus orientation ("c6h").
 */
export function toNotation(move: Move, n: number): string {
  const base = cellName(move.r, move.c, n);
  return move.type === "wall" ? `${base}${move.o}` : base;
}

export function fromNotation(s: string, n: number): Move {
  const m = /^([a-z])(\d{1,2})([hv])?$/.exec(s.trim().toLowerCase());
  if (!m) throw new Error(`Bad notation: ${s}`);
  const c = FILES.indexOf(m[1]);
  const r = n - Number(m[2]);
  if (c < 0 || c >= n || r < 0 || r >= n) throw new Error(`Bad notation: ${s}`);
  if (m[3]) {
    if (r > n - 2 || c > n - 2) throw new Error(`Bad notation: ${s}`);
    return { type: "wall", r, c, o: m[3] as "h" | "v" };
  }
  return { type: "pawn", r, c };
}

/** "1. e2 e8 2. c6h d8" */
export function formatGame(notations: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < notations.length; i += 2) {
    const b = notations[i + 1];
    parts.push(`${i / 2 + 1}. ${notations[i]}${b ? " " + b : ""}`);
  }
  return parts.join(" ");
}
