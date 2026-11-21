"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { readRecord } from "@/lib/record";
import { useSetting } from "@/lib/settings";
import { OnlineSection } from "./OnlineSection";

export function HomeClient() {
  return (
    <div className="flex flex-col gap-4">
      <OnlineSection />
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/local?setup=bot"
          className="flex flex-col gap-1 rounded-2xl bg-card p-4 ring-1 ring-border transition hover:ring-accent"
        >
          <span className="text-2xl" aria-hidden>
            🤖
          </span>
          <span className="font-semibold">Play vs computer</span>
          <span className="text-xs text-muted">Easy, medium or hard</span>
        </Link>
        <Link
          href="/local?setup=pass"
          className="flex flex-col gap-1 rounded-2xl bg-card p-4 ring-1 ring-border transition hover:ring-accent"
        >
          <span className="text-2xl" aria-hidden>
            🤝
          </span>
          <span className="font-semibold">Pass &amp; play</span>
          <span className="text-xs text-muted">Two players, one device</span>
        </Link>
      </div>
      <RecordLine />
      <ThemeSwitch />
    </div>
  );
}

const emptySub = () => () => {};

function RecordLine() {
  const json = useSyncExternalStore(
    emptySub,
    () => localStorage.getItem("q:record") ?? "{}",
    () => "{}",
  );
  let r: ReturnType<typeof readRecord> = {};
  try {
    r = JSON.parse(json);
  } catch {
    /* ignore */
  }
  const parts = (
    [
      ["online", "Online"],
      ["bot-easy", "Easy bot"],
      ["bot-medium", "Medium bot"],
      ["bot-hard", "Hard bot"],
    ] as const
  )
    .filter(([k]) => r[k])
    .map(([k, label]) => `${label} ${r[k]!.w}–${r[k]!.l}`);
  if (!parts.length) return null;
  return <p className="text-center text-xs text-muted">Your record (W–L): {parts.join(" · ")}</p>;
}

function ThemeSwitch() {
  const [theme, setTheme] = useSetting("theme");
  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  return (
    <button
      onClick={() => setTheme(next)}
      className="mx-auto rounded-full px-3 py-1 text-xs text-muted ring-1 ring-border hover:text-fg"
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
    >
      Theme: {theme === "system" ? "System" : theme === "light" ? "Light ☀︎" : "Dark ☾"}
    </button>
  );
}
