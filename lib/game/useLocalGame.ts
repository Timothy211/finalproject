"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import { applyMove, createInitialState, toNotation, winner, type Cell, type GameState, type Move, type Seat } from "@/lib/engine";

export interface LocalGameState {
  n: number;
  walls: number;
  moves: Move[];
  states: GameState[]; // states[i] = position after i moves
  froms: Cell[]; // pawn position of the mover before each move
  resigned: Seat | null;
}

type Action =
  | { type: "move"; move: Move }
  | { type: "undo"; plies: number }
  | { type: "reset"; n?: number; walls?: number }
  | { type: "resign"; seat: Seat }
  | { type: "load"; data: LocalGameState };

function init(n: number, walls: number): LocalGameState {
  return { n, walls, moves: [], states: [createInitialState(n, walls)], froms: [], resigned: null };
}

function reducer(s: LocalGameState, a: Action): LocalGameState {
  switch (a.type) {
    case "move": {
      const cur = s.states[s.states.length - 1];
      if (winner(cur, s.n) !== null || s.resigned !== null) return s;
      const seat = (s.moves.length % 2) as Seat;
      try {
        const next = applyMove(cur, seat, a.move, s.n);
        return {
          ...s,
          moves: [...s.moves, a.move],
          states: [...s.states, next],
          froms: [...s.froms, cur.pawns[seat]],
        };
      } catch {
        return s;
      }
    }
    case "undo": {
      const k = Math.min(a.plies, s.moves.length);
      if (k <= 0) return { ...s, resigned: null };
      return {
        ...s,
        moves: s.moves.slice(0, -k),
        states: s.states.slice(0, -k),
        froms: s.froms.slice(0, -k),
        resigned: null,
      };
    }
    case "reset":
      return init(a.n ?? s.n, a.walls ?? s.walls);
    case "resign":
      return { ...s, resigned: a.seat };
    case "load":
      return a.data;
  }
}

/** Replays saved moves so a corrupted save can't produce an illegal position. */
function rebuild(n: number, walls: number, moves: Move[]): LocalGameState {
  let s = init(n, walls);
  for (const m of moves) s = reducer(s, { type: "move", move: m });
  return s;
}

export function useLocalGame(n: number, walls: number, storageKey?: string) {
  const [g, dispatch] = useReducer(reducer, undefined, () => init(n, walls));

  // Restore from storage on mount (client only).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { n: number; walls: number; moves: Move[]; resigned: Seat | null };
      if (saved.n !== n || saved.walls !== walls) return;
      const data = rebuild(saved.n, saved.walls, saved.moves);
      dispatch({ type: "load", data: { ...data, resigned: saved.resigned ?? null } });
    } catch {
      /* ignore */
    }
  }, [storageKey, n, walls]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ n: g.n, walls: g.walls, moves: g.moves, resigned: g.resigned }));
    } catch {
      /* ignore */
    }
  }, [storageKey, g]);

  const state = g.states[g.states.length - 1];
  const turn = (g.moves.length % 2) as Seat;
  const won = winner(state, g.n);
  const result: { winner: Seat; reason: "goal" | "resign" } | null =
    won !== null ? { winner: won, reason: "goal" } : g.resigned !== null ? { winner: (1 - g.resigned) as Seat, reason: "resign" } : null;

  const notations = useMemo(() => g.moves.map((m) => toNotation(m, g.n)), [g.moves, g.n]);

  const move = useCallback((m: Move) => dispatch({ type: "move", move: m }), []);
  const undo = useCallback((plies = 1) => dispatch({ type: "undo", plies }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const resign = useCallback((seat: Seat) => dispatch({ type: "resign", seat }), []);

  return { game: g, state, turn, result, notations, move, undo, reset, resign };
}
