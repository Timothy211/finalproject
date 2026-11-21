import Link from "next/link";
import { Suspense } from "react";
import { HomeClient } from "@/components/home/HomeClient";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <Logo />
        <h1 className="text-4xl font-black tracking-tight">Quoridor</h1>
        <p className="text-muted">Race to the other side. Wall your friend in. Real‑time, on any device.</p>
      </header>
      <Suspense fallback={null}>
        <HomeClient />
      </Suspense>
      <footer className="mt-auto pt-6 text-center text-xs text-muted">
        <Link href="/rules" className="underline-offset-2 hover:underline">
          How to play
        </Link>
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--board-groove)" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={6 + c * 18} y={6 + r * 18} width={16} height={16} rx={3} fill="var(--board-cell)" />),
      )}
      <rect x={4} y={22.5} width={34} height={3} rx={1.5} fill="var(--board-wall)" />
      <circle cx={32} cy={50} r={5.5} fill="var(--p0)" stroke="white" strokeWidth={1.2} />
      <rect x={27} y={9} width={10} height={10} rx={2.5} fill="var(--p1)" stroke="white" strokeWidth={1.2} />
    </svg>
  );
}
