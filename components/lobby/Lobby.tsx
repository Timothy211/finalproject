"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { playerName, type GameRow } from "@/lib/types";
import { timeControlLabel } from "@/lib/timeControl";
import type { Seat } from "@/lib/engine";
import { PawnIcon } from "@/components/board/Board";
import { Button, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Channel } from "@/components/play/GameRoom";
import { unlockAudio } from "@/lib/sound";

export function Lobby({
  channel,
  userId,
  mySeat,
  onRejoin,
}: {
  channel: Channel;
  userId: string;
  mySeat: Seat | null;
  onRejoin: () => void;
}) {
  const { game, presence, applyRow } = channel;
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const isHost = game.host_id === userId;
  const url = typeof window !== "undefined" ? `${window.location.origin}/play/${game.code}` : `/play/${game.code}`;
  const online = (id: string | null) => !!id && presence.some((p) => p.user_id === id);
  const spectators = presence.filter((p) => p.role === "spectator").length;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const hasFreeSeat = game.p0_id === null || game.p1_id === null;

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    setBusy(true);
    const { data, error } = await getSupabase().rpc(fn, args);
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
      void channel.refetch();
      return null;
    }
    applyRow(data);
    return data as GameRow;
  };

  const myReady = mySeat === 0 ? game.p0_ready : mySeat === 1 ? game.p1_ready : false;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — long-press the link to copy it.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: "Play Quoridor with me",
        text: `Join my Quoridor game (${timeControlLabel(game.initial_time_ms, game.increment_ms)})`,
        url,
      });
    } catch {
      /* user cancelled */
    }
  };

  const leave = async () => {
    setConfirmLeave(false);
    const res = await rpc("leave_game", { p_game_id: game.id });
    if (res && !isHost) router.push("/");
  };

  const seatCard = (seat: Seat) => {
    const id = seat === 0 ? game.p0_id : game.p1_id;
    const ready = seat === 0 ? game.p0_ready : game.p1_ready;
    return (
      <div className={`flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ${ready ? "ring-2 ring-accent" : "ring-border"}`}>
        <div className="relative">
          <PawnIcon seat={seat} size={32} />
          {id && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card ${online(id) ? "bg-green-500" : "bg-gray-400"}`}
              aria-label={online(id) ? "Online" : "Offline"}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {id ? playerName(game, seat) : <span className="text-muted">Waiting for opponent…</span>}
            {id === userId && <span className="ml-2 rounded bg-card-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">You</span>}
          </div>
          <div className="text-xs text-muted">{seat === 0 ? "Moves first · starts at the bottom" : "Moves second · starts at the top"}</div>
        </div>
        {id && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ready ? "bg-accent text-accent-fg" : "bg-card-2 text-muted"}`}>
            {ready ? "Ready" : "Not ready"}
          </span>
        )}
      </div>
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-5">
      <header className="flex items-center gap-2">
        <Link href="/" className="rounded-lg p-2 text-muted hover:bg-card-2 hover:text-fg" aria-label="Home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="flex-1 text-lg font-bold">Game lobby</h1>
        {spectators > 0 && <span className="text-xs text-muted">👁 {spectators} watching</span>}
      </header>

      <section className="rounded-2xl bg-card p-4 text-center ring-1 ring-border">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Invite code</div>
        <div className="mt-1 select-all font-mono text-4xl font-black tracking-[0.25em]">{game.code}</div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={copy}>
            {copied ? "✓ Copied!" : "Copy link"}
          </Button>
          {canShare && <Button onClick={share}>Share…</Button>}
        </div>
        <div className="mt-4 flex flex-col items-center gap-1">
          <div className="rounded-xl bg-white p-2">
            <QRCodeSVG value={url} size={136} level="M" />
          </div>
          <span className="text-xs text-muted">Scan to join on another device</span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        {seatCard(0)}
        {seatCard(1)}
      </section>

      <section className="rounded-2xl bg-card-2 px-4 py-3 text-sm ring-1 ring-border">
        <span className="font-semibold">{timeControlLabel(game.initial_time_ms, game.increment_ms)}</span>
        <span className="text-muted">
          {" "}
          · {game.board_size}×{game.board_size} board · {game.walls_per_player} walls each
        </span>
      </section>

      {mySeat !== null ? (
        <div className="flex flex-col gap-2">
          <Button
            variant={myReady ? "secondary" : "primary"}
            size="lg"
            disabled={busy}
            onClick={() => {
              unlockAudio();
              void rpc("set_ready", { p_game_id: game.id, p_ready: !myReady });
            }}
            aria-pressed={myReady}
          >
            {myReady ? "✓ Ready — tap to cancel" : "I'm ready"}
          </Button>
          <p className="text-center text-xs text-muted">
            {hasFreeSeat ? "Send the link to a friend. The game starts when you're both ready." : "The game starts with a 3‑second countdown when both players are ready."}
          </p>
          <Button variant="ghost" onClick={() => setConfirmLeave(true)} disabled={busy}>
            {isHost ? "Cancel game" : "Leave lobby"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-sm text-muted">
          <p>You’re watching this lobby.</p>
          {hasFreeSeat && (
            <Button variant="primary" onClick={onRejoin}>
              Take the free seat
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title={isHost ? "Cancel this game?" : "Leave the lobby?"}
        body={isHost ? "The invite link will stop working." : "You can rejoin with the link while the seat is free."}
        confirmLabel={isHost ? "Cancel game" : "Leave"}
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={leave}
      />
    </main>
  );
}
