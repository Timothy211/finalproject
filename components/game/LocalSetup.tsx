"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Segmented } from "@/components/ui/Modal";
import { defaultWalls } from "@/lib/engine";
import type { BotLevel } from "@/lib/ai/bot";

export function LocalSetup({ initialMode }: { initialMode: "pass" | "bot" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"pass" | "bot">(initialMode);
  const [n, setN] = useState<5 | 7 | 9>(9);
  const [walls, setWalls] = useState(defaultWalls(9));
  const [level, setLevel] = useState<BotLevel>("medium");
  const [side, setSide] = useState<"0" | "1" | "random">("0");

  const start = () => {
    const s = side === "random" ? (Math.random() < 0.5 ? "0" : "1") : side;
    const q = new URLSearchParams({ mode, n: String(n), walls: String(walls) });
    if (mode === "bot") {
      q.set("level", level);
      q.set("side", s);
    }
    try {
      // Starting from setup always means a fresh game.
      localStorage.removeItem(mode === "bot" ? `q:local:bot:${level}:${s}` : "q:local:pass");
    } catch {
      /* ignore */
    }
    router.push(`/local?${q}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-2">
        <Link href="/" className="rounded-lg p-2 text-muted hover:bg-card-2 hover:text-fg" aria-label="Home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold">Play on this device</h1>
      </header>

      <div className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border">
        <Field label="Mode">
          <Segmented
            ariaLabel="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "pass", label: "Pass & play" },
              { value: "bot", label: "vs Computer" },
            ]}
          />
        </Field>
        {mode === "bot" && (
          <>
            <Field label="Difficulty">
              <Segmented
                ariaLabel="Difficulty"
                value={level}
                onChange={setLevel}
                options={[
                  { value: "easy", label: "Easy" },
                  { value: "medium", label: "Medium" },
                  { value: "hard", label: "Hard" },
                ]}
              />
            </Field>
            <Field label="You play">
              <Segmented
                ariaLabel="Side"
                value={side}
                onChange={setSide}
                options={[
                  { value: "0", label: "First" },
                  { value: "1", label: "Second" },
                  { value: "random", label: "Random" },
                ]}
              />
            </Field>
          </>
        )}
        <Field label="Board size">
          <Segmented
            ariaLabel="Board size"
            value={n}
            onChange={(v) => {
              setN(v);
              setWalls(defaultWalls(v));
            }}
            options={[
              { value: 9, label: "9×9" },
              { value: 7, label: "7×7" },
              { value: 5, label: "5×5" },
            ]}
          />
        </Field>
        <Field label={`Walls per player: ${walls}`}>
          <input
            type="range"
            min={0}
            max={20}
            value={walls}
            onChange={(e) => setWalls(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
            aria-label="Walls per player"
          />
        </Field>
      </div>
      <Button variant="primary" size="lg" onClick={start}>
        Start game
      </Button>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}
