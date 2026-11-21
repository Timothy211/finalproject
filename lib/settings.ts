"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type BoardTheme = "wood" | "slate" | "mint" | "night";
export type ConfirmPref = "auto" | "on" | "off";

export interface Settings {
  sound: boolean;
  tickSound: boolean;
  confirmMoves: ConfirmPref;
  showPath: boolean;
  thinkingGhost: boolean;
  muteChat: boolean;
  theme: ThemePref;
  boardTheme: BoardTheme;
  name: string;
  seenHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  tickSound: true,
  confirmMoves: "auto",
  showPath: false,
  thinkingGhost: true,
  muteChat: false,
  theme: "system",
  boardTheme: "wood",
  name: "",
  seenHint: false,
};

const PREFIX = "q:";
const EVENT = "q:settings";

export function readSetting<K extends keyof Settings>(key: K): Settings[K] {
  if (typeof window === "undefined") return DEFAULT_SETTINGS[key];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return DEFAULT_SETTINGS[key];
    return JSON.parse(raw) as Settings[K];
  } catch {
    return DEFAULT_SETTINGS[key];
  }
}

export function writeSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable */
  }
  cache.delete(key);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  if (key === "theme") applyTheme(value as ThemePref);
  if (key === "boardTheme") document.documentElement.dataset.board = value as string;
}

export function applyTheme(t: ThemePref) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const cache = new Map<keyof Settings, unknown>();

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) {
      cache.clear();
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reactive single setting backed by localStorage. */
export function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K]) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      if (!cache.has(key)) cache.set(key, readSetting(key));
      return cache.get(key) as Settings[K];
    },
    () => DEFAULT_SETTINGS[key],
  );
  const set = useCallback((v: Settings[K]) => writeSetting(key, v), [key]);
  return [value, set];
}

/** Coarse pointer (touch) detection, reactive. */
export function useIsTouch(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(pointer: coarse)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

export function useConfirmMoves(): boolean {
  const [pref] = useSetting("confirmMoves");
  const touch = useIsTouch();
  return pref === "on" || (pref === "auto" && touch);
}
