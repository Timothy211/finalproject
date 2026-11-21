"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type { GameMoveRow, GameRow } from "@/lib/types";
import type { Wall } from "@/lib/engine";

export type ChannelStatus = "connecting" | "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR" | "TIMED_OUT";

export interface PresenceMeta {
  user_id: string;
  name: string;
  role: "player" | "spectator";
  online_at: number;
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  kind: "text" | "emote";
  ts: number;
}

export interface GhostMessage {
  from: string;
  wall: Wall | null;
}

interface Handlers {
  onChat?: (m: ChatMessage) => void;
  onGhost?: (m: GhostMessage) => void;
}

/** Normalises a row from Realtime/PostgREST (arrays/json may arrive as strings in edge cases). */
export function normalizeRow(raw: unknown): GameRow {
  const r = { ...(raw as Record<string, unknown>) } as Record<string, unknown>;
  const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  r.state = json(r.state);
  r.last_move = r.last_move == null ? null : json(r.last_move);
  if (typeof r.clock_ms === "string") r.clock_ms = (r.clock_ms as string).replace(/[{}]/g, "").split(",").map(Number);
  if (typeof r.rematch_votes === "string")
    r.rematch_votes = (r.rematch_votes as string).replace(/[{}]/g, "").split(",").filter(Boolean);
  r.rematch_votes = r.rematch_votes ?? [];
  return r as unknown as GameRow;
}

export function useGameChannel({
  initial,
  userId,
  name,
  role,
}: {
  initial: GameRow;
  userId: string;
  name: string;
  role: "player" | "spectator";
}) {
  const gameId = initial.id;
  const [game, setGame] = useState<GameRow>(initial);
  const versionRef = useRef(initial.version);
  const [moves, setMoves] = useState<GameMoveRow[]>([]);
  const movesRef = useRef<GameMoveRow[]>([]);
  const [status, setStatus] = useState<ChannelStatus>("connecting");
  const [presence, setPresence] = useState<PresenceMeta[]>([]);
  const [presenceSynced, setPresenceSynced] = useState(false);
  /** user_id → epoch ms when they dropped off presence */
  const [leftAt, setLeftAt] = useState<Record<string, number>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlers = useRef<Handlers>({});
  const fetchingMoves = useRef(false);

  /** Accept a row only if it is newer than what we have. Returns true when applied. */
  const applyRow = useCallback((raw: unknown): boolean => {
    if (!raw) return false;
    const row = normalizeRow(raw);
    if (row.id !== gameId) return false;
    if (row.version <= versionRef.current) return false;
    versionRef.current = row.version;
    setGame(row);
    return true;
  }, [gameId]);

  /** Force-set (used for rollback to the authoritative row even if equal version). */
  const resetTo = useCallback((raw: unknown) => {
    if (!raw) return;
    const row = normalizeRow(raw);
    if (row.version < versionRef.current) return;
    versionRef.current = row.version;
    setGame(row);
  }, []);

  const refetch = useCallback(async () => {
    const { data } = await getSupabase().from("games").select("*").eq("id", gameId).maybeSingle();
    if (data) applyRow(data);
  }, [gameId, applyRow]);

  const fetchMoves = useCallback(async () => {
    if (fetchingMoves.current) return;
    fetchingMoves.current = true;
    try {
      const have = movesRef.current.length;
      const { data } = await getSupabase()
        .from("game_moves")
        .select("*")
        .eq("game_id", gameId)
        .gt("ply", have)
        .order("ply", { ascending: true });
      if (data && data.length) {
        const merged = [...movesRef.current];
        for (const m of data as GameMoveRow[]) {
          if (typeof m.move === "string") m.move = JSON.parse(m.move);
          if (m.ply === merged.length + 1) merged.push(m);
        }
        movesRef.current = merged;
        setMoves(merged);
      }
    } finally {
      fetchingMoves.current = false;
    }
  }, [gameId]);

  // Fetch any missing history whenever move_count gets ahead.
  useEffect(() => {
    if (game.move_count > movesRef.current.length) void fetchMoves();
  }, [game.move_count, fetchMoves]);

  // Subscription, presence, broadcast.
  useEffect(() => {
    const sb = getSupabase();
    const ch = sb.channel(`game:${gameId}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });
    channelRef.current = ch;

    ch.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      (payload) => applyRow(payload.new),
    );
    let prevOnline = new Set<string>();
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<PresenceMeta>();
      const list: PresenceMeta[] = [];
      for (const k of Object.keys(st)) {
        const metas = st[k];
        if (metas.length) list.push(metas[0]);
      }
      const nowOnline = new Set(list.map((p) => p.user_id));
      const t = Date.now();
      setLeftAt((prev) => {
        const next = { ...prev };
        for (const id of prevOnline) if (!nowOnline.has(id)) next[id] = t;
        for (const id of nowOnline) delete next[id];
        return next;
      });
      prevOnline = nowOnline;
      setPresence(list);
      setPresenceSynced(true);
    });
    ch.on("broadcast", { event: "chat" }, ({ payload }) => handlers.current.onChat?.(payload as ChatMessage));
    ch.on("broadcast", { event: "ghost" }, ({ payload }) => handlers.current.onGhost?.(payload as GhostMessage));

    ch.subscribe((st) => {
      setStatus(st as ChannelStatus);
      if (st === "SUBSCRIBED") {
        void refetch();
        void ch.track({ user_id: userId, name, role, online_at: Date.now() } satisfies PresenceMeta);
      }
    });

    return () => {
      channelRef.current = null;
      void sb.removeChannel(ch);
    };
    // name/role changes re-track below instead of resubscribing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, userId, applyRow, refetch]);

  // Update presence metadata if name/role change.
  useEffect(() => {
    const ch = channelRef.current;
    if (ch && status === "SUBSCRIBED") void ch.track({ user_id: userId, name, role, online_at: Date.now() });
  }, [name, role, status, userId]);

  // Refetch when the tab becomes visible again.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    const onOnline = () => void refetch();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [refetch]);

  // Slow fallback poll while the channel isn't healthy.
  useEffect(() => {
    if (status === "SUBSCRIBED") return;
    const id = window.setInterval(() => void refetch(), 10_000);
    return () => window.clearInterval(id);
  }, [status, refetch]);

  const send = useCallback((event: "chat" | "ghost", payload: ChatMessage | GhostMessage) => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({ type: "broadcast", event, payload });
  }, []);

  const setHandlers = useCallback((h: Handlers) => {
    handlers.current = h;
  }, []);

  return { game, moves, status, presence, presenceSynced, leftAt, applyRow, resetTo, refetch, send, setHandlers };
}
