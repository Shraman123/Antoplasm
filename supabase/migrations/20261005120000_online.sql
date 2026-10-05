-- Morrow Lake online: profiles, cloud saves, friends, leaderboards, and access to co-op rooms.
-- The game is client-authoritative, so leaderboards are trust-based; the server clamps impossible
-- values and never lets a sync lose progress (records only ever merge upwards).

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  friend_code text not null unique check (friend_code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

create table public.player_data (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  save jsonb not null default '{}'::jsonb,   -- the current run
  record jsonb not null default '{}'::jsonb, -- lifetime profile: achievements + bests
  rev bigint not null default 0,             -- bumps on every run write, for cross-device conflicts
  deepest real not null default 0,
  best_ending real,
  total_caught integer not null default 0,
  total_earned bigint not null default 0,
  achievements integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index friendships_friend_idx on public.friendships (friend_id);

-- ---------- Access ----------
alter table public.profiles enable row level security;
alter table public.player_data enable row level security;
alter table public.friendships enable row level security;

-- Names are public to signed-in players; friend codes are only readable through get_me().
revoke all on public.profiles from anon, authenticated;
grant select (id, display_name, created_at) on public.profiles to authenticated;
create policy "profiles are visible to signed-in players" on public.profiles for select to authenticated using (true);

-- Saves and friendships only move through the functions below.
revoke all on public.player_data from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;
create policy "see your own friendships" on public.friendships for select to authenticated using (user_id = (select auth.uid()));

-- ---------- Helpers ----------
create function public.clean_name(raw text) returns text
language plpgsql immutable set search_path = '' as $$
declare n text;
begin
  -- First word only (Google gives full names; a leaderboard shouldn't), printable, no markup.
  n := regexp_replace(coalesce(raw, ''), '[[:cntrl:]<>&"''`]', '', 'g');
  n := btrim(regexp_replace(n, '\s+', ' ', 'g'));
  n := left(n, 20);
  if char_length(n) < 2 then
    n := 'Diver' || lpad((floor(random() * 10000))::int::text, 4, '0');
  end if;
  return n;
end $$;

create function public.new_friend_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end $$;

-- Sanitise one lifetime record into the canonical shape with plausible values.
create function public.clean_record(r jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  ach jsonb;
  num_or_zero constant text := '^[0-9]+(\.[0-9]+)?$';
  best real;
begin
  if r is null or jsonb_typeof(r) <> 'object' then r := '{}'::jsonb; end if;
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into ach
  from (
    select value #>> '{}' as v
    from jsonb_array_elements(case when jsonb_typeof(r -> 'achievements') = 'array' then r -> 'achievements' else '[]'::jsonb end)
    where jsonb_typeof(value) = 'string' and char_length(value #>> '{}') between 1 and 40
    limit 100
  ) s;
  best := case when (r ->> 'bestEnding') ~ num_or_zero then (r ->> 'bestEnding')::real end;
  -- Nobody reaches 600 m in under five minutes of dive time.
  if best is not null and best < 300 then best := null; end if;
  return jsonb_build_object(
    'achievements', ach,
    'endings', case when (r ->> 'endings') ~ num_or_zero then least((r ->> 'endings')::numeric, 100000) else 0 end,
    'bestEnding', best,
    'deepest', case when (r ->> 'deepest') ~ num_or_zero then least((r ->> 'deepest')::numeric, 620) else 0 end,
    'totalCaught', case when (r ->> 'totalCaught') ~ num_or_zero then least(floor((r ->> 'totalCaught')::numeric), 10000000) else 0 end,
    'totalEarned', case when (r ->> 'totalEarned') ~ num_or_zero then least(floor((r ->> 'totalEarned')::numeric), 1000000000) else 0 end,
    'updatedAt', case when (r ->> 'updatedAt') ~ num_or_zero then (r ->> 'updatedAt')::numeric else 0 end
  );
end $$;

-- Union of two records: nothing earned on any device is lost.
create function public.merge_record(a jsonb, b jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb := public.clean_record(a);
  y jsonb := public.clean_record(b);
  best real;
begin
  best := case
    when x ->> 'bestEnding' is null then (y ->> 'bestEnding')::real
    when y ->> 'bestEnding' is null then (x ->> 'bestEnding')::real
    else least((x ->> 'bestEnding')::real, (y ->> 'bestEnding')::real) end;
  return jsonb_build_object(
    'achievements', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
      select jsonb_array_elements_text(x -> 'achievements') v union select jsonb_array_elements_text(y -> 'achievements')) s),
    'endings', greatest((x ->> 'endings')::numeric, (y ->> 'endings')::numeric),
    'bestEnding', best,
    'deepest', greatest((x ->> 'deepest')::numeric, (y ->> 'deepest')::numeric),
    'totalCaught', greatest((x ->> 'totalCaught')::numeric, (y ->> 'totalCaught')::numeric),
    'totalEarned', greatest((x ->> 'totalEarned')::numeric, (y ->> 'totalEarned')::numeric),
    'updatedAt', greatest((x ->> 'updatedAt')::numeric, (y ->> 'updatedAt')::numeric)
  );
end $$;

-- ---------- New accounts ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    public.clean_name(split_part(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)),
    public.new_friend_code()
  );
  insert into public.player_data (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- Player API ----------
create function public.get_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'friend_code', p.friend_code,
    'save', d.save, 'record', d.record, 'rev', d.rev)
  from public.profiles p join public.player_data d on d.user_id = p.id
  where p.id = (select auth.uid());
$$;

create function public.set_display_name(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare n text := public.clean_name(p_name);
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  update public.profiles set display_name = n where id = (select auth.uid());
  return n;
end $$;

/* Push this device's run + record. The record always merges. The run is only written when this
   device saw the latest revision (p_base_rev) or p_force is set; otherwise the caller gets
   status 'conflict' and the cloud run, so the player can choose which to keep. */
create function public.sync_player(p_save jsonb, p_record jsonb, p_base_rev bigint, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  cur public.player_data;
  merged jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_save is null or jsonb_typeof(p_save) <> 'object' or octet_length(p_save::text) > 20000 then
    raise exception 'invalid save';
  end if;
  select * into cur from public.player_data where user_id = me for update;
  if not found then raise exception 'no player row'; end if;
  merged := public.merge_record(cur.record, p_record);

  if not p_force and p_base_rev is distinct from cur.rev and cur.save <> '{}'::jsonb then
    update public.player_data set record = merged,
      deepest = (merged ->> 'deepest')::real, best_ending = (merged ->> 'bestEnding')::real,
      total_caught = (merged ->> 'totalCaught')::int, total_earned = (merged ->> 'totalEarned')::bigint,
      achievements = jsonb_array_length(merged -> 'achievements'), updated_at = now()
    where user_id = me;
    return jsonb_build_object('status', 'conflict', 'save', cur.save, 'record', merged, 'rev', cur.rev);
  end if;

  update public.player_data set save = p_save, record = merged, rev = cur.rev + 1,
    deepest = (merged ->> 'deepest')::real, best_ending = (merged ->> 'bestEnding')::real,
    total_caught = (merged ->> 'totalCaught')::int, total_earned = (merged ->> 'totalEarned')::bigint,
    achievements = jsonb_array_length(merged -> 'achievements'), updated_at = now()
  where user_id = me;
  return jsonb_build_object('status', 'ok', 'record', merged, 'rev', cur.rev + 1);
end $$;

-- ---------- Friends ----------
create function public.add_friend(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  them public.profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into them from public.profiles where friend_code = upper(btrim(p_code));
  if not found then raise exception 'no diver has that code' using errcode = 'P0002'; end if;
  if them.id = me then raise exception 'that is your own code' using errcode = 'P0001'; end if;
  if (select count(*) from public.friendships where user_id = me) >= 100 then
    raise exception 'friend list is full' using errcode = 'P0001';
  end if;
  insert into public.friendships (user_id, friend_id) values (me, them.id), (them.id, me) on conflict do nothing;
  return jsonb_build_object('id', them.id, 'display_name', them.display_name);
end $$;

create function public.remove_friend(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.friendships
  where (user_id = (select auth.uid()) and friend_id = p_id) or (user_id = p_id and friend_id = (select auth.uid()));
$$;

create function public.list_friends() returns table (id uuid, display_name text, deepest real, best_ending real, total_caught integer, achievements integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, d.deepest, d.best_ending, d.total_caught, d.achievements
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  join public.player_data d on d.user_id = p.id
  where f.user_id = (select auth.uid())
  order by p.display_name;
$$;

-- ---------- Leaderboards ----------
/* Top p_limit for a metric, plus the caller's own row if they're outside it.
   Fastest ending ranks ascending; everything else descending. Zero/empty values aren't ranked. */
create function public.leaderboard(p_metric text, p_scope text default 'global', p_limit integer default 50)
returns table (rank bigint, user_id uuid, display_name text, value double precision, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  col text;
  dir text;
begin
  if p_metric not in ('deepest', 'best_ending', 'total_caught', 'total_earned', 'achievements') then
    raise exception 'unknown metric %', p_metric;
  end if;
  if p_scope not in ('global', 'friends') then raise exception 'unknown scope %', p_scope; end if;
  col := p_metric;
  dir := case when p_metric = 'best_ending' then 'asc' else 'desc' end;
  return query execute format($q$
    with pool as (
      select d.user_id, p.display_name, d.%1$I::double precision as value
      from public.player_data d join public.profiles p on p.id = d.user_id
      where d.%1$I is not null and d.%1$I > 0
        and ($1 = 'global' or d.user_id = $2 or d.user_id in (select friend_id from public.friendships where friendships.user_id = $2))
    ), ranked as (
      select rank() over (order by value %2$s) as rank, pool.user_id, pool.display_name, pool.value, pool.user_id = $2 as is_me from pool
    )
    select * from ranked where ranked.rank <= $3 or ranked.is_me order by ranked.rank, ranked.display_name limit $3 + 1
  $q$, col, dir) using p_scope, me, least(greatest(p_limit, 1), 100);
end $$;

-- ---------- Function privileges ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_me(), public.set_display_name(text), public.sync_player(jsonb, jsonb, bigint, boolean),
  public.add_friend(text), public.remove_friend(uuid), public.list_friends(), public.leaderboard(text, text, integer)
  to authenticated;

-- ---------- Co-op rooms (Realtime private channels) ----------
-- Signed-in players may join any room by its code, and the shared lobby used for friends' online status.
create policy "signed-in divers can listen in rooms and the lobby" on realtime.messages for select to authenticated
  using ((select realtime.topic()) like 'room:%' or (select realtime.topic()) = 'lobby');
create policy "signed-in divers can talk in rooms and the lobby" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) like 'room:%' or (select realtime.topic()) = 'lobby');
