"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { normalizeRow } from "@/lib/realtime/useGameChannel";
import { seatOf, hostName, type GameRow } from "@/lib/types";
import { errorCodeOf, friendlyError } from "@/lib/errors";
import { useSetting } from "@/lib/settings";
import { timeControlLabel } from "@/lib/timeControl";
import { Button } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { GameRoom } from "./GameRoom";
import { NameInput } from "./NameInput";

type Phase =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "join"; game: GameRow }
  | { kind: "room"; game: GameRow }
  | { kind: "error"; message: string };

export function PlayClient({ code }: { code: string }) {
  const auth = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const userId = auth.status === "ready" ? auth.userId : null;

  const fetchPhase = useCallback(
    async (uid: string): Promise<Phase> => {
      const { data, error } = await getSupabase().from("games").select("*").eq("code", code).maybeSingle();
      if (error) return { kind: "error", message: friendlyError(error) };
      if (!data) return { kind: "notfound" };
      const g = normalizeRow(data);
      const seated = seatOf(g, uid) !== null;
      const free = g.p0_id === null || g.p1_id === null;
      return !seated && g.status === "waiting" && free ? { kind: "join", game: g } : { kind: "room", game: g };
    },
    [code],
  );
  const load = useCallback((uid: string) => fetchPhase(uid).then(setPhase), [fetchPhase]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchPhase(userId).then((p) => alive && setPhase(p));
    return () => {
      alive = false;
    };
  }, [userId, fetchPhase]);

  if (auth.status === "unconfigured") return <Center title="Online play isn't set up">Add the Supabase env vars to <code>.env.local</code> (see README).</Center>;
  if (auth.status === "error") return <Center title="Couldn't connect">{auth.message}</Center>;
  if (phase.kind === "error") return <Center title="Something went wrong">{phase.message}</Center>;
  if (phase.kind === "notfound")
    return (
      <Center title="Game not found">
        There’s no game with code <b className="font-mono">{code}</b>. Check the link and try again.
      </Center>
    );
  if (!userId || phase.kind === "loading") return <Center title="Connecting…" spinner />;
  if (phase.kind === "join")
    return <JoinScreen game={phase.game} onJoined={(g) => setPhase({ kind: "room", game: g })} onSpectate={() => setPhase({ kind: "room", game: phase.game })} />;
  return <GameRoom initial={phase.game} userId={userId} onRejoin={() => void load(userId)} />;
}

function JoinScreen({ game, onJoined, onSpectate }: { game: GameRow; onJoined: (g: GameRow) => void; onSpectate: () => void }) {
  const [saved, setSaved] = useSetting("name");
  const [name, setName] = useState(saved);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const join = async () => {
    const nm = name.trim();
    if (!nm) return toast.error(friendlyError("NAME_REQUIRED"));
    setBusy(true);
    setSaved(nm);
    const { data, error } = await getSupabase().rpc("join_game", { p_code: game.code, p_name: nm });
    setBusy(false);
    if (error) {
      const code = errorCodeOf(error);
      toast.error(friendlyError(error));
      if (code === "GAME_FULL" || code === "GAME_ALREADY_STARTED") onSpectate();
      return;
    }
    onJoined(normalizeRow(data));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div className="text-center">
        <p className="text-sm text-muted">You’re invited!</p>
        <h1 className="mt-1 text-2xl font-bold">{hostName(game)} wants to play Quoridor</h1>
        <p className="mt-2 text-sm text-muted">
          {game.board_size}×{game.board_size} · {game.walls_per_player} walls · {timeControlLabel(game.initial_time_ms, game.increment_ms)}
        </p>
      </div>
      <form
        className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <NameInput value={name} onChange={setName} autoFocus />
        <Button variant="primary" size="lg" className="w-full" disabled={busy} type="submit">
          {busy ? "Joining…" : "Join game"}
        </Button>
      </form>
      <button onClick={onSpectate} className="text-sm text-muted underline-offset-2 hover:underline">
        Just watch
      </button>
    </main>
  );
}

export function Center({ title, children, spinner }: { title: string; children?: React.ReactNode; spinner?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      {spinner && <span className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-accent" aria-hidden />}
      <h1 className="text-xl font-bold">{title}</h1>
      {children && <div className="text-sm text-muted">{children}</div>}
      {!spinner && (
        <Link href="/" className="mt-2 text-sm font-semibold text-accent hover:underline">
          Go home
        </Link>
      )}
    </main>
  );
}
