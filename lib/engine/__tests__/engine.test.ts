import { describe, expect, it } from "vitest";
import {
  applyMove,
  createInitialState,
  distanceToGoal,
  formatGame,
  fromNotation,
  IllegalMoveError,
  isLegalWall,
  isWin,
  legalMoves,
  legalPawnMoves,
  shortestPath,
  toNotation,
  winner,
  type Cell,
  type GameState,
  type Move,
  type Seat,
  type Wall,
} from "../index";

const N9 = 9;

function st(p0: Cell, p1: Cell, walls: Wall[] = [], wallsLeft: [number, number] = [10, 10]): GameState {
  return { pawns: [p0, p1], walls, wallsLeft };
}
const key = (c: Cell) => `${c.r},${c.c}`;
const set = (cells: Cell[]) => new Set(cells.map(key)).size === cells.length && cells.map(key).sort();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("initial state", () => {
  it.each([5, 7, 9])("places pawns correctly on %i×%i", (n) => {
    const s = createInitialState(n, 7);
    expect(s.pawns[0]).toEqual({ r: n - 1, c: Math.floor(n / 2) });
    expect(s.pawns[1]).toEqual({ r: 0, c: Math.floor(n / 2) });
    expect(s.walls).toEqual([]);
    expect(s.wallsLeft).toEqual([7, 7]);
  });

  it("gives four moves from the start on a 9x9 minus the back edge", () => {
    const s = createInitialState(9);
    expect(set(legalPawnMoves(s, 0, 9))).toEqual(set([{ r: 7, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 5 }]));
  });
});

describe("pawn moves and jumps", () => {
  it("allows a straight jump over an adjacent opponent", () => {
    const s = st({ r: 4, c: 4 }, { r: 3, c: 4 });
    const moves = legalPawnMoves(s, 0, N9);
    expect(set(moves)).toEqual(set([{ r: 2, c: 4 }, { r: 5, c: 4 }, { r: 4, c: 3 }, { r: 4, c: 5 }]));
  });

  it("jumps in every direction (sideways)", () => {
    const s = st({ r: 4, c: 4 }, { r: 4, c: 5 });
    expect(legalPawnMoves(s, 0, N9).map(key)).toContain("4,6");
    expect(legalPawnMoves(s, 0, N9).map(key)).not.toContain("4,5");
  });

  it("moves diagonally when the opponent is against the board edge", () => {
    const s = st({ r: 1, c: 4 }, { r: 0, c: 4 });
    const moves = legalPawnMoves(s, 0, N9);
    expect(set(moves)).toEqual(set([{ r: 0, c: 3 }, { r: 0, c: 5 }, { r: 2, c: 4 }, { r: 1, c: 3 }, { r: 1, c: 5 }]));
  });

  it("moves diagonally when the opponent is in a corner (only one diagonal)", () => {
    const s = st({ r: 1, c: 0 }, { r: 0, c: 0 });
    const moves = legalPawnMoves(s, 0, N9).map(key);
    expect(moves).toContain("0,1");
    expect(moves).not.toContain("0,-1");
    expect(moves).not.toContain("0,0");
  });

  it("moves diagonally when a wall is behind the opponent", () => {
    // h wall at (2,4) blocks (2,4)<->(3,4)
    const s = st({ r: 4, c: 4 }, { r: 3, c: 4 }, [{ r: 2, c: 4, o: "h" }]);
    const moves = legalPawnMoves(s, 0, N9).map(key);
    expect(moves).toContain("3,3");
    expect(moves).toContain("3,5");
    expect(moves).not.toContain("2,4");
    expect(moves).not.toContain("3,4");
  });

  it("does not allow a diagonal blocked by a wall beside the opponent", () => {
    // v wall at (2,3) blocks (2,3)<->(2,4) and (3,3)<->(3,4)
    const s = st({ r: 4, c: 4 }, { r: 3, c: 4 }, [
      { r: 2, c: 4, o: "h" },
      { r: 2, c: 3, o: "v" },
    ]);
    const moves = legalPawnMoves(s, 0, N9).map(key);
    expect(moves).not.toContain("3,3");
    expect(moves).toContain("3,5");
  });

  it("does not jump through a wall between the pawns", () => {
    // h wall at (3,4) blocks (3,4)<->(4,4)
    const s = st({ r: 4, c: 4 }, { r: 3, c: 4 }, [{ r: 3, c: 4, o: "h" }]);
    const moves = legalPawnMoves(s, 0, N9).map(key);
    expect(moves).not.toContain("2,4");
    expect(moves).not.toContain("3,3");
    expect(moves).not.toContain("3,5");
    expect(moves).not.toContain("3,4");
  });

  it("stops at board edges and walls", () => {
    const s = st({ r: 8, c: 0 }, { r: 0, c: 8 });
    expect(set(legalPawnMoves(s, 0, N9))).toEqual(set([{ r: 7, c: 0 }, { r: 8, c: 1 }]));
    const walled = st({ r: 8, c: 0 }, { r: 0, c: 8 }, [{ r: 7, c: 0, o: "h" }]);
    expect(set(legalPawnMoves(walled, 0, N9))).toEqual(set([{ r: 8, c: 1 }]));
  });

  it("never lands on the opponent", () => {
    const s = st({ r: 4, c: 4 }, { r: 3, c: 4 });
    for (const m of legalPawnMoves(s, 0, N9)) expect(m).not.toEqual({ r: 3, c: 4 });
  });

  it("rejects an illegal pawn move in applyMove", () => {
    const s = createInitialState(9);
    expect(() => applyMove(s, 0, { type: "pawn", r: 6, c: 4 }, 9)).toThrow(IllegalMoveError);
    expect(() => applyMove(s, 0, { type: "pawn", r: 7, c: 5 }, 9)).toThrow(IllegalMoveError);
  });
});

describe("wall legality", () => {
  const base = (walls: Wall[]) => st({ r: 8, c: 4 }, { r: 0, c: 4 }, walls);

  it("accepts a plain wall", () => {
    expect(isLegalWall(base([]), { r: 3, c: 2, o: "h" }, N9)).toEqual({ ok: true });
  });

  it.each([
    [{ r: -1, c: 0, o: "h" }],
    [{ r: 0, c: -1, o: "v" }],
    [{ r: 8, c: 0, o: "h" }],
    [{ r: 0, c: 8, o: "v" }],
    [{ r: 1.5, c: 0, o: "h" }],
    [{ r: 1, c: 1, o: "x" }],
  ] as unknown as [Wall][])("rejects out-of-bounds %o", (w) => {
    expect(isLegalWall(base([]), w, N9).reason).toBe("out_of_bounds");
  });

  it("accepts walls on the far edges of the groove grid", () => {
    expect(isLegalWall(base([]), { r: 7, c: 7, o: "h" }, N9).ok).toBe(true);
    expect(isLegalWall(base([]), { r: 0, c: 0, o: "v" }, N9).ok).toBe(true);
  });

  const h: Wall = { r: 3, c: 3, o: "h" };
  const v: Wall = { r: 3, c: 3, o: "v" };

  it.each([
    ["identical h", h, h],
    ["h left neighbour", h, { r: 3, c: 2, o: "h" }],
    ["h right neighbour", h, { r: 3, c: 4, o: "h" }],
    ["identical v", v, v],
    ["v above", v, { r: 2, c: 3, o: "v" }],
    ["v below", v, { r: 4, c: 3, o: "v" }],
  ] as [string, Wall, Wall][])("rejects overlap: %s", (_, existing, w) => {
    expect(isLegalWall(base([existing]), w, N9).reason).toBe("overlap");
  });

  it("rejects crossing walls in both orders", () => {
    expect(isLegalWall(base([h]), v, N9).reason).toBe("cross");
    expect(isLegalWall(base([v]), h, N9).reason).toBe("cross");
  });

  it.each([
    ["h two apart", h, { r: 3, c: 5, o: "h" }],
    ["h one row down", h, { r: 4, c: 3, o: "h" }],
    ["h diagonal", h, { r: 4, c: 4, o: "h" }],
    ["v two apart", v, { r: 5, c: 3, o: "v" }],
    ["v one column over", v, { r: 3, c: 4, o: "v" }],
    ["T-junction v under h end", h, { r: 2, c: 4, o: "v" }],
    ["T-junction h beside v", v, { r: 4, c: 2, o: "h" }],
  ] as [string, Wall, Wall][])("allows non-overlapping: %s", (_, existing, w) => {
    expect(isLegalWall(base([existing]), w, N9).ok).toBe(true);
  });

  it("rejects a wall that traps seat 1", () => {
    const s = st({ r: 4, c: 2 }, { r: 0, c: 2 }, [
      { r: 0, c: 0, o: "h" },
      { r: 0, c: 2, o: "h" },
    ]);
    expect(isLegalWall(s, { r: 0, c: 3, o: "v" }, 5)).toEqual({ ok: false, reason: "blocks_path" });
  });

  it("rejects a wall that traps seat 0", () => {
    const s = st({ r: 4, c: 2 }, { r: 0, c: 2 }, [
      { r: 3, c: 0, o: "h" },
      { r: 3, c: 2, o: "h" },
    ]);
    expect(isLegalWall(s, { r: 3, c: 3, o: "v" }, 5)).toEqual({ ok: false, reason: "blocks_path" });
  });

  it("rejects a wall that traps the player placing it", () => {
    const s = st({ r: 4, c: 2 }, { r: 0, c: 2 }, [
      { r: 3, c: 0, o: "h" },
      { r: 3, c: 2, o: "h" },
    ]);
    expect(() => applyMove(s, 0, { type: "wall", r: 3, c: 3, o: "v" }, 5)).toThrow("blocks_path");
  });

  it("rejects walls when the seat has none left", () => {
    const s = st({ r: 8, c: 4 }, { r: 0, c: 4 }, [], [0, 3]);
    expect(isLegalWall(s, { r: 3, c: 3, o: "h" }, N9, 0).reason).toBe("no_walls_left");
    expect(isLegalWall(s, { r: 3, c: 3, o: "h" }, N9, 1).ok).toBe(true);
    expect(() => applyMove(s, 0, { type: "wall", r: 3, c: 3, o: "h" }, N9)).toThrow("no_walls_left");
  });

  it("decrements wall count and does not mutate the input", () => {
    const s = createInitialState(9);
    const next = applyMove(s, 0, { type: "wall", r: 3, c: 2, o: "h" }, 9);
    expect(next.wallsLeft).toEqual([9, 10]);
    expect(next.walls).toEqual([{ r: 3, c: 2, o: "h" }]);
    expect(s.walls).toEqual([]);
    expect(s.wallsLeft).toEqual([10, 10]);
  });

  it("validates a wall in well under 1 ms", () => {
    const s = createInitialState(9);
    const t0 = performance.now();
    let k = 0;
    for (let i = 0; i < 2000; i++) {
      const w: Wall = { r: i % 8, c: (i >> 3) % 8, o: i & 1 ? "h" : "v" };
      if (isLegalWall(s, w, 9).ok) k++;
    }
    const per = (performance.now() - t0) / 2000;
    expect(k).toBeGreaterThan(0);
    expect(per).toBeLessThan(1);
  });
});

describe("paths and wins", () => {
  it("returns the shortest path including the start", () => {
    const s = createInitialState(9);
    const p = shortestPath(s, 0, 9)!;
    expect(p[0]).toEqual({ r: 8, c: 4 });
    expect(p[p.length - 1].r).toBe(0);
    expect(p.length - 1).toBe(8);
    expect(distanceToGoal(s, 1, 9)).toBe(8);
  });

  it("routes around walls", () => {
    const s = st({ r: 1, c: 4 }, { r: 8, c: 0 }, [{ r: 0, c: 3, o: "h" }, { r: 0, c: 5, o: "h" }]);
    // Cells (0,3..6) blocked from below; nearest opening at c=2 or c=7.
    expect(distanceToGoal(s, 0, 9)).toBe(3);
  });

  it("detects a win for seat 0", () => {
    const s = st({ r: 1, c: 4 }, { r: 5, c: 0 });
    const next = applyMove(s, 0, { type: "pawn", r: 0, c: 4 }, 9);
    expect(isWin(next, 0, 9)).toBe(true);
    expect(isWin(next, 1, 9)).toBe(false);
    expect(winner(next, 9)).toBe(0);
  });

  it("detects a win for seat 1", () => {
    const s = st({ r: 3, c: 4 }, { r: 7, c: 0 });
    const next = applyMove(s, 1, { type: "pawn", r: 8, c: 0 }, 9);
    expect(isWin(next, 1, 9)).toBe(true);
    expect(winner(next, 9)).toBe(1);
  });

  it("rejects moves after the game is won", () => {
    const s = st({ r: 0, c: 4 }, { r: 5, c: 0 });
    expect(() => applyMove(s, 1, { type: "pawn", r: 6, c: 0 }, 9)).toThrow("game_over");
  });
});

describe("notation", () => {
  it("matches the documented examples on 9×9", () => {
    expect(toNotation({ type: "wall", r: 3, c: 2, o: "h" }, 9)).toBe("c6h");
    expect(toNotation({ type: "pawn", r: 7, c: 4 }, 9)).toBe("e2");
    expect(fromNotation("e1", 9)).toEqual({ type: "pawn", r: 8, c: 4 });
    expect(fromNotation("C6H", 9)).toEqual({ type: "wall", r: 3, c: 2, o: "h" });
  });

  it.each([5, 7, 9])("round-trips every pawn square and wall on %i×%i", (n) => {
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const m: Move = { type: "pawn", r, c };
        expect(fromNotation(toNotation(m, n), n)).toEqual(m);
      }
    for (let r = 0; r < n - 1; r++)
      for (let c = 0; c < n - 1; c++)
        for (const o of ["h", "v"] as const) {
          const m: Move = { type: "wall", r, c, o };
          expect(fromNotation(toNotation(m, n), n)).toEqual(m);
        }
  });

  it("rejects bad notation", () => {
    expect(() => fromNotation("z1", 9)).toThrow();
    expect(() => fromNotation("a10", 9)).toThrow();
    expect(() => fromNotation("i1h", 9)).toThrow(); // column i is the last; no wall anchor there
    expect(() => fromNotation("a1h", 9)).toThrow(); // rank 1 is the bottom row; no wall anchor
    expect(() => fromNotation("hello", 9)).toThrow();
  });

  it("formats a game", () => {
    expect(formatGame(["e2", "e8", "c6h"])).toBe("1. e2 e8 2. c6h");
  });
});

describe("random games", () => {
  it("plays 200 random legal games to completion without throwing", () => {
    const rand = rng(42);
    const sizes = [5, 7, 9];
    for (let g = 0; g < 200; g++) {
      const n = sizes[g % 3];
      let s = createInitialState(n);
      let seat: Seat = 0;
      let plies = 0;
      while (winner(s, n) === null) {
        const moves = legalMoves(s, seat, n);
        expect(moves.length).toBeGreaterThan(0);
        // Bias toward pawn moves so games finish in reasonable time.
        const pawnMoves = moves.filter((m) => m.type === "pawn");
        const pool = rand() < 0.7 ? pawnMoves : moves;
        const m = pool[Math.floor(rand() * pool.length)];
        s = applyMove(s, seat, m, n);
        // Both players must always keep a path.
        expect(distanceToGoal(s, 0, n)).toBeLessThan(Infinity);
        expect(distanceToGoal(s, 1, n)).toBeLessThan(Infinity);
        seat = seat === 0 ? 1 : 0;
        plies++;
        expect(plies).toBeLessThan(20000);
      }
    }
  }, 60000);
});
