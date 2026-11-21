import type { Metadata } from "next";
import { PlayClient } from "@/components/play/PlayClient";
import { loadInvite } from "@/lib/game/metadata";

export const dynamic = "force-dynamic";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params;
  const info = await loadInvite(code);
  if (!info) return { title: "Join a game", description: "Play Quoridor online in real time." };
  const title =
    info.status === "waiting"
      ? `${info.host} invited you to play Quoridor · ${info.timeControl}`
      : `Quoridor · ${info.p0 ?? "?"} vs ${info.p1 ?? "?"} · ${info.timeControl}`;
  const description =
    info.status === "waiting"
      ? `Tap to join a ${info.boardSize}×${info.boardSize} game. No sign-up needed.`
      : "Watch the game live.";
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", siteName: "Quoridor" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PlayPage({ params }: { params: Params }) {
  const { code } = await params;
  return <PlayClient key={code.toUpperCase()} code={code.toUpperCase()} />;
}
