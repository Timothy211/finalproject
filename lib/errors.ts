import { MOVE_REASON_TEXT } from "./engine/rules";

export const ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "NAME_REQUIRED",
  "BAD_SIDE",
  "TOO_MANY_OPEN_GAMES",
  "GAME_NOT_FOUND",
  "GAME_ALREADY_STARTED",
  "GAME_FULL",
  "NOT_A_PLAYER",
  "GAME_NOT_WAITING",
  "GAME_NOT_ACTIVE",
  "GAME_NOT_FINISHED",
  "STALE_VERSION",
  "NOT_YOUR_TURN",
  "GAME_NOT_STARTED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** App-level codes used by the move API in addition to the DB codes. */
export type AppErrorCode = ErrorCode | "ILLEGAL_MOVE" | "BAD_REQUEST" | "FLAGGED" | "NETWORK" | "SERVER_ERROR" | "UNKNOWN";

const MESSAGES: Record<AppErrorCode, string> = {
  NOT_AUTHENTICATED: "You're not signed in. Refresh the page to reconnect.",
  NAME_REQUIRED: "Please enter a name first.",
  BAD_SIDE: "Pick a side: first, second or random.",
  TOO_MANY_OPEN_GAMES: "You already have 5 open lobbies. Start or cancel one first.",
  GAME_NOT_FOUND: "That game doesn't exist. Check the code and try again.",
  GAME_ALREADY_STARTED: "That game has already started — you can watch it as a spectator.",
  GAME_FULL: "That game is full — you can watch it as a spectator.",
  NOT_A_PLAYER: "You're not a player in this game.",
  GAME_NOT_WAITING: "The lobby has closed — the game already started or was cancelled.",
  GAME_NOT_ACTIVE: "This game is no longer in progress.",
  GAME_NOT_FINISHED: "The game isn't over yet.",
  STALE_VERSION: "The board changed before your move arrived. It's been refreshed.",
  NOT_YOUR_TURN: "It's not your turn.",
  GAME_NOT_STARTED: "Hold on — the game hasn't started yet.",
  ILLEGAL_MOVE: "That move isn't allowed.",
  BAD_REQUEST: "Something was wrong with that request.",
  FLAGGED: "Your time ran out before the move arrived.",
  NETWORK: "Connection problem — please try again.",
  SERVER_ERROR: "The server had a problem. Please try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** Extract a known code from a Supabase/PostgREST error or message. */
export function errorCodeOf(err: unknown): AppErrorCode {
  const msg =
    typeof err === "string"
      ? err
      : err && typeof err === "object"
        ? String((err as { message?: unknown; code?: unknown }).message ?? (err as { code?: unknown }).code ?? "")
        : "";
  for (const c of Object.keys(MESSAGES) as AppErrorCode[]) if (msg.includes(c)) return c;
  if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) return "NETWORK";
  return "UNKNOWN";
}

export function friendlyError(err: unknown, reason?: string): string {
  const code = errorCodeOf(err);
  if (code === "ILLEGAL_MOVE" && reason && MOVE_REASON_TEXT[reason]) return MOVE_REASON_TEXT[reason];
  return MESSAGES[code];
}

export function messageFor(code: AppErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.UNKNOWN;
}
