-- Stack Arena leaderboard: run once in the Supabase SQL editor.
-- Anyone can read the boards; a signed-in player can only write their own
-- name and their own results, and each match (seed) counts once per player.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.results (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mode text not null check (mode in ('bots', 'online')),
  level text check (level in ('easy', 'normal', 'hard')), -- the hardest bot in the lobby, for bot games
  players int not null check (players between 2 and 8),
  placement int not null check (placement between 1 and players),
  char_id text not null check (char_length(char_id) <= 30),
  seed bigint not null,
  rounds int not null check (rounds between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, seed)
);

alter table public.profiles enable row level security;
alter table public.results enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "add your own profile" on public.profiles;
create policy "add your own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "rename your own profile" on public.profiles;
create policy "rename your own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "results are public" on public.results;
create policy "results are public" on public.results for select using (true);
drop policy if exists "add your own results" on public.results;
create policy "add your own results" on public.results for insert to authenticated with check (user_id = auth.uid());

grant select on public.profiles, public.results to anon, authenticated;
grant insert, update (name) on public.profiles to authenticated;
grant insert (mode, level, players, placement, char_id, seed, rounds) on public.results to authenticated;

-- One row per player and board. "beaten" is how many gladiators they
-- finished ahead of, summed over their matches: a 1v1 win is 1, winning an
-- 8-player match is 7.
create or replace view public.leaderboard with (security_invoker = true) as
select p.name, r.mode, r.level,
       count(*)::int as games,
       count(*) filter (where r.placement = 1)::int as wins,
       sum(r.players - r.placement)::int as beaten,
       round(avg(r.placement), 2) as avg_place
from public.results r
join public.profiles p on p.id = r.user_id
group by p.id, p.name, r.mode, r.level;

grant select on public.leaderboard to anon, authenticated;
