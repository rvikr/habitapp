begin;

select plan(36);

select has_column(
  'public',
  'feature_flags',
  'rollout_percentage',
  'feature flags expose a rollout percentage'
);
select has_check(
  'public',
  'feature_flags',
  'feature flag rollout percentage is constrained'
);
select has_column(
  'public',
  'profiles',
  'first_habit_logged_at',
  'profiles track the first positive log'
);
select has_column(
  'public',
  'profiles',
  'activation_engaged_at',
  'profiles track activation engagement'
);
select has_function(
  'app_private',
  'update_activation_milestones',
  array[]::name[],
  'activation milestone trigger function is private'
);
select is(
  (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'update_activation_milestones'
      and p.pronargs = 0
  ),
  true,
  'activation milestone function is SECURITY DEFINER'
);
select is(
  (
    select p.proconfig
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'update_activation_milestones'
      and p.pronargs = 0
  ),
  array['search_path=""']::text[],
  'activation milestone function has exactly an empty search_path'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_namespace as n
    cross join lateral pg_catalog.aclexplode(
      coalesce(n.nspacl, pg_catalog.acldefault('n'::"char", n.nspowner))
    ) as acl
    where n.nspname = 'app_private'
      and acl.grantee = 0
      and acl.privilege_type = 'USAGE'
  ),
  'PUBLIC cannot use the private activation schema'
);
select ok(
  not has_schema_privilege('anon', 'app_private', 'usage'),
  'anonymous callers cannot use the private activation schema'
);
select ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage'),
  'authenticated callers cannot use the private activation schema'
);
select ok(
  not has_schema_privilege('service_role', 'app_private', 'usage'),
  'service-role callers cannot use the private activation schema directly'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
    ) as acl
    where n.nspname = 'app_private'
      and p.proname = 'update_activation_milestones'
      and p.pronargs = 0
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the private activation function'
);
select ok(
  not has_function_privilege(
    'anon',
    'app_private.update_activation_milestones()',
    'execute'
  ),
  'anonymous callers cannot execute the private activation function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.update_activation_milestones()',
    'execute'
  ),
  'authenticated callers cannot execute the private activation function'
);
select ok(
  not has_function_privilege(
    'service_role',
    'app_private.update_activation_milestones()',
    'execute'
  ),
  'service-role callers cannot execute the private activation function directly'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'habit_completions'
      and t.tgname = 'on_habit_completion_update_activation'
      and not t.tgisinternal
  ),
  1::bigint,
  'habit completions have exactly one non-internal activation trigger'
);
select is(
  (
    select pn.nspname || '.' || p.proname
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    join pg_catalog.pg_proc as p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace as pn on pn.oid = p.pronamespace
    where n.nspname = 'public'
      and c.relname = 'habit_completions'
      and t.tgname = 'on_habit_completion_update_activation'
      and not t.tgisinternal
  ),
  'app_private.update_activation_milestones',
  'habit completion activation trigger calls the private milestone function'
);
select is(
  (
    select t.tgtype
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'habit_completions'
      and t.tgname = 'on_habit_completion_update_activation'
      and not t.tgisinternal
  ),
  21::smallint,
  'activation trigger is row-level AFTER INSERT and UPDATE only'
);
select is(
  (
    select t.tgattr::text
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'habit_completions'
      and t.tgname = 'on_habit_completion_update_activation'
      and not t.tgisinternal
  ),
  (
    select a.attnum::text
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.habit_completions'::regclass
      and a.attname = 'value'
      and not a.attisdropped
  ),
  'activation trigger limits UPDATE events to the completion value column'
);
select is(
  (
    select t.tgenabled
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'habit_completions'
      and t.tgname = 'on_habit_completion_update_activation'
      and not t.tgisinternal
  ),
  'O'::"char",
  'activation trigger is enabled for the normal replication role'
);

insert into auth.users (
  id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'activation-a@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'activation-b@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'activation-service@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'activation-zero@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'activation-no-profile@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.habits (id, user_id, name) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Activation one'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Activation two'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Activation three'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Wrong owner'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 'Service role'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', 'Zero value'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', 'No profile');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.habit_completions (habit_id, user_id, completed_on, value)
    values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-07-09', 1)$$,
  'first positive completion is accepted'
);
select ok(
  (select first_habit_logged_at is not null from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  'first positive completion records first_habit_logged_at'
);
select is(
  (select activation_engaged_at from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'first positive completion is not yet engaged'
);

update public.habit_completions
set value = value + 1
where habit_id = '20000000-0000-4000-8000-000000000001'
  and completed_on = '2026-07-09';
select is(
  (select activation_engaged_at from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'repeat same-row update does not reach engagement'
);

insert into public.habit_completions (habit_id, user_id, completed_on, value)
values ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-07-10', 1);
select is(
  (select activation_engaged_at from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'second positive completion is not yet engaged'
);

insert into public.habit_completions (habit_id, user_id, completed_on, value)
values ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '2026-07-11', 1);
select ok(
  (select activation_engaged_at is not null from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  'third positive completion records engagement'
);

delete from public.habit_completions
where habit_id = '20000000-0000-4000-8000-000000000001';
select ok(
  (select activation_engaged_at is not null from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  'delete does not reverse activation engagement'
);

select throws_ok(
  $$insert into public.habit_completions (habit_id, user_id, completed_on, value)
    values ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '2026-07-11', 1)$$,
  '42501',
  'activation milestone owner mismatch',
  'mismatched owner is rejected'
);

insert into public.habit_completions (habit_id, user_id, completed_on, value)
values ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', '2026-07-11', null);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  auth.uid(),
  null::uuid,
  'signed service role has a null auth.uid()'
);
select lives_ok(
  $$insert into public.habit_completions (habit_id, user_id, completed_on, value)
    values ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', '2026-07-11', 1)
    on conflict (habit_id, completed_on) do update set value = excluded.value$$,
  'service-role upsert remains accepted'
);
select ok(
  (select first_habit_logged_at is not null from public.profiles where user_id = '10000000-0000-4000-8000-000000000003'),
  'service-role completion records the milestone'
);

select throws_matching(
  $$insert into public.habit_completions (habit_id, user_id, completed_on, value)
    values ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', '2026-07-11', 0)$$,
  'completions_value_positive',
  'zero completion is rejected by the positive-value constraint'
);
select is(
  (select first_habit_logged_at from public.profiles where user_id = '10000000-0000-4000-8000-000000000004'),
  null::timestamptz,
  'rejected zero completion does not record a milestone'
);

select lives_ok(
  $$insert into public.habit_completions (habit_id, user_id, completed_on, value)
    values ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', '2026-07-10', null)$$,
  'null completion remains accepted'
);
select is(
  (select first_habit_logged_at from public.profiles where user_id = '10000000-0000-4000-8000-000000000004'),
  null::timestamptz,
  'null completion does not record a milestone'
);

delete from public.profiles where user_id = '10000000-0000-4000-8000-000000000005';
select lives_ok(
  $$insert into public.habit_completions (habit_id, user_id, completed_on, value)
    values ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', '2026-07-11', 1)$$,
  'missing profile does not break positive completion logging'
);

select * from finish();
rollback;
