"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CreateGameDialog } from "./CreateGameDialog";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth";
import { normalizeRow } from "@/lib/realtime/useGameChannel";
import { seatOf, playerName, type GameRow } from "@/lib/types";
import { timeControlLabel } from "@/lib/timeControl";

export function OnlineSection() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(params.get("create") === "1");
  const [code, setCode] = useState("");

  const join = () => {
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length !== 6) return toast.error("Invite codes are 6 characters, like K7QXPM.");
    router.push(`/play/${c}`);
  };

  if (!supabaseConfigured()) {
    return (
      <div className="rounded-2xl bg-card p-4 text-sm text-muted ring-1 ring-border">
        Online play needs Supabase. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
        <code>.env.local</code> and restart the dev server.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" size="lg" className="w-full py-5 text-lg" onClick={() => setCreateOpen(true)}>
        Create game
      </Button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="Enter code"
          aria-label="Invite code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl bg-card px-4 py-3 text-center font-mono text-lg font-bold uppercase tracking-[0.3em] ring-1 ring-border outline-none focus:ring-2 focus:ring-accent"
        />
        <Button type="submit" size="lg">
          Join
        </Button>
      </form>
      <RecentGames />
      <CreateGameDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function RecentGames() {
  const auth = useAuth();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const uid = auth.status === "ready" ? auth.userId : null;

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void getSupabase()
      .from("games")
      .select("*")
      .or(`p0_id.eq.${uid},p1_id.eq.${uid}`)
      .neq("status", "abandoned")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (alive) setGames((data ?? []).map(normalizeRow));
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  if (auth.status === "error") return <p className="text-center text-xs text-danger">{auth.message}</p>;
  if (!games || games.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 mt-2 text-sm font-semibold text-muted">Recent games</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border">
        {games.map((g) => {
          const me = seatOf(g, uid);
          const opp = me === null ? null : me === 0 ? 1 : 0;
          const oppName = opp === null ? "?" : (opp === 0 ? g.p0_name : g.p1_name) ?? "Waiting…";
          const result =
            g.status === "finished"
              ? g.winner === me
                ? { t: "Won", c: "text-accent" }
                : { t: "Lost", c: "text-danger" }
              : g.status === "active"
                ? { t: "In progress", c: "text-warn" }
                : { t: "Lobby", c: "text-muted" };
          return (
            <li key={g.id}>
              <Link href={`/play/${g.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    vs {oppName}
                    {me !== null && <span className="font-normal text-muted"> · as {playerName(g, me)}</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {timeControlLabel(g.initial_time_ms, g.increment_ms)} · {g.board_size}×{g.board_size} ·{" "}
                    {new Date(g.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className={`text-xs font-bold ${result.c}`}>{result.t}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
