# Build: Online Quoridor — real-time, timed, invite-link multiplayer

You are building a polished, production-ready web version of the board game **Quoridor** where a player can create a match, share an invite link, and play a **real-time, timed** game against someone on another device. Work autonomously through the milestones below, run tests and builds as you go, and don't stop at a half-working state.

---

## 0. Ground rules

- **Stack:** latest stable **Next.js (App Router) + TypeScript (strict) + Tailwind CSS**, `@supabase/supabase-js` v2, **Vitest** for tests. Keep dependencies minimal; ask before adding anything heavy.
- **Hosting:** **Netlify** (Next.js runtime / OpenNext adapter, auto-detected). That means **no custom WebSocket server and no long-running processes**. All real-time traffic goes through **Supabase Realtime**. Route handlers run as serverless functions.
- **Database:** Supabase. **The backend is already designed and lives in `supabase/schema.sql` in this repo. Read it fully before writing any code — it is the source of truth** for tables, column names, RPC signatures, and error codes. I run it myself in the Supabase dashboard; you can't reach my Supabase project. **Do not modify `schema.sql`.** If you truly need a schema change, write a new file `supabase/migrations/NNN_description.sql`, explain why, and tell me to run it.
- **Auth:** Supabase **anonymous sign-in** (`supabase.auth.signInAnonymously()`), done silently on first visit. No accounts or passwords. The player picks a display name (saved in `localStorage`, editable).
- **Env vars** (create `.env.example`, never commit real keys):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the publishable key, or the legacy `anon` key)
  - `SUPABASE_SECRET_KEY` (the secret key, or the legacy `service_role` key). **Server-only**: import it only in route handlers or server code, never in client components. Add a guard (`import 'server-only'`).
- Before you finish each milestone: `npm run lint`, `npm run test`, and `npm run build` must pass.

---

## 1. Authority model (important, don't deviate)

| Concern | Who is authoritative | How |
|---|---|---|
| **Rules** (is this move legal? did it win?) | Shared **TypeScript game engine** | The client uses it for highlighting and optimistic moves. The **server route `POST /api/games/[id]/move`** re-validates every move with the same engine. |
| **Time** (clocks, increments, flagging) | **Postgres `now()`** | Inside the `commit_move` / `claim_timeout` SQL functions. Clients only *display* time. |
| **Writes** | SQL functions only | Tables are read-only to clients (RLS). Lobby actions use RPCs directly from the browser; moves go through the API route, which calls `commit_move` with the secret key. |

### Move flow
1. Client checks legality locally → applies the move **optimistically** (renders it immediately, freezes own clock, marks it "pending").
2. `POST /api/games/[id]/move` with `{ move, expectedVersion }` and header `Authorization: Bearer <supabase access token>`.
3. The route: verifies the user with `supabase.auth.getUser(token)` → loads the game with the secret-key client → rejects if not active or not that user's seat/turn → validates with the engine against the **DB state** → computes the new state, notation, and `isWinning` → calls RPC `commit_move(p_game_id, p_user_id, p_expected_version, p_move, p_notation, p_new_state, p_is_winning)`.
4. Map results to HTTP: success → 200 + game row; `STALE_VERSION` → 409; `NOT_YOUR_TURN` / illegal move → 422 with a reason; `GAME_NOT_STARTED` → 425; if the returned row has `end_reason = 'timeout'`, the mover flagged before the move landed → 409 + game row.
5. On error, the client **rolls back** to the server game row and shows a toast. On success, it reconciles with the returned row. The opponent receives the change via Realtime.

Set `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` on route handlers.

---

## 2. Database contract (summary — `schema.sql` has the details)

**`games`** (one row per match, Realtime-enabled): `id, code` (6-char invite code), `status` (`waiting|active|finished|abandoned`), `host_id`, `p0_id/p1_id`, `p0_name/p1_name`, `p0_ready/p1_ready`, `board_size` (5|7|9), `walls_per_player`, `initial_time_ms` (0 = untimed), `increment_ms`, `state` (jsonb), `turn` (0|1), `move_count`, `version`, `clock_ms` (int[2]), `turn_started_at`, `last_move`, `winner`, `end_reason` (`goal|timeout|resign|abandoned`), `rematch_votes`, `rematch_of`, `rematch_game_id`, timestamps.

**`game_moves`**: `game_id, ply, player, move` (jsonb), `notation`, `clock_after_ms`, `created_at`.

**Client RPCs** (`supabase.rpc`): `get_server_time()`, `create_game(p_name, p_board_size, p_walls, p_initial_time_ms, p_increment_ms, p_side 'p0'|'p1'|'random')`, `join_game(p_code, p_name)` (idempotent if already seated), `set_ready(p_game_id, p_ready)` (auto-starts with a **3-second countdown** when both are ready: `turn_started_at` is in the future), `leave_game(p_game_id)` (lobby only; host leaving cancels), `resign_game(p_game_id)`, `claim_timeout(p_game_id)` (anyone may call; no-op if time isn't really up), `request_rematch(p_game_id)` (second vote creates a new game with **swapped seats** and sets `rematch_game_id` on the old row).

**Server-only RPC:** `commit_move(...)` (secret key only).

**Error codes** are raised as plain strings: `NOT_AUTHENTICATED, NAME_REQUIRED, BAD_SIDE, TOO_MANY_OPEN_GAMES, GAME_NOT_FOUND, GAME_ALREADY_STARTED, GAME_FULL, NOT_A_PLAYER, GAME_NOT_WAITING, GAME_NOT_ACTIVE, GAME_NOT_FINISHED, STALE_VERSION, NOT_YOUR_TURN, GAME_NOT_STARTED`. Build one `lib/errors.ts` that maps each one to a friendly message.

Generate TypeScript types for the rows by hand in `lib/types.ts`, matching the schema exactly.

---

## 3. Game rules & data format (the engine must match this exactly)

**Coordinates:** an `n×n` board (n = 5, 7, or 9). Cells are `{r, c}`, with `r` = row 0 at the **top** and `c` = column 0 at the **left**.
- **Seat 0** starts at `{r: n-1, c: floor(n/2)}` (bottom middle), **moves first**, and wins by reaching **row 0**.
- **Seat 1** starts at `{r: 0, c: floor(n/2)}` and wins by reaching **row n-1**.

**Walls** are 2 cells long, anchored at a groove intersection `{r, c, o}` with `0 ≤ r, c ≤ n-2`:
- `o: 'h'` blocks movement between rows `r` and `r+1` for columns `c` and `c+1`.
- `o: 'v'` blocks movement between columns `c` and `c+1` for rows `r` and `r+1`.

**State JSON** (this is what's stored in `games.state`; the initial state is built by SQL):
```json
{ "pawns": [{"r":8,"c":4},{"r":0,"c":4}], "walls": [{"r":3,"c":2,"o":"h"}], "wallsLeft": [10,10] }
```
**Move JSON:** `{"type":"pawn","r":7,"c":4}` or `{"type":"wall","r":3,"c":2,"o":"h"}`.

**Rules:**
- On your turn, either move your pawn **or** place a wall (if you have any left).
- A pawn moves 1 cell orthogonally and can't pass through a wall or leave the board.
- **Jumps:** if the opponent is orthogonally adjacent with no wall between you, you may jump straight over them, unless a wall or the board edge is directly behind them. In that case you may move **diagonally** to either cell beside the opponent, provided no wall blocks the step from the opponent's cell to that cell. A pawn can never land on the opponent.
- **Wall legality:** inside bounds; doesn't **overlap** another wall (same anchor and orientation, an `h` at `(r, c±1)` sharing a segment, or a `v` at `(r±1, c)` sharing a segment); doesn't **cross** one (an `h` and a `v` on the same anchor); and leaves **both** players at least one path to their goal row (BFS).
- Reaching your goal row wins immediately.

**Notation** (used in history and export): columns `a…` left to right, ranks `1…n` **bottom to top**. A pawn move is the destination square (`e2`). A wall is the top-left cell of the 2×2 block around its center plus `h`/`v` (`c6h`). Put this in the rules modal.

### Engine (`lib/engine/`, pure TypeScript, no React, no I/O)
Export: `createInitialState(n, walls)`, `legalPawnMoves(state, seat, n)`, `isLegalWall(state, wall, n) → {ok, reason?}` with reasons `'out_of_bounds' | 'overlap' | 'cross' | 'blocks_path' | 'no_walls_left'`, `applyMove(state, seat, move, n)` (throws on illegal), `isWin`, `shortestPath(state, seat, n)` (returns the path, not just its length), `toNotation / fromNotation`.
Performance: precompute or cache the blocked-edge set. Wall validation must take < 1 ms so the hover preview can run on every mouse move.

**Vitest tests (required, thorough):** straight jump; diagonal jump when the opponent is against the edge and when they're against a wall; diagonal blocked by a wall; all overlap and cross cases; path-blocking walls rejected for *either* player; board edges; wall count exhausted; win detection for both seats; notation round-trip on 5/7/9 boards; and a randomized test that plays 200 random legal games to completion without throwing.

---

## 4. Real-time sync & clocks

- **Subscription:** one Realtime channel per game, `game:<id>`. Use `postgres_changes` (UPDATE on `games`, filter `id=eq.<id>`) for authoritative state, plus **Presence** (who's online, and whether each player or spectator is connected) and **Broadcast** (chat messages, emotes, wall-hover "thinking" ghost — see QoL).
- **Ordering:** ignore any incoming row whose `version` ≤ the version you already have.
- **Resilience:** refetch the game row on `SUBSCRIBED`, on reconnect, on `visibilitychange` → visible, and with a slow fallback poll (~10 s) whenever the channel isn't in the `SUBSCRIBED` state. When `move_count` gets ahead of your local history, fetch the missing `game_moves`.
- **Server time offset:** on load (and every ~60 s), call `get_server_time` 3–5 times and take the sample with the lowest round-trip time: `offset = server - (t0+t1)/2`. All clock math uses `Date.now() + offset`.
- **Clock display:** for the mover, `remaining = clock_ms[turn] - max(0, serverNow - turn_started_at)`. The other player's clock shows `clock_ms[other]` frozen. Render with `requestAnimationFrame`, show tenths of a second below 10 s, add a warning style below 30 s, and add an optional tick sound below 10 s. Before `turn_started_at`, show a big **3-2-1 countdown** overlay and block input.
- **Flagging:** when a client sees the mover's clock reach 0 (either player, or a spectator), it calls `claim_timeout`. Retry with backoff (~300 ms, 1 s, 2 s) if the row isn't finished yet. Only call it once per turn.
- **Untimed games** (`initial_time_ms = 0`): hide clocks and show "Opponent disconnected" via Presence. Resign is the only way to end early.
- **Rematch:** when the subscribed row gets a `rematch_game_id`, both clients auto-navigate to the new game. Show "Opponent wants a rematch" when the other player's id is in `rematch_votes`.

---

## 5. Routes & user flow

- `/` **Home:** big "Create game" and "Join with code" options, plus "Play vs computer" and "Pass & play (same device)". Recent games for this browser (query `games` where I'm p0/p1, last 10). A link to the rules.
- **Create game dialog:** board size (9 is the default; 7 and 5 are for quick games), walls (default 10/8/5 by board size, adjustable), time-control presets — **Bullet 1+0, Blitz 3+2, Rapid 5+3 (default), Classical 10+5, Untimed** — plus custom, and side choice (first / second / random). Then → `/play/[code]`.
- `/play/[code]` **(the invite link):**
  - If you're seated → lobby or game view.
  - If not seated and a seat is free and the game is `waiting` → ask for a name (prefilled) → `join_game`.
  - Otherwise → **spectator mode** (read-only, live, with a spectator count).
- **Lobby:** both player cards with an online dot (Presence) and a **Ready** toggle. The settings summary. Invite tools: **Copy link** button (with "Copied!" feedback), **Web Share API** button on mobile, **QR code** (small lib like `qrcode.react`) for playing across devices in the same room, and the code in large text. Host can cancel; guest can leave.
- **Game view:** board, both clocks, walls-remaining counters as wall icons, whose turn it is, move history, chat, menu (resign with confirmation, sound toggle, settings, rules, flip board).
- **Game over:** modal with the result and reason ("Raymond reached the goal", "Time out", "Resigned"). Buttons: **Rematch** (shows vote status), **Review game**, **New game**, **Home**.
- **Link previews:** `generateMetadata` on `/play/[code]` (server-side, secret key) so WhatsApp/Discord previews say "*{host} invited you to play Quoridor · Rapid 5+3*". Bonus: a simple OG image via `next/og`.

---

## 6. Board UI/UX (make this feel great)

- Render the board as **SVG** (crisp at any size, easy hit areas). Make it responsive and square, filling the viewport on mobile in portrait. Use clear grooves between cells.
- **Perspective:** always draw *your* pawn at the bottom (flip for seat 1). Spectators see seat 0 at the bottom, with a flip button. Engine coordinates stay absolute; only the rendering flips.
- **Pawn moves:** on your turn, highlight legal destination cells (including jumps and diagonals). Click or tap to move, or **drag the pawn**.
- **Wall placement (desktop):** hovering near a groove shows a **ghost wall** snapped to the nearest valid anchor. The orientation follows the closest groove, `R` / right-click / mouse wheel rotates it, and a click places it. Show illegal ghosts in red with a small reason tooltip ("Would trap your opponent", "Overlaps a wall").
- **Wall placement (touch):** tap a groove → ghost appears → tap the ghost again (or a ✓ button) to confirm, or tap ✕ / elsewhere to cancel. Add a rotate button. No accidental placements.
- **Optional "confirm moves" setting** (on by default on touch devices) for pawn moves too.
- **Last move highlight**, and a smooth pawn slide or wall drop animation (CSS/SVG transitions, ~150 ms; respect `prefers-reduced-motion`).
- **Distance-to-goal badges** for both players (shortest path length), with an optional "show my shortest path" overlay toggle.
- **Keyboard:** arrow keys / WASD to move the pawn, `Space` to switch between pawn and wall mode (then arrows move the ghost wall), `R` to rotate, `Enter` to confirm, `Esc` to cancel. Visible focus states and `aria-label`s on cells.
- **Turn awareness:** the tab title changes to "● Your move — Quoridor" when it's your turn while the tab is hidden, plus a short sound. Use `navigator.vibrate` on mobile when your opponent moves (if available).
- **Sounds:** synthesize with the Web Audio API (no audio files): move, wall, low time, win/lose. Mute toggle saved in `localStorage`.
- **Connection banner:** "Reconnecting…" when the Realtime channel drops; "Opponent disconnected" via Presence (with how long ago).
- **Theme:** dark/light (follow the system, with a toggle). Good contrast. Two player colors that are colorblind-safe (also distinguish them by shape/ring, not color alone).

---

## 7. Quality-of-life extras

**Must have:**
1. **Move history panel** with notation, the time used per move, and a scrollable list.
2. **Review/replay** after the game: step through moves with ←/→ and a slider, starting from the initial position. **Copy game notation** to the clipboard.
3. **Chat + quick emotes** (👍 😅 🔥 GG "Nice wall!"), sent over Realtime Broadcast (ephemeral, not stored). Limit messages to 200 chars, rate-limit client-side to 1 per second, and add a mute-chat toggle. Spectators can read but not send by default.
4. **Resign** with a confirmation dialog.
5. **Rules / how-to-play modal** with small diagrams of jumps and wall rules, plus a first-visit hint tooltip.
6. **Toasts** for every error code, in friendly language.

**Should have:**
7. **Play vs computer** (fully client-side, no DB) with 3 levels:
   - *Easy:* mostly follows its shortest path, with occasional random walls.
   - *Medium:* greedy 1-ply. It picks the move or wall that maximizes `(opponent path length − own path length)`, considering only walls near the opponent's shortest path.
   - *Hard:* 2–3 ply alpha-beta with the same candidate pruning and a time budget of ~500 ms, run in a **Web Worker** so the UI never freezes.
8. **Pass & play** local mode (same device; the board doesn't flip, or there's an option to flip each turn), with **undo** (local and bot modes only).
9. **Opponent's "thinking" ghost:** optionally broadcast your hovered wall position (throttled to ~10/s) so your opponent sees a faint ghost. Add a setting to turn it off (it's a fun real-time touch).

**Nice to have** (only after everything else is solid):
10. Board color themes.
11. A win/loss record for this browser (`localStorage`).
12. Installable PWA manifest and icons.

---

## 8. Project structure (suggested)

```
app/
  page.tsx                     # home
  play/[code]/page.tsx         # invite link → lobby / game / spectate
  local/page.tsx               # pass & play + vs computer
  api/games/[id]/move/route.ts # authoritative move endpoint
components/  board/  game/  lobby/  ui/
lib/
  engine/   (rules, notation, pathfinding)  + __tests__/
  ai/       (bot + worker)
  supabase/ (browser client, server client, auth bootstrap)
  realtime/ (useGameChannel hook: subscription, presence, broadcast, refetch, versions)
  clock/    (server offset, useClock hook)
  types.ts, errors.ts
supabase/schema.sql  # provided — do not edit
```
Keep game-state logic in hooks or a small store (`useReducer` or Zustand). Components stay mostly presentational.

---

## 9. Netlify deployment

- Add `netlify.toml` with `[build] command = "npm run build"` and `publish = ".next"`, and pin the Node version (LTS) via `[build.environment] NODE_VERSION`.
- Write `README.md` with:
  - **Supabase setup:** create a project → SQL Editor → run `supabase/schema.sql` → Authentication → enable **Anonymous sign-ins** → copy the URL, publishable key, and secret key.
  - **Local dev:** `.env.local` → `npm i` → `npm run dev`.
  - **Netlify:** import the repo → add the 3 env vars → deploy.
  - **Testing multiplayer locally:** open a normal window and an incognito window, or use your phone on the same Wi-Fi via the LAN IP.
  - A **troubleshooting** section (Realtime not updating → check the table is in the `supabase_realtime` publication; anonymous sign-in disabled; missing env vars).

---

## 10. Milestones (do them in order and tell me when each is done)

1. **Engine + tests.** All tests green.
2. **Local play:** board UI, pass & play, wall ghosting, keyboard/touch, rules modal.
3. **Supabase wiring:** anonymous auth, name, create/join/lobby/ready via RPCs, invite link, QR code, spectators.
4. **Online play:** move API route, optimistic moves + rollback, Realtime sync, server-offset clocks, countdown, timeout claims, resign, game over, rematch.
5. **Polish:** history, replay, chat/emotes, sounds, connection banners, title notifications, link-preview metadata, dark mode, mobile pass.
6. **Bot** (Web Worker, 3 levels).
7. **Deploy prep:** `netlify.toml`, README, `.env.example`, final lint/test/build.

### Acceptance checklist (verify before saying you're done)
- [ ] Two different browsers/devices can create → share link → join → ready → play a full timed game, and each move appears on the other screen in about a second or less.
- [ ] Clocks agree on both devices within ~200 ms. Increment applies. Letting a clock run out ends the game as a timeout on both screens, even if the flagged player closed their tab.
- [ ] Illegal moves are impossible in the UI **and** rejected by the API (test by `curl`-ing an illegal move).
- [ ] Two quick clicks or a double-submit can't make two moves (the `version` check works).
- [ ] Refreshing mid-game restores everything (seat, clocks, history). Opening the link on a third device shows spectator mode.
- [ ] Rematch swaps who moves first and both clients navigate automatically.
- [ ] The game works well on a phone in portrait mode (no accidental wall placements).
- [ ] The secret key never appears in the client bundle (grep `.next/static`).
- [ ] `npm run lint && npm run test && npm run build` all pass.

If anything in this spec is ambiguous or conflicts with `schema.sql`, `schema.sql` wins for data and this document wins for behavior. Make a sensible decision, note it in `README.md` under "Decisions", and keep going.
