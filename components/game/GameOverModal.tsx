"use client";

import { Button, Modal } from "@/components/ui/Modal";
import { PawnIcon } from "@/components/board/Board";
import type { Seat } from "@/lib/engine";

export function GameOverModal({
  open,
  onClose,
  winnerSeat,
  headline,
  reason,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  winnerSeat: Seat | null;
  headline: string;
  reason: string;
  actions: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        {winnerSeat !== null && <PawnIcon seat={winnerSeat} size={56} />}
        <h2 className="text-2xl font-bold">{headline}</h2>
        <p className="text-muted">{reason}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">{actions}</div>
    </Modal>
  );
}

export { Button };
