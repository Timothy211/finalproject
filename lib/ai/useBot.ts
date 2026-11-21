"use client";

import { useCallback, useEffect, useRef } from "react";
import { chooseMove, type BotLevel } from "./bot";
import type { GameState, Move, Seat } from "../engine/types";

/** Runs the bot in a Web Worker (falls back to the main thread if workers are unavailable). */
export function useBot() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (m: Move) => void>());
  const nextId = useRef(1);

  useEffect(() => {
    const map = pending.current;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      map.clear();
    };
  }, []);

  const getWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    try {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; move?: Move; error?: string }>) => {
        const cb = pending.current.get(e.data.id);
        pending.current.delete(e.data.id);
        if (cb && e.data.move) cb(e.data.move);
      };
      workerRef.current = w;
      return w;
    } catch {
      return null;
    }
  }, []);

  const think = useCallback(
    (state: GameState, seat: Seat, n: number, level: BotLevel): Promise<Move> => {
      const w = getWorker();
      if (!w) return Promise.resolve(chooseMove(state, seat, n, level));
      const id = nextId.current++;
      return new Promise<Move>((resolve) => {
        const timer = window.setTimeout(() => {
          if (pending.current.has(id)) {
            pending.current.delete(id);
            resolve(chooseMove(state, seat, n, level === "hard" ? "medium" : level));
          }
        }, 4000);
        pending.current.set(id, (m) => {
          window.clearTimeout(timer);
          resolve(m);
        });
        w.postMessage({ id, state, seat, n, level });
      });
    },
    [getWorker],
  );

  return think;
}
