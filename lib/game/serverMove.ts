import { applyMoveUnchecked, isWin, toNotation, validateMove, type GameState, type Move } from "@/lib/engine";
import { seatOf, type GameRow } from "@/lib/types";
import type { AppErrorCode } from "@/lib/errors";

export interface MoveRequestBody {
  move: Move;
  expectedVersion: number;
}

export type PrepareResult =
  | { ok: true; args: { p_game_id: string; p_user_id: string; p_expected_version: number; p_move: Move; p_notation: string; p_new_state: GameState; p_is_winning: boolean } }
  | { ok: false; status: number; code: AppErrorCode; reason?: string };

/** Strictly parse an untrusted request body. */
export function parseBody(raw: unknown): MoveRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const m = b.move as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") return null;
  if (!Number.isInteger(b.expectedVersion)) return null;
  const r = m.r;
  const c = m.c;
  if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
  if (m.type === "pawn") return { move: { type: "pawn", r: r as number, c: c as number }, expectedVersion: b.expectedVersion as number };
  if (m.type === "wall" && (m.o === "h" || m.o === "v"))
    return { move: { type: "wall", r: r as number, c: c as number, o: m.o }, expectedVersion: b.expectedVersion as number };
  return null;
}

/** Validate a move against the DB row with the shared engine and build the commit_move args. */
export function prepareMove(game: GameRow, userId: string, body: MoveRequestBody, nowMs: number): PrepareResult {
  if (game.status !== "active") return { ok: false, status: 409, code: "GAME_NOT_ACTIVE" };
  const seat = seatOf(game, userId);
  if (seat === null) return { ok: false, status: 403, code: "NOT_A_PLAYER" };
  if (game.turn_started_at && nowMs < Date.parse(game.turn_started_at) - 250)
    return { ok: false, status: 425, code: "GAME_NOT_STARTED" };
  if (game.version !== body.expectedVersion) return { ok: false, status: 409, code: "STALE_VERSION" };
  if (game.turn !== seat) return { ok: false, status: 422, code: "NOT_YOUR_TURN" };

  const n = game.board_size;
  const reason = validateMove(game.state, seat, body.move, n);
  if (reason) return { ok: false, status: 422, code: "ILLEGAL_MOVE", reason };

  const next = applyMoveUnchecked(game.state, seat, body.move);
  return {
    ok: true,
    args: {
      p_game_id: game.id,
      p_user_id: userId,
      p_expected_version: body.expectedVersion,
      p_move: body.move,
      p_notation: toNotation(body.move, n),
      p_new_state: next,
      p_is_winning: isWin(next, seat, n),
    },
  };
}

/** HTTP status for a DB error code raised by commit_move. */
export function statusForCode(code: AppErrorCode): number {
  switch (code) {
    case "STALE_VERSION":
    case "GAME_NOT_ACTIVE":
      return 409;
    case "NOT_YOUR_TURN":
    case "ILLEGAL_MOVE":
      return 422;
    case "GAME_NOT_STARTED":
      return 425;
    case "GAME_NOT_FOUND":
      return 404;
    case "NOT_A_PLAYER":
      return 403;
    default:
      return 500;
  }
}
