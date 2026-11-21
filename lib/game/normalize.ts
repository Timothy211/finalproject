import type { GameRow } from "@/lib/types";

/** Server-side copy of the row normaliser (no "use client" dependency). */
export function normalizeRowServer(raw: unknown): GameRow {
  const r = { ...(raw as Record<string, unknown>) };
  const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  r.state = json(r.state);
  r.last_move = r.last_move == null ? null : json(r.last_move);
  r.rematch_votes = r.rematch_votes ?? [];
  return r as unknown as GameRow;
}
