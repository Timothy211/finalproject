"use client";

import Link from "next/link";

/**
 * Responsive game shell. Mobile portrait: top card, board, bottom card, then side content.
 * Desktop: board on the left, side column on the right.
 */
export function GameLayout({
  title,
  menu,
  banner,
  top,
  bottom,
  board,
  side,
  overlay,
}: {
  title: React.ReactNode;
  menu?: React.ReactNode;
  banner?: React.ReactNode;
  top: React.ReactNode;
  bottom: React.ReactNode;
  board: React.ReactNode;
  side?: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-2 pb-4 sm:px-4">
      <header className="flex items-center gap-2 py-2">
        <Link href="/" className="rounded-lg p-2 text-muted hover:bg-card-2 hover:text-fg" aria-label="Home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</div>
        {menu}
      </header>
      {banner}
      <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
        <div className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-13rem))] flex-col gap-2 lg:mx-0 lg:max-w-[min(100%,calc(100dvh-9rem))] lg:flex-[1_1_auto]">
          {top}
          <div className="relative">
            {board}
            {overlay}
          </div>
          {bottom}
        </div>
        {side && <aside className="flex w-full flex-col gap-3 lg:w-80 lg:shrink-0">{side}</aside>}
      </div>
    </div>
  );
}
