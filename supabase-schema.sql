-- Tomicart Supabase schema
-- Paste this into your Supabase project's SQL editor and run once.

-- Everyone identifies with just a nickname (no auth). The nickname is
-- stored client-side in localStorage and passed with every write. Nothing
-- personal — treat it as a display handle.

-- ---------- players ----------
-- Registry of taken nicknames. Nicknames are unique case-insensitively so
-- "Adrian" and "adrian" can't both exist. Ownership checks are still
-- best-effort without real auth — a determined user can lie about their
-- nickname in requests. Flip on Supabase Auth if that becomes a problem.
create table if not exists public.players (
  nickname text primary key,
  created_at timestamptz not null default now()
);

create unique index if not exists players_nickname_lower_idx
  on public.players (lower(nickname));

-- ---------- levels ----------
create table if not exists public.levels (
  id text primary key,
  data jsonb not null,
  author_nickname text not null,
  plays integer not null default 0,
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists levels_created_at_idx
  on public.levels (created_at desc);

-- ---------- scores ----------
-- level_id is a plain string, NOT a foreign key. Built-in levels (Rollercoaster,
-- Endless, …) never get upserted into the levels table, so an FK here would
-- silently reject every score on a built-in. Orphan scores (level was deleted)
-- just don't get read.
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  level_id text not null,
  player_nickname text not null,
  score integer not null,
  created_at timestamptz not null default now()
);

create index if not exists scores_level_score_idx
  on public.scores (level_id, score desc);

-- ---------- likes ----------
-- Same story as scores: level_id is a plain string so built-ins can be liked.
create table if not exists public.likes (
  level_id text not null,
  player_nickname text not null,
  created_at timestamptz not null default now(),
  primary key (level_id, player_nickname)
);

-- Keep the denormalized counters on `levels` in sync so we can sort
-- without expensive aggregations at read time.
create or replace function public.bump_likes()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.levels set likes = likes + 1 where id = new.level_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.levels set likes = greatest(likes - 1, 0) where id = old.level_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists likes_bump on public.likes;
create trigger likes_bump
  after insert or delete on public.likes
  for each row execute procedure public.bump_likes();

-- Plays counter: bumped by the client each time a Play button is clicked
-- via a direct update. (No trigger; scores can be legitimately created
-- without a corresponding play, and vice versa.)

-- ---------- RLS ----------
alter table public.players enable row level security;
alter table public.levels enable row level security;
alter table public.scores enable row level security;
alter table public.likes enable row level security;

drop policy if exists players_read on public.players;
create policy players_read on public.players for select using (true);
drop policy if exists players_insert on public.players;
create policy players_insert on public.players for insert with check (true);
-- No update / delete policy on players — nicknames aren't reclaimable.

-- Anyone with the anon key can read everything and write anything —
-- this is the wide-open dev policy. Tighten later if abuse shows up.
drop policy if exists levels_read on public.levels;
create policy levels_read on public.levels for select using (true);
drop policy if exists levels_write on public.levels;
create policy levels_write on public.levels for all using (true) with check (true);

drop policy if exists scores_read on public.scores;
create policy scores_read on public.scores for select using (true);
drop policy if exists scores_write on public.scores;
create policy scores_write on public.scores for insert with check (true);

drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes for select using (true);
drop policy if exists likes_write on public.likes;
create policy likes_write on public.likes for all using (true) with check (true);
