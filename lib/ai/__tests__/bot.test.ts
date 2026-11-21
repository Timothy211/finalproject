import { describe, expect, it } from "vitest";
import { chooseMove, type BotLevel } from "../bot";
import { applyMove, createInitialState, validateMove, winner, type GameState, type Seat } from "../../engine";

describe("bot", () => {
  it.each(["easy", "medium", "hard"] as BotLevel[])("%s returns legal moves for both seats", (level) => {
    let s = createInitialState(7);
    let seat: Seat = 0;
    for (let i = 0; i < 12 && winner(s, 7) === null; i++) {
      const m = chooseMove(s, seat, 7, level, { seed: i, budgetMs: 80 });
      expect(validateMove(s, seat, m, 7)).toBeNull();
      s = applyMove(s, seat, m, 7);
      seat = seat === 0 ? 1 : 0;
    }
  });

  it("takes an immediate win", () => {
    const s: GameState = { pawns: [{ r: 1, c: 4 }, { r: 5, c: 0 }], walls: [], wallsLeft: [5, 5] };
    for (const level of ["medium", "hard"] as BotLevel[]) {
      const m = chooseMove(s, 0, 9, level, { seed: 1, budgetMs: 100 });
      expect(m).toEqual({ type: "pawn", r: 0, c: 4 });
    }
  });

  it("medium uses a wall to stop an opponent about to win", () => {
    // Seat 1 is one step from row 8; seat 0 is far away.
    const s: GameState = { pawns: [{ r: 8, c: 0 }, { r: 7, c: 4 }], walls: [], wallsLeft: [5, 5] };
    const m = chooseMove(s, 0, 9, "medium", { seed: 3 });
    expect(m.type).toBe("wall");
  });

  it("hard beats easy on a 5×5 board most of the time", () => {
    let hardWins = 0;
    for (let g = 0; g < 6; g++) {
      let s = createInitialState(5);
      let seat: Seat = 0;
      const hardSeat: Seat = g % 2 === 0 ? 0 : 1;
      for (let ply = 0; ply < 200 && winner(s, 5) === null; ply++) {
        const m = chooseMove(s, seat, 5, seat === hardSeat ? "hard" : "easy", { seed: g * 100 + ply, budgetMs: 40 });
        s = applyMove(s, seat, m, 5);
        seat = seat === 0 ? 1 : 0;
      }
      if (winner(s, 5) === hardSeat) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(4);
  }, 30000);
});
