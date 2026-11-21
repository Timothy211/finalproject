# Quoridor Online

Real‑time, timed, invite‑link Quoridor. Create a match, share the link (or QR code), and play on another device. Also includes a computer opponent (3 levels) and pass‑and‑play.

**Stack:** Next.js (App Router) · TypeScript (strict) · Tailwind CSS · Supabase (Postgres, anonymous auth, Realtime) · Vitest · Netlify.

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   ⚠️ The script is re‑runnable but drops and recreates the game tables.
3. **Authentication → Sign In / Providers** → enable **Allow anonymous sign‑ins**.
4. **Database → Publications → `supabase_realtime`** → make sure the `games` table is enabled (the script does this).
5. **Project Settings → API Keys** → copy the **Project URL**, the **publishable** key and the **secret** key
   (or the legacy `anon` and `service_role` keys).
6. *(Optional)* nightly cleanup: enable the `pg_cron` extension and run the `cron.schedule(...)` line at the bottom of `schema.sql`.

## 2. Local development

```bash
cp .env.example .env.local     # then fill in the three values
npm i
npm run dev                    # http://localhost:3000
```

| Variable | Where it's used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser (reads + lobby RPCs) |
| `SUPABASE_SECRET_KEY` | **server only** — the move API route and link previews. Imported only from `lib/supabase/server.ts` (guarded by `server-only`). |

Other scripts: `npm run lint`, `npm run test`, `npm run build`.

## 3. Deploy to Netlify

1. Push the repo to GitHub/GitLab.
2. Netlify → **Add new site → Import an existing project** → pick the repo. The Next.js runtime is detected automatically; `netlify.toml` sets the build command, publish dir and Node version.
3. **Site configuration → Environment variables** → add the three variables above.
4. Deploy. Invite links look like `https://your-site.netlify.app/play/K7QXPM`.

## 4. Testing multiplayer locally

- Open `http://localhost:3000` in a normal window **and** an incognito/private window (each gets its own anonymous user). Create in one, paste the link in the other.
- Phone on the same Wi‑Fi: run `npm run dev -- -H 0.0.0.0`, find your computer's LAN IP (`ipconfig` / `ifconfig`) and open `http://<LAN-IP>:3000`, or scan the lobby's QR code.
- A third window on the link = spectator mode.

### Checking that the API rejects illegal moves

Grab your access token in the browser console on the game page:

```js
JSON.parse(localStorage.getItem("q-auth")).access_token
```

Then:

```bash
curl -i -X POST http://localhost:3000/api/games/<GAME_ID>/move \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"move":{"type":"pawn","r":0,"c":0},"expectedVersion":<VERSION>}'
# → 422 {"error":"ILLEGAL_MOVE","reason":"illegal_pawn_move", ...}
```

Sending the same legal move twice with the same `expectedVersion` returns `409 STALE_VERSION` for the second one.

### Checking the secret key isn't shipped to the browser

```bash
npm run build
grep -rl "$SUPABASE_SECRET_KEY" .next/static && echo "LEAK" || echo "ok"
```

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Opponent's moves only appear after a refresh | `games` isn't in the `supabase_realtime` publication (Database → Publications), or Realtime is disabled for the project. The app falls back to polling every 10 s while disconnected. |
| "Anonymous sign‑ins are disabled" | Authentication → Sign In / Providers → enable anonymous sign‑ins. |
| Home page says online play needs Supabase | `.env.local` is missing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Restart `npm run dev` after editing it. On Netlify, add the vars and redeploy (public vars are inlined at build time). |
| Moves fail with "The server had a problem" | `SUPABASE_SECRET_KEY` is missing or wrong on the server. |
| `permission denied for function …` | Re‑run `schema.sql` (it sets the grants), and make sure you use the secret key on the server. |
| Clocks look off by a few seconds | The app measures the server clock offset; check the device isn't blocking requests to Supabase. |

## 6. How it works

- **Rules** live in `lib/engine` (pure TypeScript). The client uses them for highlighting and optimistic moves; `POST /api/games/[id]/move` re‑validates every move against the DB state with the same engine and then calls `commit_move` with the secret key.
- **Time** is decided by Postgres `now()` inside `commit_move` / `claim_timeout`. Clients estimate `offset = server − (t0+t1)/2` from the lowest‑RTT of several `get_server_time` calls and only *display* time. Any client (even a spectator) calls `claim_timeout` when the mover's clock reaches 0, so a flagged player who closed their tab still loses on time.
- **Sync:** one Realtime channel `game:<id>` — `postgres_changes` for the authoritative row (rows with `version` ≤ the current one are ignored), Presence for who's online, Broadcast for chat/emotes and the wall‑hover ghost. The row is refetched on subscribe/reconnect, when the tab becomes visible and by a 10 s poll while the channel is down; missing `game_moves` are fetched when `move_count` gets ahead.

```
app/            routes (home, /play/[code], /local, /rules, /api/games/[id]/move, OG image, manifest)
components/     board/ (SVG board) · game/ · lobby/ · play/ · home/ · ui/
lib/engine/     rules, pathfinding, notation (+ tests)
lib/ai/         bot (easy / medium / hard alpha-beta) + Web Worker (+ tests)
lib/realtime/   useGameChannel
lib/clock/      server offset + clock hooks
lib/supabase/   browser client, server client, anonymous auth
supabase/       schema.sql (source of truth)
```

## 7. Decisions

Places where the spec was open or needed a concrete choice:

- **`schema.sql` location:** it was at the repo root and was moved to `supabase/schema.sql` unchanged.
- **`isLegalWall(state, wall, n, seat?)`:** the `no_walls_left` reason needs a seat, so `seat` is an optional fourth argument. Without it only geometry and paths are checked.
- **No moves after a win:** `validateMove` returns `game_over` once either pawn is on its goal row.
- **Wall notation:** the "top‑left cell of the 2×2 block" is exactly the anchor cell `{r, c}`. So `{r:3,c:2,o:'h'}` on 9×9 is `c6h`, which matches the spec's example.
- **Move API status codes:** the spec's mapping, plus `GAME_NOT_ACTIVE` → 409 (with the row), `NOT_A_PLAYER` → 403, `NOT_AUTHENTICATED` → 401, a bad body → 400. A timeout result is `409 {"error":"FLAGGED", game}`. The route also pre‑checks the version and turn before calling the RPC, which re‑checks everything under a row lock.
- **Countdown tolerance:** the route lets a move through up to 250 ms before `turn_started_at` (for clock skew). `commit_move` still has the final say (`GAME_NOT_STARTED` → 425).
- **Time used per move** in the history is worked out from `clock_after_ms` and the increment. The winning move gets no increment, matching `commit_move`.
- **`game_moves` isn't in the Realtime publication** (the schema only adds `games`), so history is fetched over REST when `move_count` changes.
- **Chat** is Broadcast only, so it isn't stored. Someone who joins late doesn't see earlier messages, and a refresh clears it.
- **Thinking ghost:** shown only while it's the sender's turn, and cleared when a move lands. It can be turned off in Settings ("Share my wall preview").
- **Pawn shapes:** seat 0 is an orange circle and seat 1 a blue rounded square (Okabe–Ito colors), so the players differ by color *and* shape. The goal edges carry the same colors.
- **Touch:** walls always need a second tap (or ✓). "Confirm moves" defaults to *On touch* and applies to pawn moves too. Dragging the pawn always moves immediately.
- **Medium bot:** greedy 1‑ply on `(opponent path − own path)` with a small penalty for using a wall. The penalty flips to a bonus when the opponent is ≤ 2 steps from goal, otherwise it would never block a winning run.
- **Hard bot:** iterative‑deepening alpha‑beta to depth 3 within ~500 ms in a Web Worker. Candidates are all pawn moves plus the best 14 walls near either player's shortest path.
- **Local games** (pass & play / bot) are untimed and saved in `localStorage`, so a refresh keeps them.
- **Win/loss record** is per browser (`localStorage`), counted once per game.
- **PWA:** manifest and icons only (generated with `next/og`). There's no service worker or offline mode, since online play needs the network anyway.
