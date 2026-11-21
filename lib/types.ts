import type { GameState, Move, Seat } from "./engine/types";

/** Mirrors public.games in supabase/schema.sql. */
export type GameStatus = "waiting" | "active" | "finished" | "abandoned";
export type EndReason = "goal" | "timeout" | "resign" | "abandoned";

export interface GameRow {
  id: string;
  code: string;
  status: GameStatus;

  host_id: string;
  p0_id: string | null;
  p1_id: string | null;
  p0_name: string | null;
  p1_name: string | null;
  p0_ready: boolean;
  p1_ready: boolean;

  board_size: 5 | 7 | 9;
  walls_per_player: number;
  initial_time_ms: number; // 0 = untimed
  increment_ms: number;

  state: GameState;
  turn: Seat;
  move_count: number;
  version: number;
  clock_ms: [number, number];
  turn_started_at: string | null;
  last_move: Move | null;

  winner: Seat | null;
  end_reason: EndReason | null;

  rematch_votes: string[];
  rematch_of: string | null;
  rematch_game_id: string | null;

  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

/** Mirrors public.game_moves. */
export interface GameMoveRow {
  id: number;
  game_id: string;
  ply: number;
  player: Seat;
  move: Move;
  notation: string;
  clock_after_ms: number | null;
  created_at: string;
}

export type CreateSide = "p0" | "p1" | "random";

export function seatOf(g: Pick<GameRow, "p0_id" | "p1_id">, uid: string | null | undefined): Seat | null {
  if (!uid) return null;
  if (g.p0_id === uid) return 0;
  if (g.p1_id === uid) return 1;
  return null;
}

export function playerName(g: GameRow, seat: Seat): string {
  return (seat === 0 ? g.p0_name : g.p1_name) ?? (seat === 0 ? "Player 1" : "Player 2");
}

export function hostName(g: GameRow): string {
  return (g.host_id === g.p0_id ? g.p0_name : g.host_id === g.p1_id ? g.p1_name : null) ?? g.p0_name ?? g.p1_name ?? "A friend";
}
