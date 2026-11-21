"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Board, type LastMoveInfo } from "@/components/board/Board";
import { GameLayout } from "./GameLayout";
import { PlayerCard } from "./PlayerCard";
import { MoveHistory } from "./MoveHistory";
import { GameMenu } from "./GameMenu";
import { RulesModal } from "./RulesModal";
import { SettingsModal } from "./SettingsModal";
import { ReplayControls } from "./ReplayControls";
import { GameOverModal } from "./GameOverModal";
import { FirstVisitHint } from "./FirstVisitHint";
import { Button, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useLocalGame } from "@/lib/game/useLocalGame";
import { useBot } from "@/lib/ai/useBot";
import type { BotLevel } from "@/lib/ai/bot";
import { distanceToGoal, formatGame, type Move, type Seat } from "@/lib/engine";
import { useConfirmMoves, useSetting } from "@/lib/settings";
import { play } from "@/lib/sound";
import { recordResult } from "@/lib/record";

export interface LocalGameProps {
  mode: "pass" | "bot";
  n: number;
  walls: number;
  level?: BotLevel;
  humanSeat?: Seat;
}

const LEVEL_NAME: Record<BotLevel, string> = { easy: "Easy bot", medium: "Medium bot", hard: "Hard bot" };

export function LocalGame({ mode, n, walls, level = "medium", humanSeat = 0 }: LocalGameProps) {
  const router = useRouter();
  const toast = useToast();
  const storageKey = mode === "bot" ? `q:local:bot:${level}:${humanSeat}` : "q:local:pass";
  const { game, state, turn, result, notations, move, undo, reset, resign } = useLocalGame(n, walls, storageKey);
  const think = useBot();
  const confirm = useConfirmMoves();
  const [showPath] = useSetting("showPath");

  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [overDismissed, setOverDismissed] = useState(false);
  const [review, setReview] = useState<number | null>(null);
  const [flipToggle, setFlipToggle] = useState(false);
  const [flipEachTurn, setFlipEachTurn] = useState(false);
  const [botThinking, setBotThinking] = useState(false);

  const isBotTurn = mode === "bot" && turn !== humanSeat && !result;
  const names = useMemo<[string, string]>(
    () =>
      mode === "bot"
        ? humanSeat === 0
          ? ["You", LEVEL_NAME[level]]
          : [LEVEL_NAME[level], "You"]
        : ["Player 1", "Player 2"],
    [mode, humanSeat, level],
  );

  // ---- bot --------------------------------------------------------------
  const plyRef = useRef(game.moves.length);
  useEffect(() => {
    plyRef.current = game.moves.length;
  }, [game.moves.length]);

  useEffect(() => {
    if (!isBotTurn) return;
    const ply = game.moves.length;
    let cancelled = false;
    const started = performance.now();
    const t = window.setTimeout(() => {
      setBotThinking(true);
      think(state, turn, n, level).then((m) => {
        if (cancelled || plyRef.current !== ply) return;
        // Keep a tiny delay so the bot doesn't feel instant.
        const wait = Math.max(0, 280 - (performance.now() - started));
        window.setTimeout(() => {
          if (cancelled || plyRef.current !== ply) return;
          setBotThinking(false);
          move(m);
        }, wait);
      });
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      setBotThinking(false);
    };
  }, [isBotTurn, game.moves.length, state, turn, n, level, think, move]);

  // ---- sounds & results --------------------------------------------------
  const lastPly = useRef(game.moves.length);
  useEffect(() => {
    if (game.moves.length > lastPly.current) {
      const m = game.moves[game.moves.length - 1];
      play(m.type === "wall" ? "wall" : "move");
    }
    lastPly.current = game.moves.length;
  }, [game.moves]);

  const resultKey = result ? `${result.winner}:${result.reason}:${game.moves.length}` : "";
  useEffect(() => {
    if (!resultKey || !result) return;
    if (mode === "bot") {
      const won = result.winner === humanSeat;
      play(won ? "win" : "lose");
      recordResult(`bot-${level}`, won, `${storageKey}:${resultKey}:${notations.join("")}`);
    } else play("win");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  const [seenResultKey, setSeenResultKey] = useState(resultKey);
  if (seenResultKey !== resultKey) {
    setSeenResultKey(resultKey);
    setOverDismissed(false);
  }

  // ---- derived view -----------------------------------------------------
  const viewPly = review ?? game.moves.length;
  const viewState = game.states[viewPly];
  const lastMove: LastMoveInfo | null =
    viewPly > 0 ? { move: game.moves[viewPly - 1], seat: ((viewPly - 1) % 2) as Seat, from: game.froms[viewPly - 1] } : null;

  const flipped =
    mode === "bot" ? (humanSeat === 1) !== flipToggle : flipEachTurn ? (turn === 1) !== flipToggle : flipToggle;
  const activeSeat: Seat | null =
    review !== null || result ? null : mode === "pass" ? turn : turn === humanSeat ? humanSeat : null;

  const bottomSeat: Seat = flipped ? 1 : 0;
  const topSeat: Seat = bottomSeat === 0 ? 1 : 0;

  const onMove = useCallback((m: Move) => move(m), [move]);

  const doUndo = () => {
    if (mode === "pass") return undo(1);
    if (botThinking) return;
    if (game.moves.length === 0) return;
    // Take back the bot's reply too, so it's the human's turn again.
    undo(turn === humanSeat ? Math.min(2, game.moves.length) : 1);
  };

  const canUndo = game.moves.length > 0 && !botThinking && review === null;

  const copyNotation = async () => {
    try {
      await navigator.clipboard.writeText(formatGame(notations));
      toast.success("Game notation copied");
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };

  const newGame = () => {
    reset();
    setReview(null);
  };

  const card = (seat: Seat) => (
    <PlayerCard
      seat={seat}
      name={names[seat]}
      wallsLeft={viewState.wallsLeft[seat]}
      totalWalls={walls}
      distance={distanceToGoal(viewState, seat, n)}
      isTurn={!result && review === null && turn === seat}
      isMe={mode === "bot" && seat === humanSeat}
      badge={
        mode === "bot" && seat !== humanSeat && botThinking ? (
          <span className="animate-pulse text-xs text-muted">thinking…</span>
        ) : undefined
      }
    />
  );

  const status = useMemo(() => {
    if (review !== null) return "Reviewing";
    if (result) return `${names[result.winner]} won`;
    if (mode === "bot") return turn === humanSeat ? "Your move" : `${names[turn]} is thinking…`;
    return `${names[turn]} to move`;
  }, [review, result, names, mode, turn, humanSeat]);

  const headline = result
    ? mode === "bot"
      ? result.winner === humanSeat
        ? "You win! 🎉"
        : "You lost"
      : `${names[result.winner]} wins!`
    : "";
  const reasonText = result
    ? result.reason === "goal"
      ? `${names[result.winner]} reached the goal`
      : `${names[(1 - result.winner) as Seat]} resigned`
    : "";

  return (
    <>
      <GameLayout
        title={
          <span className="flex items-center gap-2">
            {mode === "bot" ? `vs Computer · ${level}` : "Pass & play"}
            <span className="font-normal text-muted">· {status}</span>
          </span>
        }
        menu={
          <GameMenu
            items={[
              { label: "Undo", onClick: doUndo, disabled: !canUndo },
              { label: "Flip board", onClick: () => setFlipToggle((f) => !f) },
              {
                label: flipEachTurn ? "Stop flipping each turn" : "Flip each turn",
                onClick: () => setFlipEachTurn((f) => !f),
                hidden: mode !== "pass",
              },
              { label: "Review game", onClick: () => setReview(game.moves.length), hidden: game.moves.length === 0 },
              { label: "Copy game notation", onClick: copyNotation, hidden: game.moves.length === 0 },
              { label: "Rules", onClick: () => setRulesOpen(true) },
              { label: "Settings", onClick: () => setSettingsOpen(true) },
              { label: "New game", onClick: newGame },
              { label: "Resign", onClick: () => setResignOpen(true), danger: true, hidden: !!result },
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
            onMove={review === null ? onMove : undefined}
            lastMove={lastMove}
            confirm={confirm}
            showPathFor={showPath && review === null ? (mode === "bot" ? humanSeat : turn) : null}
            names={names}
          />
        }
        side={
          <>
            <FirstVisitHint onRules={() => setRulesOpen(true)} />
            {review !== null && (
              <ReplayControls
                ply={review}
                total={game.moves.length}
                onChange={setReview}
                onExit={() => setReview(null)}
                onCopy={copyNotation}
              />
            )}
            <div className="flex gap-2">
              <Button onClick={doUndo} disabled={!canUndo} className="flex-1">
                ↶ Undo
              </Button>
              {review === null ? (
                <Button onClick={() => setReview(game.moves.length)} disabled={game.moves.length === 0} className="flex-1">
                  Review
                </Button>
              ) : (
                <Button onClick={() => setReview(null)} className="flex-1">
                  Back to game
                </Button>
              )}
            </div>
            <MoveHistory
              entries={notations.map((x) => ({ notation: x }))}
              current={viewPly}
              onSelect={(p) => setReview(p)}
              className="max-h-64 lg:max-h-[50dvh]"
            />
          </>
        }
      />

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConfirmDialog
        open={resignOpen}
        title="Resign this game?"
        body={mode === "pass" ? `${names[turn]} will resign.` : "The computer will be awarded the win."}
        confirmLabel="Resign"
        danger
        onCancel={() => setResignOpen(false)}
        onConfirm={() => {
          setResignOpen(false);
          resign(mode === "bot" ? humanSeat : turn);
        }}
      />
      <GameOverModal
        open={!!result && !overDismissed && review === null}
        onClose={() => setOverDismissed(true)}
        winnerSeat={result?.winner ?? null}
        headline={headline}
        reason={reasonText}
        actions={
          <>
            <Button variant="primary" onClick={newGame}>
              {mode === "bot" ? "Play again" : "Rematch"}
            </Button>
            <Button
              onClick={() => {
                setOverDismissed(true);
                setReview(0);
              }}
            >
              Review game
            </Button>
            <Button onClick={() => router.push("/local")}>New game</Button>
            <Button variant="ghost" onClick={() => router.push("/")}>
              Home
            </Button>
          </>
        }
      />
    </>
  );
}
