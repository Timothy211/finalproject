-- =====================================================================
--  QUORIDOR ONLINE — Supabase backend setup
-- ---------------------------------------------------------------------
--  How to run:
--    Supabase Dashboard → SQL Editor → New query → paste this whole file → Run
--
--  Before/after running, ALSO do this in the dashboard:
--    Authentication → Sign In / Providers → enable "Allow anonymous sign-ins"
--
--  WARNING: this script is re-runnable but DESTRUCTIVE — it drops and
--  recreates the game tables (all games are deleted). Fine during dev.
--
--  Authority model:
--    * Rules (is a move legal?)  → TypeScript engine in a Next.js API route
--    * Time (clocks, timeouts)   → Postgres now(), inside these functions
--    * Clients can only READ tables; every write goes through a function.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Clean slate
-- ---------------------------------------------------------------------
drop table if exists public.game_moves cascade;
drop table if exists public.games cascade;

drop function if exists public._initial_state(int, int);
drop function if exists public._new_code();
drop function if exists public._seat_of(public.games, uuid);
drop function if exists public._settled_clock(public.games);
drop function if exists public.create_game(text, int, int, int, int, text);
drop function if exists public.join_game(text, text);
drop function if exists public.set_ready(uuid, boolean);
drop function if exists public.leave_game(uuid);
drop function if exists public.resign_game(uuid);
drop function if exists public.claim_timeout(uuid);
drop function if exists public.request_rematch(uuid);
drop function if exists public.get_server_time();
drop function if exists public.commit_move(uuid, uuid, int, jsonb, text, jsonb, boolean);
drop function if exists public.cleanup_stale_games();


-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table public.games (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,                 -- 6-char invite code, e.g. 'K7QXPM'
  status           text not null default 'waiting'
                   check (status in ('waiting', 'active', 'finished', 'abandoned')),

  host_id          uuid not null references auth.users(id) on delete cascade,
  -- Seat 0 starts at the BOTTOM row and moves FIRST. Seat 1 starts at the top.
  p0_id            uuid references auth.users(id) on delete set null,
  p1_id            uuid references auth.users(id) on delete set null,
  p0_name          text check (char_length(p0_name) between 1 and 24),
  p1_name          text check (char_length(p1_name) between 1 and 24),
  p0_ready         boolean not null default false,
  p1_ready         boolean not null default false,

  -- Settings (chosen by host)
  board_size       smallint not null default 9  check (board_size in (5, 7, 9)),
  walls_per_player smallint not null default 10 check (walls_per_player between 0 and 20),
  initial_time_ms  integer  not null default 300000
                   check (initial_time_ms = 0 or initial_time_ms between 30000 and 3600000), -- 0 = untimed
  increment_ms     integer  not null default 0 check (increment_ms between 0 and 60000),

  -- Live state
  state            jsonb    not null,   -- {"pawns":[{r,c},{r,c}], "walls":[{r,c,o}], "wallsLeft":[n,n]}
  turn             smallint not null default 0 check (turn in (0, 1)),
  move_count       integer  not null default 0,
  version          integer  not null default 0,   -- bumps on EVERY change; used for optimistic concurrency
  clock_ms         integer[] not null,            -- [p0, p1] remaining ms, measured at turn_started_at
  turn_started_at  timestamptz,                   -- when the current mover's clock started running
  last_move        jsonb,

  -- Result
  winner           smallint check (winner in (0, 1)),
  end_reason       text check (end_reason in ('goal', 'timeout', 'resign', 'abandoned')),

  -- Rematch
  rematch_votes    uuid[] not null default '{}',
  rematch_of       uuid references public.games(id) on delete set null,
  rematch_game_id  uuid references public.games(id) on delete set null,

  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz not null default now()
);

create index games_p0_idx     on public.games (p0_id);
create index games_p1_idx     on public.games (p1_id);
create index games_status_idx on public.games (status, created_at);

create table public.game_moves (
  id             bigint generated always as identity primary key,
  game_id        uuid not null references public.games(id) on delete cascade,
  ply            integer  not null,          -- 1, 2, 3 …
  player         smallint not null check (player in (0, 1)),
  move           jsonb    not null,          -- {"type":"pawn","r":7,"c":4} | {"type":"wall","r":3,"c":2,"o":"h"}
  notation       text     not null,          -- e.g. "e2", "c6h"
  clock_after_ms integer,                    -- mover's remaining time after the move (null if untimed)
  created_at     timestamptz not null default now(),
  unique (game_id, ply)
);


-- ---------------------------------------------------------------------
-- 2. Row Level Security — read-only for signed-in users (incl. anonymous)
--    Anyone with the link can read a game → enables spectating.
-- ---------------------------------------------------------------------
alter table public.games      enable row level security;
alter table public.game_moves enable row level security;

create policy "Signed-in users can read games"
  on public.games for select to authenticated using (true);

create policy "Signed-in users can read moves"
  on public.game_moves for select to authenticated using (true);

revoke all on public.games, public.game_moves from anon, authenticated;
grant select on public.games, public.game_moves to authenticated;


-- ---------------------------------------------------------------------
-- 3. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------
create function public._initial_state(p_size int, p_walls int)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'pawns', jsonb_build_array(
               jsonb_build_object('r', p_size - 1, 'c', p_size / 2),   -- seat 0: bottom middle
               jsonb_build_object('r', 0,          'c', p_size / 2)),  -- seat 1: top middle
    'walls', '[]'::jsonb,
    'wallsLeft', jsonb_build_array(p_walls, p_walls)
  );
$$;

create function public._new_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no I, O, 0, 1
  v text;
begin
  loop
    v := '';
    for i in 1..6 loop
      v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = v);
  end loop;
  return v;
end $$;

create function public._seat_of(g public.games, p_uid uuid)
returns smallint language sql immutable as $$
  select case when g.p0_id = p_uid then 0::smallint
              when g.p1_id = p_uid then 1::smallint
         end;
$$;

-- Clock array with the current mover's elapsed time deducted (never below 0).
create function public._settled_clock(g public.games)
returns integer[] language plpgsql stable as $$
declare
  c integer[] := g.clock_ms;
  elapsed bigint;
begin
  if g.status <> 'active' or g.initial_time_ms = 0 or g.turn_started_at is null then
    return c;
  end if;
  elapsed := greatest(0, floor(extract(epoch from (now() - g.turn_started_at)) * 1000));
  c[g.turn + 1] := greatest(0, c[g.turn + 1] - elapsed)::int;
  return c;
end $$;


-- ---------------------------------------------------------------------
-- 4. Client-callable RPCs  (supabase.rpc('name', { ...args }))
--    Errors are raised as short codes, e.g. 'GAME_FULL' — map them to
--    friendly messages in the UI.
-- ---------------------------------------------------------------------

-- Server clock for client offset estimation (epoch ms).
create function public.get_server_time()
returns bigint language sql volatile as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

-- Host creates a lobby. p_side: 'p0' (move first) | 'p1' | 'random'
create function public.create_game(
  p_name            text,
  p_board_size      int  default 9,
  p_walls           int  default 10,
  p_initial_time_ms int  default 300000,
  p_increment_ms    int  default 0,
  p_side            text default 'random'
) returns public.games
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  seat int;
  nm   text := left(btrim(coalesce(p_name, '')), 24);
  g    public.games;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if nm = '' then raise exception 'NAME_REQUIRED'; end if;
  if p_side not in ('p0', 'p1', 'random') then raise exception 'BAD_SIDE'; end if;
  if (select count(*) from public.games where host_id = uid and status = 'waiting') >= 5 then
    raise exception 'TOO_MANY_OPEN_GAMES';
  end if;

  seat := case p_side when 'p0' then 0 when 'p1' then 1 else floor(random() * 2)::int end;

  insert into public.games (
    code, host_id, p0_id, p1_id, p0_name, p1_name,
    board_size, walls_per_player, initial_time_ms, increment_ms, state, clock_ms
  ) values (
    public._new_code(), uid,
    case when seat = 0 then uid end, case when seat = 1 then uid end,
    case when seat = 0 then nm  end, case when seat = 1 then nm  end,
    p_board_size, p_walls, p_initial_time_ms, p_increment_ms,
    public._initial_state(p_board_size, p_walls),
    array[p_initial_time_ms, p_initial_time_ms]
  ) returning * into g;

  return g;
end $$;

-- Join via invite code. Idempotent: if you're already seated, returns the game.
create function public.join_game(p_code text, p_name text)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm  text := left(btrim(coalesce(p_name, '')), 24);
  g   public.games;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into g from public.games where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  if public._seat_of(g, uid) is not null then return g; end if;   -- rejoin / refresh
  if g.status <> 'waiting' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if nm = '' then raise exception 'NAME_REQUIRED'; end if;

  if g.p0_id is null then
    update public.games set p0_id = uid, p0_name = nm, p0_ready = false,
           version = version + 1, updated_at = now()
     where id = g.id returning * into g;
  elsif g.p1_id is null then
    update public.games set p1_id = uid, p1_name = nm, p1_ready = false,
           version = version + 1, updated_at = now()
     where id = g.id returning * into g;
  else
    raise exception 'GAME_FULL';
  end if;

  return g;
end $$;

-- Toggle ready in the lobby. When both seats are filled and both are ready,
-- the game starts with a 3-second countdown (turn_started_at is in the future).
create function public.set_ready(p_game_id uuid, p_ready boolean)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  seat smallint;
  g    public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  seat := public._seat_of(g, uid);
  if seat is null then raise exception 'NOT_A_PLAYER'; end if;
  if g.status <> 'waiting' then raise exception 'GAME_NOT_WAITING'; end if;

  update public.games set
    p0_ready = case when seat = 0 then p_ready else p0_ready end,
    p1_ready = case when seat = 1 then p_ready else p1_ready end,
    version = version + 1, updated_at = now()
  where id = g.id returning * into g;

  if g.p0_id is not null and g.p1_id is not null and g.p0_ready and g.p1_ready then
    update public.games set
      status = 'active', turn = 0,
      started_at = now(),
      turn_started_at = now() + interval '3 seconds',
      clock_ms = array[initial_time_ms, initial_time_ms],
      version = version + 1, updated_at = now()
    where id = g.id returning * into g;
  end if;

  return g;
end $$;

-- Leave a lobby before it starts. Host leaving cancels the lobby.
create function public.leave_game(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  seat smallint;
  g    public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  seat := public._seat_of(g, uid);
  if seat is null then raise exception 'NOT_A_PLAYER'; end if;
  if g.status <> 'waiting' then raise exception 'GAME_NOT_WAITING'; end if;

  if g.host_id = uid then
    update public.games set status = 'abandoned', end_reason = 'abandoned',
           finished_at = now(), version = version + 1, updated_at = now()
     where id = g.id returning * into g;
  elsif seat = 0 then
    update public.games set p0_id = null, p0_name = null, p0_ready = false,
           version = version + 1, updated_at = now()
     where id = g.id returning * into g;
  else
    update public.games set p1_id = null, p1_name = null, p1_ready = false,
           version = version + 1, updated_at = now()
     where id = g.id returning * into g;
  end if;

  return g;
end $$;

create function public.resign_game(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  seat smallint;
  g    public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  seat := public._seat_of(g, uid);
  if seat is null then raise exception 'NOT_A_PLAYER'; end if;
  if g.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;

  update public.games set
    status = 'finished', winner = 1 - seat, end_reason = 'resign',
    clock_ms = public._settled_clock(g),
    finished_at = now(), version = version + 1, updated_at = now()
  where id = g.id returning * into g;

  return g;
end $$;

-- Anyone watching may call this when the mover's clock looks like it hit 0.
-- The DB decides using its own clock; if time isn't actually up, nothing changes.
create function public.claim_timeout(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  c integer[];
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  if g.status = 'active' and g.initial_time_ms > 0 and now() >= g.turn_started_at then
    c := public._settled_clock(g);
    if c[g.turn + 1] <= 0 then
      update public.games set
        status = 'finished', winner = 1 - turn, end_reason = 'timeout',
        clock_ms = c, finished_at = now(), version = version + 1, updated_at = now()
      where id = g.id returning * into g;
    end if;
  end if;

  return g;
end $$;

-- Both players vote; on the second vote a new game is created with SWAPPED
-- seats (so the other player moves first) and starts after a 3s countdown.
-- Clients watching the old game see rematch_game_id appear and navigate.
create function public.request_rematch(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  g     public.games;
  ng    public.games;
  votes uuid[];
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if public._seat_of(g, uid) is null then raise exception 'NOT_A_PLAYER'; end if;
  if g.status <> 'finished' then raise exception 'GAME_NOT_FINISHED'; end if;
  if g.rematch_game_id is not null then return g; end if;

  votes := array(select distinct x from unnest(g.rematch_votes || uid) as x);

  if g.p0_id = any(votes) and g.p1_id = any(votes) then
    insert into public.games (
      code, status, host_id, p0_id, p1_id, p0_name, p1_name, p0_ready, p1_ready,
      board_size, walls_per_player, initial_time_ms, increment_ms, state, clock_ms,
      turn, started_at, turn_started_at, rematch_of
    ) values (
      public._new_code(), 'active', g.host_id, g.p1_id, g.p0_id, g.p1_name, g.p0_name, true, true,
      g.board_size, g.walls_per_player, g.initial_time_ms, g.increment_ms,
      public._initial_state(g.board_size, g.walls_per_player),
      array[g.initial_time_ms, g.initial_time_ms],
      0, now(), now() + interval '3 seconds', g.id
    ) returning * into ng;

    update public.games set rematch_votes = votes, rematch_game_id = ng.id,
           version = version + 1, updated_at = now()
     where id = g.id returning * into g;
  else
    update public.games set rematch_votes = votes,
           version = version + 1, updated_at = now()
     where id = g.id returning * into g;
  end if;

  return g;
end $$;


-- ---------------------------------------------------------------------
-- 5. SERVER-ONLY RPC — called by the Next.js move API route with the
--    secret/service_role key AFTER the TypeScript engine validated the move.
--    Handles turn ownership, optimistic concurrency, clocks and flagging.
--
--    Returns the updated game. If the mover had already run out of time,
--    the game is finished by timeout and the move is NOT applied
--    (check end_reason = 'timeout' in the API route).
-- ---------------------------------------------------------------------
create function public.commit_move(
  p_game_id          uuid,
  p_user_id          uuid,
  p_expected_version int,
  p_move             jsonb,
  p_notation         text,
  p_new_state        jsonb,
  p_is_winning       boolean
) returns public.games
language plpgsql security definer set search_path = public as $$
declare
  g     public.games;
  mover smallint;
  c     integer[];
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if g.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;
  if g.version <> p_expected_version then raise exception 'STALE_VERSION'; end if;

  mover := g.turn;
  if public._seat_of(g, p_user_id) is distinct from mover then raise exception 'NOT_YOUR_TURN'; end if;
  if now() < g.turn_started_at then raise exception 'GAME_NOT_STARTED'; end if;

  c := public._settled_clock(g);

  -- Flagged before the move arrived → loss on time, move discarded.
  if g.initial_time_ms > 0 and c[mover + 1] <= 0 then
    update public.games set
      status = 'finished', winner = 1 - mover, end_reason = 'timeout',
      clock_ms = c, finished_at = now(), version = version + 1, updated_at = now()
    where id = g.id returning * into g;
    return g;
  end if;

  if g.initial_time_ms > 0 and not p_is_winning then
    c[mover + 1] := c[mover + 1] + g.increment_ms;   -- Fischer increment
  end if;

  insert into public.game_moves (game_id, ply, player, move, notation, clock_after_ms)
  values (g.id, g.move_count + 1, mover, p_move, p_notation,
          case when g.initial_time_ms > 0 then c[mover + 1] end);

  update public.games set
    state           = p_new_state,
    last_move       = p_move,
    move_count      = move_count + 1,
    version         = version + 1,
    clock_ms        = c,
    turn            = case when p_is_winning then turn else 1 - turn end,
    turn_started_at = now(),
    status          = case when p_is_winning then 'finished' else status end,
    winner          = case when p_is_winning then mover end,
    end_reason      = case when p_is_winning then 'goal' end,
    finished_at     = case when p_is_winning then now() end,
    updated_at      = now()
  where id = g.id returning * into g;

  return g;
end $$;


-- Optional housekeeping: delete lobbies nobody joined and very old games.
-- Run manually, or schedule it with pg_cron (see bottom of file).
create function public.cleanup_stale_games()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.games
   where (status in ('waiting', 'abandoned') and created_at < now() - interval '1 day')
      or (status = 'finished' and finished_at < now() - interval '30 days');
  get diagnostics n = row_count;
  return n;
end $$;


-- ---------------------------------------------------------------------
-- 6. Function permissions
--    (Supabase grants EXECUTE to anon/authenticated by default — undo that.)
-- ---------------------------------------------------------------------
revoke all on function public._initial_state(int, int)               from public, anon, authenticated;
revoke all on function public._new_code()                             from public, anon, authenticated;
revoke all on function public._seat_of(public.games, uuid)            from public, anon, authenticated;
revoke all on function public._settled_clock(public.games)            from public, anon, authenticated;
revoke all on function public.cleanup_stale_games()                   from public, anon, authenticated;
revoke all on function public.commit_move(uuid, uuid, int, jsonb, text, jsonb, boolean)
                                                                      from public, anon, authenticated;
grant execute on function public.commit_move(uuid, uuid, int, jsonb, text, jsonb, boolean) to service_role;
grant execute on function public.cleanup_stale_games() to service_role;

revoke all on function public.get_server_time()                            from public, anon;
revoke all on function public.create_game(text, int, int, int, int, text)  from public, anon;
revoke all on function public.join_game(text, text)                        from public, anon;
revoke all on function public.set_ready(uuid, boolean)                     from public, anon;
revoke all on function public.leave_game(uuid)                             from public, anon;
revoke all on function public.resign_game(uuid)                            from public, anon;
revoke all on function public.claim_timeout(uuid)                          from public, anon;
revoke all on function public.request_rematch(uuid)                        from public, anon;

grant execute on function public.get_server_time()                            to authenticated;
grant execute on function public.create_game(text, int, int, int, int, text)  to authenticated;
grant execute on function public.join_game(text, text)                        to authenticated;
grant execute on function public.set_ready(uuid, boolean)                     to authenticated;
grant execute on function public.leave_game(uuid)                             to authenticated;
grant execute on function public.resign_game(uuid)                            to authenticated;
grant execute on function public.claim_timeout(uuid)                          to authenticated;
grant execute on function public.request_rematch(uuid)                        to authenticated;


-- ---------------------------------------------------------------------
-- 7. Realtime — broadcast row changes on games to subscribed clients
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then
  null;  -- already added
end $$;


-- ---------------------------------------------------------------------
-- 8. (Optional) nightly cleanup with pg_cron
--    Enable first: Dashboard → Database → Extensions → pg_cron
--    Then uncomment and run:
-- ---------------------------------------------------------------------
-- select cron.schedule('quoridor-cleanup', '0 3 * * *', $$select public.cleanup_stale_games()$$);
