"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Board, type LastMoveInfo } from "@/components/board/Board";
import { GameLayout } from "./GameLayout";
import { PlayerCard } from "./PlayerCard";
import { MoveHistory, type HistoryEntry } from "./MoveHistory";
import { GameMenu } from "./GameMenu";
import { RulesModal } from "./RulesModal";
import { SettingsModal } from "./SettingsModal";
import { ReplayControls } from "./ReplayControls";
import { GameOverModal } from "./GameOverModal";
import { FirstVisitHint } from "./FirstVisitHint";
import { Clock } from "./Clock";
import { Chat } from "./Chat";
import { Banner, ago } from "./Banner";
import { Button, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Channel } from "@/components/play/GameRoom";
import type { ChatMessage } from "@/lib/realtime/useGameChannel";
import {
  applyMoveUnchecked,
  createInitialState,
  distanceToGoal,
  formatGame,
  validateMove,
  type GameState,
  type Move,
  type Seat,
  type Wall,
} from "@/lib/engine";
import { playerName, type GameRow } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/client";
import { accessToken } from "@/lib/supabase/auth";
import { errorCodeOf, friendlyError, messageFor, type AppErrorCode } from "@/lib/errors";
import { getOffset, serverNow, useServerTimeSync } from "@/lib/clock/serverOffset";
import { remainingMs, useServerNowRaf } from "@/lib/clock/useClock";
import { timeControlLabel } from "@/lib/timeControl";
import { useConfirmMoves, useSetting } from "@/lib/settings";
import { play } from "@/lib/sound";
import { recordResult } from "@/lib/record";

interface Optimistic {
  move: Move;
  state: GameState;
  baseVersion: number;
  frozenMs: number;
}

const BASE_TITLE = "Quoridor";

export function OnlineGame({ channel, userId, mySeat }: { channel: Channel; userId: string; mySeat: Seat | null }) {
  const { game, moves, status, presence, presenceSynced, leftAt, applyRow, resetTo, refetch, send, setHandlers } = channel;
  const toast = useToast();
  const router = useRouter();
  useServerTimeSync();
  const n = game.board_size;
  const timed = game.initial_time_ms > 0;
  const confirm = useConfirmMoves();
  const [showPath] = useSetting("showPath");
  const [ghostOn] = useSetting("thinkingGhost");
  const isPlayer = mySeat !== null;
  const oppSeat: Seat | null = mySeat === null ? null : mySeat === 0 ? 1 : 0;
  const oppId = oppSeat === null ? null : oppSeat === 0 ? game.p0_id : game.p1_id;
  const names: [string, string] = [playerName(game, 0), playerName(game, 1)];

  const [opt, setOpt] = useState<Optimistic | null>(null);
  const optimistic = opt && opt.baseVersion === game.version && game.status === "active" ? opt : null;
  const inFlight = useRef(false);

  const [review, setReview] = useState<number | null>(null);
  const [flipToggle, setFlipToggle] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [overDismissed, setOverDismissed] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [remoteGhost, setRemoteGhost] = useState<{ wall: Wall | null; ply: number } | null>(null);
  const lastChatAt = useRef(0);

  // ---- clocks ----------------------------------------------------------
  const now = useServerNowRaf(game.status === "active");
  const startsAt = game.turn_started_at ? Date.parse(game.turn_started_at) : 0;
  const inCountdown = game.status === "active" && now < startsAt;
  const clockFor = (s: Seat) => (optimistic && s === mySeat ? optimistic.frozenMs : remainingMs(game, s, now));
  const running = (s: Seat) => game.status === "active" && !inCountdown && game.turn === s && !(optimistic && s === mySeat);

  // ---- flag detection --------------------------------------------------
  const moverOut = timed && game.status === "active" && !inCountdown && remainingMs(game, game.turn, now) <= 0;
  const claimedKey = useRef("");
  useEffect(() => {
    if (!moverOut) return;
    const key = `${game.id}:${game.move_count}:${game.turn}`;
    if (claimedKey.current === key) return;
    claimedKey.current = key;
    let cancelled = false;
    (async () => {
      for (const delay of [0, 300, 1000, 2000]) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        const { data } = await getSupabase().rpc("claim_timeout", { p_game_id: game.id });
        if (data) applyRow(data);
        if ((data as GameRow | null)?.status === "finished") return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moverOut, game.id, game.move_count, game.turn, applyRow]);

  // ---- submitting moves ------------------------------------------------
  const submit = useCallback(
    async (move: Move) => {
      if (mySeat === null || inFlight.current) return;
      if (game.status !== "active" || game.turn !== mySeat) return;
      const reason = validateMove(game.state, mySeat, move, n);
      if (reason) {
        play("illegal");
        return toast.error(friendlyError("ILLEGAL_MOVE", reason));
      }
      inFlight.current = true;
      const next = applyMoveUnchecked(game.state, mySeat, move);
      setOpt({ move, state: next, baseVersion: game.version, frozenMs: remainingMs(game, mySeat, serverNow()) });
      play(move.type === "wall" ? "wall" : "move");
      try {
        const token = await accessToken();
        const res = await fetch(`/api/games/${game.id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ move, expectedVersion: game.version }),
        });
        const body = (await res.json().catch(() => ({}))) as { game?: GameRow; error?: AppErrorCode; reason?: string; detail?: string };
        if (res.ok && body.game) {
          applyRow(body.game);
        } else {
          if (body.game) resetTo(body.game);
          else void refetch();
          const code = body.error ?? (res.status >= 500 ? "SERVER_ERROR" : "UNKNOWN");
          const msg = code === "ILLEGAL_MOVE" ? friendlyError(code, body.reason) : messageFor(code);
          toast.error(body.detail ? `${msg} — ${body.detail}` : res.ok ? msg : `${msg} (HTTP ${res.status})`);
          if (body.detail) console.error("Move rejected:", body.detail);
          play("illegal");
        }
      } catch (e) {
        void refetch();
        toast.error(friendlyError(errorCodeOf(e) === "UNKNOWN" ? "NETWORK" : e));
      } finally {
        inFlight.current = false;
        setOpt(null);
      }
    },
    [mySeat, game, n, toast, applyRow, resetTo, refetch],
  );

  // ---- broadcast: chat & ghost -----------------------------------------
  // The ghost is tagged with the ply it arrived on, so it disappears once a move lands.
  const moveCountRef = useRef(game.move_count);
  useEffect(() => {
    moveCountRef.current = game.move_count;
  }, [game.move_count]);
  useEffect(() => {
    setHandlers({
      onChat: (m) => {
        if (typeof m?.text !== "string") return;
        setChat((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs.slice(-99), { ...m, text: m.text.slice(0, 200) }]));
      },
      onGhost: (m) => {
        if (m.from !== userId) setRemoteGhost({ wall: m.wall, ply: moveCountRef.current });
      },
    });
  }, [setHandlers, userId]);

  const lastGhostSent = useRef(0);
  const ghostTimer = useRef<number | null>(null);
  const onHoverWall = useCallback(
    (w: Wall | null) => {
      if (!ghostOn || mySeat === null) return;
      const fire = () => {
        lastGhostSent.current = performance.now();
        send("ghost", { from: userId, wall: w });
      };
      if (ghostTimer.current) window.clearTimeout(ghostTimer.current);
      const wait = 100 - (performance.now() - lastGhostSent.current);
      if (wait <= 0) fire();
      else ghostTimer.current = window.setTimeout(fire, wait);
    },
    [ghostOn, mySeat, send, userId],
  );

  const sendChat = (text: string, kind: "text" | "emote"): boolean => {
    if (!isPlayer) return false;
    const t = performance.now();
    if (t - lastChatAt.current < 1000) {
      toast.show("Slow down — one message per second.");
      return false;
    }
    lastChatAt.current = t;
    const msg: ChatMessage = {
      id: `${userId}-${Math.round(t)}`,
      from: userId,
      name: names[mySeat!],
      text: text.slice(0, 200),
      kind,
      ts: Date.now(),
    };
    send("chat", msg);
    setChat((xs) => [...xs.slice(-99), msg]);
    return true;
  };

  // ---- replay / history ------------------------------------------------
  const replay = useMemo(() => {
    const states: GameState[] = [createInitialState(n, game.walls_per_player)];
    for (const m of moves) states.push(applyMoveUnchecked(states[states.length - 1], m.player, m.move));
    return states;
  }, [moves, n, game.walls_per_player]);

  const history: HistoryEntry[] = useMemo(() => {
    const prev: [number, number] = [game.initial_time_ms, game.initial_time_ms];
    return moves.map((m) => {
      let used: number | null = null;
      if (timed && m.clock_after_ms != null) {
        const winning = m.ply === game.move_count && game.end_reason === "goal";
        used = prev[m.player] + (winning ? 0 : game.increment_ms) - m.clock_after_ms;
        prev[m.player] = m.clock_after_ms;
      }
      return { notation: m.notation, usedMs: used };
    });
  }, [moves, timed, game.initial_time_ms, game.increment_ms, game.move_count, game.end_reason]);

  const historyComplete = moves.length === game.move_count;
  const viewPly = review ?? (optimistic ? game.move_count + 1 : game.move_count);
  const viewState: GameState =
    review !== null ? replay[Math.min(review, replay.length - 1)] : optimistic ? optimistic.state : game.state;

  let lastMove: LastMoveInfo | null = null;
  if (review !== null) {
    if (review > 0 && moves[review - 1]) {
      const m = moves[review - 1];
      lastMove = { move: m.move, seat: m.player, from: replay[review - 1].pawns[m.player] };
    }
  } else if (optimistic && mySeat !== null) {
    lastMove = { move: optimistic.move, seat: mySeat, from: game.state.pawns[mySeat] };
  } else if (game.last_move) {
    const k = game.move_count;
    const m = historyComplete && k > 0 ? moves[k - 1] : null;
    lastMove = m
      ? { move: m.move, seat: m.player, from: replay[k - 1].pawns[m.player] }
      : { move: game.last_move, seat: (1 - game.turn) as Seat };
  }

  // ---- sounds, vibration, title ----------------------------------------
  const lastCount = useRef(game.move_count);
  useEffect(() => {
    if (game.move_count > lastCount.current && game.last_move) {
      const moverSeat = moves[game.move_count - 1]?.player ?? (game.status === "finished" && game.end_reason === "goal" ? game.turn : ((1 - game.turn) as Seat));
      if (moverSeat !== mySeat) {
        play(game.last_move.type === "wall" ? "wall" : "move");
        if (isPlayer) navigator.vibrate?.(30);
      }
    }
    lastCount.current = game.move_count;
  }, [game.move_count, game.last_move, game.status, game.end_reason, game.turn, moves, mySeat, isPlayer]);

  const myTurn = isPlayer && game.status === "active" && game.turn === mySeat;
  useEffect(() => {
    const update = () => {
      if (myTurn && document.hidden) document.title = "● Your move — Quoridor";
      else document.title = BASE_TITLE;
    };
    if (myTurn && document.hidden && game.move_count > 0) play("notify");
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      document.title = BASE_TITLE;
    };
  }, [myTurn, game.move_count]);

  // Countdown ticks and the start beep.
  const countdownSec = inCountdown ? Math.ceil((startsAt - now) / 1000) : 0;
  const prevCountdown = useRef(countdownSec);
  useEffect(() => {
    if (countdownSec !== prevCountdown.current) {
      if (countdownSec > 0) play("tick");
      else if (prevCountdown.current > 0) play("start");
    }
    prevCountdown.current = countdownSec;
  }, [countdownSec]);

  // Low-time warning and ticks for my own clock.
  const mySec = mySeat !== null && running(mySeat) ? Math.ceil(clockFor(mySeat) / 1000) : null;
  const prevSec = useRef<number | null>(null);
  useEffect(() => {
    if (mySec === null || !timed) {
      prevSec.current = mySec;
      return;
    }
    const prev = prevSec.current;
    if (prev !== null && mySec !== prev && mySec <= 10 && mySec > 0) play(prev > 10 ? "lowtime" : "tick");
    prevSec.current = mySec;
  }, [mySec, timed]);

  // Result sound + local record.
  const finished = game.status === "finished";
  useEffect(() => {
    if (!finished) return;
    if (mySeat !== null && game.winner !== null) {
      const won = game.winner === mySeat;
      play(won ? "win" : "lose");
      recordResult("online", won, game.id);
    } else play("win");
  }, [finished, mySeat, game.winner, game.id]);

  // ---- actions ---------------------------------------------------------
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await getSupabase().rpc(fn, args);
    if (error) {
      toast.error(friendlyError(error));
      void refetch();
      return null;
    }
    applyRow(data);
    return data as GameRow;
  };

  const copyNotation = async () => {
    try {
      await navigator.clipboard.writeText(formatGame(moves.map((m) => m.notation)));
      toast.success("Game notation copied");
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };

  // ---- view ------------------------------------------------------------
  const baseFlip = mySeat === 1;
  const flipped = baseFlip !== flipToggle;
  const bottomSeat: Seat = flipped ? 1 : 0;
  const topSeat: Seat = bottomSeat === 0 ? 1 : 0;
  const activeSeat: Seat | null =
    myTurn && !optimistic && !inCountdown && review === null ? mySeat : null;

  const isOnline = (s: Seat) => {
    const id = s === 0 ? game.p0_id : game.p1_id;
    return !!id && presence.some((p) => p.user_id === id);
  };
  const spectators = presence.filter((p) => p.role === "spectator").length;

  const card = (s: Seat) => (
    <PlayerCard
      seat={s}
      name={names[s]}
      wallsLeft={viewState.wallsLeft[s]}
      totalWalls={game.walls_per_player}
      distance={distanceToGoal(viewState, s, n)}
      isTurn={game.status === "active" && game.turn === s && review === null}
      isMe={s === mySeat}
      online={presenceSynced ? isOnline(s) : null}
      clock={timed ? <Clock ms={clockFor(s)} running={running(s)} label={`${names[s]}'s clock`} /> : undefined}
      badge={optimistic && s === mySeat ? <span className="text-xs text-muted">sending…</span> : undefined}
    />
  );

  const reasonText = (() => {
    if (game.status !== "finished" || game.winner === null) return "";
    const w = names[game.winner];
    const l = names[(1 - game.winner) as Seat];
    switch (game.end_reason) {
      case "goal":
        return `${w} reached the goal`;
      case "timeout":
        return `Time out — ${l} ran out of time`;
      case "resign":
        return `${l} resigned`;
      default:
        return "Game abandoned";
    }
  })();
  const headline =
    game.winner === null ? "Game over" : mySeat === null ? `${names[game.winner]} wins` : game.winner === mySeat ? "You win! 🎉" : "You lost";

  const iVoted = game.rematch_votes.includes(userId);
  const oppVoted = !!oppId && game.rematch_votes.includes(oppId);

  const connectionBanner =
    status !== "SUBSCRIBED" && status !== "connecting" ? (
      <Banner tone="warn">
        <span className="h-2 w-2 animate-ping rounded-full bg-black/60" /> Reconnecting…
      </Banner>
    ) : isPlayer && presenceSynced && game.status === "active" && oppSeat !== null && !isOnline(oppSeat) ? (
      <Banner tone="info">
        Opponent disconnected{oppId && leftAt[oppId] ? ` · ${ago(now - getOffset() - leftAt[oppId])}` : ""}
        {timed ? " — their clock keeps running" : ""}
      </Banner>
    ) : null;

  const status_ = (() => {
    if (review !== null) return "Reviewing";
    if (game.status === "finished") return reasonText;
    if (inCountdown) return "Starting…";
    if (mySeat === null) return `${names[game.turn]} to move`;
    return myTurn ? "Your move" : `${names[game.turn]} is thinking…`;
  })();

  return (
    <>
      <GameLayout
        title={
          <span className="flex items-center gap-2">
            <span>{timeControlLabel(game.initial_time_ms, game.increment_ms)}</span>
            <span className="font-normal text-muted">· {status_}</span>
            {spectators > 0 && <span className="font-normal text-muted">· 👁 {spectators}</span>}
          </span>
        }
        banner={connectionBanner}
        menu={
          <GameMenu
            items={[
              { label: "Flip board", onClick: () => setFlipToggle((f) => !f) },
              { label: review === null ? "Review moves" : "Back to live", onClick: () => setReview(review === null ? moves.length : null), hidden: moves.length === 0 },
              { label: "Copy game notation", onClick: copyNotation, hidden: moves.length === 0 },
              { label: "Rules", onClick: () => setRulesOpen(true) },
              { label: "Settings", onClick: () => setSettingsOpen(true) },
              { label: "Resign", onClick: () => setResignOpen(true), danger: true, hidden: !isPlayer || game.status !== "active" },
            ]}
          />
        }
        top={card(topSeat)}
        bottom={card(bottomSeat)}
        board={
          <Board
            n={n}
            state={viewState}
            flipped={flipped}
            activeSeat={activeSeat}
            onMove={isPlayer && review === null ? submit : undefined}
            lastMove={lastMove}
            confirm={confirm}
            showPathFor={showPath && isPlayer && review === null ? mySeat : null}
            remoteGhost={
              review === null && remoteGhost && remoteGhost.ply === game.move_count && game.turn === oppSeat ? remoteGhost.wall : null
            }
            onHoverWall={isPlayer ? onHoverWall : undefined}
            names={names}
          />
        }
        overlay={
          inCountdown ? (
            <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black/40" aria-live="assertive">
              <span key={countdownSec} className="count-pulse text-8xl font-black text-white drop-shadow-lg">
                {countdownSec}
              </span>
            </div>
          ) : null
        }
        side={
          <>
            {isPlayer && <FirstVisitHint onRules={() => setRulesOpen(true)} />}
            {!isPlayer && (
              <div className="flex items-center justify-between rounded-xl bg-card-2 px-3 py-2 text-sm ring-1 ring-border">
                <span>👁 You’re spectating</span>
                <button className="font-semibold text-accent" onClick={() => setFlipToggle((f) => !f)}>
                  Flip board
                </button>
              </div>
            )}
            {review !== null && (
              <ReplayControls ply={review} total={moves.length} onChange={setReview} onExit={() => setReview(null)} onCopy={copyNotation} />
            )}
            {game.status === "finished" && review === null && (
              <div className="grid grid-cols-2 gap-2">
                {isPlayer && !game.rematch_game_id && (
                  <Button variant="primary" onClick={() => void rpc("request_rematch", { p_game_id: game.id })} disabled={iVoted}>
                    {iVoted ? "Waiting…" : oppVoted ? "Accept rematch" : "Rematch"}
                  </Button>
                )}
                <Button onClick={() => setReview(0)}>Review game</Button>
              </div>
            )}
            <MoveHistory entries={history} current={Math.min(viewPly, history.length)} onSelect={(p) => setReview(p)} className="max-h-48 lg:max-h-64" />
            <Chat messages={chat} myId={userId} canSend={isPlayer} onSend={sendChat} />
          </>
        }
      />

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} online />
      <ConfirmDialog
        open={resignOpen}
        title="Resign this game?"
        body="Your opponent will be awarded the win."
        confirmLabel="Resign"
        danger
        onCancel={() => setResignOpen(false)}
        onConfirm={() => {
          setResignOpen(false);
          void rpc("resign_game", { p_game_id: game.id });
        }}
      />
      <GameOverModal
        open={finished && !overDismissed && review === null}
        onClose={() => setOverDismissed(true)}
        winnerSeat={game.winner}
        headline={headline}
        reason={reasonText}
        actions={
          <>
            {isPlayer ? (
              <div className="col-span-2 flex flex-col gap-1">
                <Button variant="primary" disabled={iVoted || !!game.rematch_game_id} onClick={() => void rpc("request_rematch", { p_game_id: game.id })}>
                  {game.rematch_game_id ? "Starting rematch…" : iVoted ? "Waiting for opponent…" : oppVoted ? "Accept rematch" : "Rematch"}
                </Button>
                {oppVoted && !iVoted && <span className="text-center text-xs font-semibold text-accent">Opponent wants a rematch</span>}
              </div>
            ) : null}
            <Button
              onClick={() => {
                setOverDismissed(true);
                setReview(0);
              }}
            >
              Review game
            </Button>
            <Button onClick={() => router.push("/?create=1")}>New game</Button>
            <Button variant="ghost" className="col-span-2" onClick={() => router.push("/")}>
              Home
            </Button>
          </>
        }
      />
    </>
  );
}
