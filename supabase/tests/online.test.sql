begin;
select plan(30);

-- Two players arrive (the auth trigger builds their profile + empty save).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test', '{"full_name": "Ana Popescu"}'),
  ('22222222-2222-2222-2222-222222222222', 'bo@test', '{"name": "<b>"}'),
  ('33333333-3333-3333-3333-333333333333', 'cy@test', '{"display_name": "Cy"}');

select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Ana', 'Google full name becomes first name only');
select matches((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), '^Diver[0-9]{4}$', 'markup-only names fall back to DiverNNNN');
select matches((select friend_code from public.profiles where id = '11111111-1111-1111-1111-111111111111'), '^[A-Z2-9]{6}$', 'friend code is 6 unambiguous characters');
select is((select count(*)::int from public.player_data), 3, 'every account gets a cloud save row');

select set_config('t.ana', (select friend_code from public.profiles where id = '11111111-1111-1111-1111-111111111111'), false);
select set_config('t.bo', (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), false);
select set_config('t.cy', (select friend_code from public.profiles where id = '33333333-3333-3333-3333-333333333333'), false);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true), set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ---------- Anonymous visitors get nothing ----------
set local role anon;
select throws_ok($$ select public.get_me() $$, '42501', null, 'anon cannot call get_me');
select throws_ok($$ select * from public.leaderboard('deepest') $$, '42501', null, 'anon cannot read leaderboards');
select throws_ok($$ select * from public.player_data $$, '42501', null, 'anon cannot read saves');
reset role;

-- ---------- Ana syncs ----------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((public.get_me() ->> 'display_name'), 'Ana', 'get_me returns your profile');
select is((public.sync_player('{"money": 50, "caught": 3}', '{"achievements": ["first_catch"], "deepest": 140, "totalCaught": 3}', 0) ->> 'status'), 'ok', 'first sync from rev 0 is accepted');
select is((public.get_me() ->> 'rev')::int, 1, 'rev bumps on a run write');
select is((public.get_me() -> 'save' ->> 'money')::int, 50, 'the run is stored');
select throws_ok($$ select * from public.player_data $$, '42501', null, 'saves are not directly readable, even your own');
select throws_ok($$ select friend_code from public.profiles $$, '42501', null, 'friend codes are not directly readable');
select lives_ok($$ select display_name from public.profiles $$, 'display names are readable when signed in');

-- A second device that never saw rev 1 tries to write: conflict, but its record still merges.
select is((public.sync_player('{"money": 9}', '{"achievements": ["die_drown"], "deepest": 90, "totalCaught": 1}', 0) ->> 'status'), 'conflict', 'stale device gets a conflict');
select is((public.get_me() -> 'save' ->> 'money')::int, 50, 'conflict does not overwrite the run');
select ok((public.get_me() -> 'record' -> 'achievements') @> '["first_catch", "die_drown"]', 'records merge on conflict too');
select is((public.get_me() -> 'record' ->> 'deepest')::numeric, 140::numeric, 'merge keeps the deeper dive');
select is((public.sync_player('{"money": 9}', '{}', 0, true) ->> 'status'), 'ok', 'forced write wins after the player chose this device');
select ok((public.get_me() -> 'record' -> 'achievements') @> '["first_catch", "die_drown"]', 'an empty record never erases achievements');

-- Impossible values are clamped.
select public.sync_player('{}', '{"deepest": 99999, "bestEnding": 12, "totalCaught": -5}', 2);
select is((public.get_me() -> 'record' ->> 'deepest')::numeric, 620::numeric, 'depth clamps to the trench floor');
select is(public.get_me() -> 'record' -> 'bestEnding', 'null'::jsonb, 'an impossible 12 s ending is dropped');
select throws_ok($$ select public.sync_player(('{"x": "' || repeat('a', 30000) || '"}')::jsonb, '{}', 3) $$, 'P0001', 'invalid save', 'oversized saves are rejected');

-- ---------- Friends ----------
select throws_ok($$ select public.add_friend(current_setting('t.ana')) $$, 'P0001', 'that is your own code', 'cannot friend yourself');
select throws_ok($$ select public.add_friend('ZZZZZZ') $$, 'P0002', 'no diver has that code', 'unknown code is a clear error');
select is((public.add_friend(lower(current_setting('t.cy'))) ->> 'display_name'), 'Cy', 'add a friend by code (case-insensitive)');
select is((select count(*)::int from public.list_friends()), 1, 'friend appears in your list');

-- ---------- Leaderboards ----------
reset role;
update public.player_data set deepest = 300 where user_id = '22222222-2222-2222-2222-222222222222';
update public.player_data set deepest = 200, best_ending = 1900 where user_id = '33333333-3333-3333-3333-333333333333';
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select results_eq($$ select display_name from public.leaderboard('deepest', 'global') order by rank $$,
  $$ values ('Ana'::text), (current_setting('t.bo')), ('Cy') $$, 'global deepest ranks everyone, deepest first');
select results_eq($$ select display_name from public.leaderboard('deepest', 'friends') order by rank $$,
  $$ values ('Ana'::text), ('Cy') $$, 'friends board is just you and your friends');
select throws_ok($$ select * from public.leaderboard('money; drop table x', 'global') $$, 'P0001', null, 'unknown metrics are refused');

select * from finish();
rollback;
