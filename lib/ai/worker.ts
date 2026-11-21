/// <reference lib="webworker" />
import { chooseMove, type BotLevel } from "./bot";
import type { GameState, Seat } from "../engine/types";

export interface BotRequest {
  id: number;
  state: GameState;
  seat: Seat;
  n: number;
  level: BotLevel;
}

self.onmessage = (e: MessageEvent<BotRequest>) => {
  const { id, state, seat, n, level } = e.data;
  try {
    const move = chooseMove(state, seat, n, level);
    (self as unknown as Worker).postMessage({ id, move });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
