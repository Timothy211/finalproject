import type { Metadata } from "next";
import { LocalGame } from "@/components/game/LocalGame";
import { LocalSetup } from "@/components/game/LocalSetup";
import { defaultWalls } from "@/lib/engine";
import type { BotLevel } from "@/lib/ai/bot";

export const metadata: Metadata = { title: "Play locally" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function LocalPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const mode = one("mode");
  const nRaw = Number(one("n") ?? 9);
  const n = nRaw === 5 || nRaw === 7 ? nRaw : 9;
  const wRaw = Number(one("walls") ?? defaultWalls(n));
  const walls = Number.isInteger(wRaw) && wRaw >= 0 && wRaw <= 20 ? wRaw : defaultWalls(n);
  const levelRaw = one("level");
  const level: BotLevel = levelRaw === "easy" || levelRaw === "hard" ? levelRaw : "medium";
  const humanSeat = one("side") === "1" ? 1 : 0;

  if (mode !== "pass" && mode !== "bot") return <LocalSetup initialMode={one("setup") === "bot" ? "bot" : "pass"} />;
  return (
    <LocalGame
      key={`${mode}-${n}-${walls}-${level}-${humanSeat}`}
      mode={mode}
      n={n}
      walls={walls}
      level={level}
      humanSeat={humanSeat}
    />
  );
}
