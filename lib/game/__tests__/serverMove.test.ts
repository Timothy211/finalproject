import { describe, expect, it } from "vitest";
import { parseBody, prepareMove } from "../serverMove";
import { createInitialState } from "../../engine";
import type { GameRow } from "../../types";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

function row(over: Partial<GameRow> = {}): GameRow {
  return {
    id: "g1",
    code: "ABCDEF",
    status: "active",
    host_id: A,
    p0_id: A,
    p1_id: B,
    p0_name: "Ann",
    p1_name: "Bob",
    p0_ready: true,
    p1_ready: true,
    board_size: 9,
    walls_per_player: 10,
    initial_time_ms: 300000,
    increment_ms: 3000,
    state: createInitialState(9, 10),
    turn: 0,
    move_count: 0,
    version: 5,
    clock_ms: [300000, 300000],
    turn_started_at: new Date(0).toISOString(),
    last_move: null,
    winner: null,
    end_reason: null,
    rematch_votes: [],
    rematch_of: null,
    rematch_game_id: null,
    created_at: "",
    started_at: null,
    finished_at: null,
    updated_at: "",
    ...over,
  };
}

describe("parseBody", () => {
  it("accepts pawn and wall moves and strips extra fields", () => {
    expect(parseBody({ move: { type: "pawn", r: 7, c: 4, evil: 1 }, expectedVersion: 3 })).toEqual({
      move: { type: "pawn", r: 7, c: 4 },
      expectedVersion: 3,
    });
    expect(parseBody({ move: { type: "wall", r: 3, c: 2, o: "h" }, expectedVersion: 0 })?.move).toEqual({
      type: "wall",
      r: 3,
      c: 2,
      o: "h",
    });
  });
  it.each([null, {}, { move: { type: "pawn", r: "7", c: 4 }, expectedVersion: 1 }, { move: { type: "wall", r: 1, c: 1, o: "x" }, expectedVersion: 1 }, { move: { type: "pawn", r: 1, c: 1 } }])(
    "rejects %o",
    (b) => expect(parseBody(b)).toBeNull(),
  );
});

describe("prepareMove", () => {
  const now = Date.now();
  it("builds commit args for a legal move", () => {
    const res = prepareMove(row(), A, { move: { type: "pawn", r: 7, c: 4 }, expectedVersion: 5 }, now);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.args.p_notation).toBe("e2");
      expect(res.args.p_new_state.pawns[0]).toEqual({ r: 7, c: 4 });
      expect(res.args.p_is_winning).toBe(false);
    }
  });
  it("rejects illegal moves with 422", () => {
    const res = prepareMove(row(), A, { move: { type: "pawn", r: 5, c: 4 }, expectedVersion: 5 }, now);
    expect(res).toMatchObject({ ok: false, status: 422, code: "ILLEGAL_MOVE", reason: "illegal_pawn_move" });
  });
  it("rejects the wrong player's turn", () => {
    expect(prepareMove(row(), B, { move: { type: "pawn", r: 1, c: 4 }, expectedVersion: 5 }, now)).toMatchObject({ status: 422, code: "NOT_YOUR_TURN" });
  });
  it("rejects stale versions with 409", () => {
    expect(prepareMove(row(), A, { move: { type: "pawn", r: 7, c: 4 }, expectedVersion: 4 }, now)).toMatchObject({ status: 409, code: "STALE_VERSION" });
  });
  it("rejects outsiders, inactive games and the countdown", () => {
    expect(prepareMove(row(), "x", { move: { type: "pawn", r: 7, c: 4 }, expectedVersion: 5 }, now)).toMatchObject({ status: 403 });
    expect(prepareMove(row({ status: "finished" }), A, { move: { type: "pawn", r: 7, c: 4 }, expectedVersion: 5 }, now)).toMatchObject({ status: 409, code: "GAME_NOT_ACTIVE" });
    const future = new Date(now + 3000).toISOString();
    expect(prepareMove(row({ turn_started_at: future }), A, { move: { type: "pawn", r: 7, c: 4 }, expectedVersion: 5 }, now)).toMatchObject({ status: 425 });
  });
  it("flags winning moves", () => {
    const s = { pawns: [{ r: 1, c: 4 }, { r: 5, c: 0 }], walls: [], wallsLeft: [10, 10] } as GameRow["state"];
    const res = prepareMove(row({ state: s }), A, { move: { type: "pawn", r: 0, c: 4 }, expectedVersion: 5 }, now);
    expect(res.ok && res.args.p_is_winning).toBe(true);
  });
});
