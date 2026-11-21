"use client";

import { Modal } from "@/components/ui/Modal";
import { Pawn } from "@/components/board/Board";
import { S, boardSize, cellCenter, cellX, cellY, wallRect } from "@/components/board/geometry";
import type { Cell, Seat, Wall } from "@/lib/engine";

function Diagram({
  n,
  pawns,
  walls = [],
  dots = [],
  bad = [],
  caption,
}: {
  n: number;
  pawns: { seat: Seat; at: Cell }[];
  walls?: Wall[];
  dots?: Cell[];
  bad?: Wall[];
  caption: string;
}) {
  const B = boardSize(n);
  return (
    <figure className="flex flex-col items-center gap-1.5">
      <svg viewBox={`0 0 ${B} ${B}`} className="w-28 sm:w-32" aria-hidden>
        <rect width={B} height={B} rx={2} fill="var(--board-groove)" />
        {Array.from({ length: n * n }, (_, k) => (
          <rect key={k} x={cellX(k % n)} y={cellY(Math.floor(k / n))} width={S} height={S} rx={1.1} fill="var(--board-cell)" />
        ))}
        {dots.map((d, i) => (
          <circle key={i} cx={cellCenter(d).x} cy={cellCenter(d).y} r={1.8} fill="var(--board-hl)" />
        ))}
        {walls.map((w, i) => {
          const r = wallRect(w);
          return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={0.9} fill="var(--board-wall)" stroke="var(--board-wall-edge)" strokeWidth={0.3} />;
        })}
        {bad.map((w, i) => {
          const r = wallRect(w);
          return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={0.9} fill="var(--danger)" opacity={0.85} />;
        })}
        {pawns.map((p) => (
          <g key={p.seat} transform={`translate(${cellCenter(p.at).x} ${cellCenter(p.at).y})`}>
            <Pawn seat={p.seat} active={false} />
          </g>
        ))}
      </svg>
      <figcaption className="max-w-36 text-center text-xs text-muted">{caption}</figcaption>
    </figure>
  );
}

export function RulesContent() {
  return (
    <div className="space-y-5 text-sm leading-relaxed">
      <section>
        <h3 className="mb-1 font-semibold">Goal</h3>
        <p>
          Be the first to move your pawn to the <b>opposite side</b> of the board. The colored edge on the board marks each
          player’s goal. The first player starts at the bottom and moves first.
        </p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">Your turn</h3>
        <p>
          Either <b>move your pawn</b> one square (up, down, left or right) or <b>place a wall</b>. Walls are two squares long
          and block movement for both players. You can’t move through walls.
        </p>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Jumping</h3>
        <div className="flex flex-wrap justify-center gap-4">
          <Diagram
            n={3}
            pawns={[
              { seat: 0, at: { r: 2, c: 1 } },
              { seat: 1, at: { r: 1, c: 1 } },
            ]}
            dots={[{ r: 0, c: 1 }, { r: 2, c: 0 }, { r: 2, c: 2 }]}
            caption="Face to face: jump straight over."
          />
          <Diagram
            n={3}
            pawns={[
              { seat: 0, at: { r: 2, c: 1 } },
              { seat: 1, at: { r: 1, c: 1 } },
            ]}
            walls={[{ r: 0, c: 1, o: "h" }]}
            dots={[{ r: 1, c: 0 }, { r: 1, c: 2 }, { r: 2, c: 0 }, { r: 2, c: 2 }]}
            caption="Wall or edge behind them: step diagonally."
          />
          <Diagram
            n={3}
            pawns={[
              { seat: 0, at: { r: 2, c: 1 } },
              { seat: 1, at: { r: 1, c: 1 } },
            ]}
            walls={[{ r: 0, c: 1, o: "h" }, { r: 0, c: 0, o: "v" }]}
            dots={[{ r: 1, c: 2 }, { r: 2, c: 0 }, { r: 2, c: 2 }]}
            caption="A wall can block a diagonal too."
          />
        </div>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Walls</h3>
        <p className="mb-2">
          Walls can’t overlap or cross another wall, and you can never completely cut a player off from their goal — there must
          always be a path for <b>both</b> players.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Diagram
            n={4}
            pawns={[
              { seat: 0, at: { r: 3, c: 1 } },
              { seat: 1, at: { r: 0, c: 2 } },
            ]}
            walls={[{ r: 1, c: 1, o: "h" }]}
            bad={[{ r: 1, c: 1, o: "v" }]}
            caption="Crossing an existing wall: not allowed."
          />
          <Diagram
            n={4}
            pawns={[
              { seat: 0, at: { r: 3, c: 1 } },
              { seat: 1, at: { r: 0, c: 2 } },
            ]}
            walls={[{ r: 1, c: 0, o: "h" }]}
            bad={[{ r: 1, c: 1, o: "h" }]}
            caption="Overlapping walls: not allowed."
          />
        </div>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">Controls</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Mouse:</b> click a highlighted square or drag your pawn. Hover a groove to preview a wall; right‑click, scroll or
            press <kbd>R</kbd> to rotate; click to place.
          </li>
          <li>
            <b>Touch:</b> tap a groove to preview a wall, then tap it again (or ✓) to place it. Use ⟳ to rotate.
          </li>
          <li>
            <b>Keyboard:</b> arrows / WASD move your pawn, <kbd>Space</kbd> toggles wall mode, arrows move the wall,{" "}
            <kbd>R</kbd> rotates, <kbd>Enter</kbd> confirms, <kbd>Esc</kbd> cancels.
          </li>
        </ul>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">Notation</h3>
        <p>
          Columns are <b>a, b, c…</b> from left to right and rows are <b>1…n</b> from bottom to top (from the first player’s
          side). A pawn move is written as its destination square, e.g. <code className="font-mono">e2</code>. A wall is written
          as the top‑left square of the 2×2 block around its center, plus <code className="font-mono">h</code> (horizontal) or{" "}
          <code className="font-mono">v</code> (vertical), e.g. <code className="font-mono">c6h</code>.
        </p>
      </section>
    </div>
  );
}

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to play Quoridor" wide>
      <RulesContent />
    </Modal>
  );
}
