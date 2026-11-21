import type { Metadata } from "next";
import Link from "next/link";
import { RulesContent } from "@/components/game/RulesModal";

export const metadata: Metadata = { title: "How to play" };

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/" className="rounded-lg p-2 text-muted hover:bg-card-2 hover:text-fg" aria-label="Home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold">How to play Quoridor</h1>
      </header>
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
        <RulesContent />
      </div>
    </main>
  );
}
