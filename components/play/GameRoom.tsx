"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGameChannel } from "@/lib/realtime/useGameChannel";
import { getSupabase } from "@/lib/supabase/client";
import { seatOf, playerName } from "@/lib/types";
import type { GameRow } from "@/lib/types";
import { readSetting } from "@/lib/settings";
import { Lobby } from "@/components/lobby/Lobby";
import { OnlineGame } from "@/components/game/OnlineGame";
import { Center } from "./PlayClient";

export type Channel = ReturnType<typeof useGameChannel>;

export function GameRoom({ initial, userId, onRejoin }: { initial: GameRow; userId: string; onRejoin: () => void }) {
  const router = useRouter();
  const seat0 = seatOf(initial, userId);
  const myName = seat0 !== null ? playerName(initial, seat0) : readSetting("name") || "Spectator";
  const channel = useGameChannel({ initial, userId, name: myName, role: seat0 !== null ? "player" : "spectator" });
  const { game } = channel;
  const mySeat = seatOf(game, userId);

  // Rematch: when the old row gets a rematch_game_id, everyone moves to the new game.
  const navigated = useRef(false);
  useEffect(() => {
    if (!game.rematch_game_id || navigated.current) return;
    navigated.current = true;
    void getSupabase()
      .from("games")
      .select("code")
      .eq("id", game.rematch_game_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.code) router.push(`/play/${data.code}`);
        else navigated.current = false;
      });
  }, [game.rematch_game_id, router]);

  if (game.status === "abandoned")
    return <Center title="Lobby closed">The host cancelled this game.</Center>;
  if (game.status === "waiting") return <Lobby channel={channel} userId={userId} mySeat={mySeat} onRejoin={onRejoin} />;
  return <OnlineGame channel={channel} userId={userId} mySeat={mySeat} />;
}
