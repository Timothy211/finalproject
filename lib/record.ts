"use client";

export type RecordKind = "online" | "bot-easy" | "bot-medium" | "bot-hard";
export interface WL {
  w: number;
  l: number;
}
type Records = Partial<Record<RecordKind, WL>>;

const KEY = "q:record";
const COUNTED = "q:recordCounted";

export function readRecord(): Records {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Records;
  } catch {
    return {};
  }
}

/** Record a result once per game id. */
export function recordResult(kind: RecordKind, won: boolean, gameId: string) {
  try {
    const counted = new Set<string>(JSON.parse(localStorage.getItem(COUNTED) ?? "[]"));
    if (counted.has(gameId)) return;
    counted.add(gameId);
    localStorage.setItem(COUNTED, JSON.stringify([...counted].slice(-200)));
    const r = readRecord();
    const cur = r[kind] ?? { w: 0, l: 0 };
    r[kind] = won ? { ...cur, w: cur.w + 1 } : { ...cur, l: cur.l + 1 };
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}
