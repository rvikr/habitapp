begin;

select plan(14);

select has_function(
  'public',
  'get_completion_stats',
  array[]::name[],
  'owner-scoped completion stats exist'
);
select ok(
  to_regprocedure('public.get_leaderboard(text)') is null,
  'legacy get_leaderboard RPC is absent'
);
select ok(
  not has_function_privilege('anon', 'public.get_completion_stats()', 'execute'),
  'anonymous callers cannot execute get_completion_stats'
);
select ok(
  has_function_privilege('authenticated', 'public.get_completion_stats()', 'execute'),
  'authenticated callers may execute get_completion_stats'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_leaderboard_entries(text,integer,uuid)',
    'execute'
  ),
  'anonymous callers cannot execute leaderboard entries'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_leaderboard_entries(text,integer,uuid)',
    'execute'
  ),
  'authenticated callers cannot execute leaderboard entries'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_leaderboard_entries(text,integer,uuid)',
    'execute'
  ),
  'service role may execute leaderboard entries'
);
select ok(
  not has_function_privilege('anon', 'public.get_leaderboard_position(uuid,text)', 'execute'),
  'anonymous callers cannot execute leaderboard position'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_leaderboard_position(uuid,text)',
    'execute'
  ),
  'authenticated callers cannot execute leaderboard position'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_leaderboard_position(uuid,text)',
    'execute'
  ),
  'service role may execute leaderboard position'
);

insert into auth.users (
  id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('10000000-0000-4000-8000-000000000021', 'authenticated', 'authenticated', 'credit-a@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'credit-b@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles
set display_name = case user_id
  when '10000000-0000-4000-8000-000000000021' then 'Credit A'
  else 'Credit B'
end
where user_id in (
  '10000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000022'
);

insert into public.habits (id, user_id, name, target, unit) values
  ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', 'Partial target', 100, 'pages'),
  ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000021', 'Hit target', 100, 'pages'),
  ('20000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000021', 'Targetless', null, null),
  ('20000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000022', 'Other owner', 100, 'pages');

insert into public.habit_completions (habit_id, user_id, completed_on, value) values
  ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', '2026-07-08', 40),
  ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000021', '2026-07-09', 100),
  ('20000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000021', '2026-07-10', 1),
  ('20000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000022', '2026-07-11', 100);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000021","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select ok(
  not '2026-07-08'::date = any(
    (select completion_dates from public.get_completion_stats())
  ),
  'partial positive-target row receives no completion credit'
);
select is(
  (select total_completions from public.get_completion_stats()),
  2::bigint,
  'target-hit and targetless rows receive completion credit'
);
select is(
  (select completion_dates from public.get_completion_stats()),
  array['2026-07-10'::date, '2026-07-09'::date],
  'get_completion_stats is scoped to the authenticated owner'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select is(
  (
    select total_completions
    from public.get_leaderboard_entries(
      'all',
      50,
      '10000000-0000-4000-8000-000000000021'
    )
    where user_id = '10000000-0000-4000-8000-000000000021'
  ),
  2::integer,
  'service leaderboard credit is target-aware'
);

reset role;
select * from finish();
rollback;
