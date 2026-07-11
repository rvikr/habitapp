begin;

select plan(19);

select has_table(
  'app_private',
  'completion_increment_receipts',
  'completion receipts live outside the exposed schema'
);
select has_function(
  'public',
  'log_habit_completion_once',
  array['uuid', 'uuid', 'date', 'numeric', 'text']::name[],
  'the authenticated idempotent completion RPC exists'
);
select has_function(
  'app_private',
  'log_habit_completion_once',
  array['uuid', 'uuid', 'date', 'numeric', 'text']::name[],
  'the privileged worker remains private'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.log_habit_completion_once(uuid,uuid,date,numeric,text)',
    'execute'
  ),
  'authenticated callers may execute the public wrapper'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.log_habit_completion_once(uuid,uuid,date,numeric,text)',
    'execute'
  ),
  'anonymous callers cannot execute the completion RPC'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'app_private.completion_increment_receipts',
    'select'
  ),
  'authenticated callers cannot read private receipts directly'
);
select ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage'),
  'authenticated callers cannot use the private schema'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.log_habit_completion_once(uuid,uuid,date,numeric,text)',
    'execute'
  ),
  'authenticated callers cannot execute the private worker'
);

insert into auth.users (
  id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('10000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'idempotency-a@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'idempotency-b@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.habits (id, user_id, name, target, unit) values
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'Existing quantity', 100, 'ml'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000012', 'Another owner', 100, 'ml');

insert into public.habit_completions (habit_id, user_id, completed_on, value)
values (
  '20000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  '2026-07-11',
  40
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  public.log_habit_completion_once(
    '30000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '2026-07-11',
    20,
    null
  ),
  true,
  'the first operation is applied'
);
select is(
  (select value from public.habit_completions
   where habit_id = '20000000-0000-4000-8000-000000000011'
     and completed_on = '2026-07-11'),
  60::numeric,
  'existing progress is incremented exactly once'
);
select is(
  public.log_habit_completion_once(
    '30000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '2026-07-11',
    20,
    null
  ),
  false,
  'the same operation is a no-op'
);
select is(
  (select value from public.habit_completions
   where habit_id = '20000000-0000-4000-8000-000000000011'
     and completed_on = '2026-07-11'),
  60::numeric,
  'a replay leaves the value unchanged'
);
select throws_ok(
  $$select public.log_habit_completion_once(
    '30000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '2026-07-11',
    21,
    null
  )$$,
  '22023',
  'idempotency key reused with different payload',
  'the same key with a different payload is rejected'
);
select is(
  (select value from public.habit_completions
   where habit_id = '20000000-0000-4000-8000-000000000011'
     and completed_on = '2026-07-11'),
  60::numeric,
  'a rejected payload mismatch cannot change progress'
);
select throws_ok(
  $$select public.log_habit_completion_once(
    '30000000-0000-4000-8000-000000000012',
    '20000000-0000-4000-8000-000000000012',
    '2026-07-11',
    20,
    null
  )$$,
  '42501',
  'habit does not belong to authenticated user',
  'a cross-owner habit is rejected'
);
select throws_ok(
  $$select public.log_habit_completion_once(
    '30000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000011',
    '2026-07-11',
    0,
    null
  )$$,
  '22023',
  'completion increment must be positive and finite',
  'a zero increment is rejected'
);
select throws_ok(
  $$select public.log_habit_completion_once(
    '30000000-0000-4000-8000-000000000014',
    '20000000-0000-4000-8000-000000000011',
    null,
    20,
    null
  )$$,
  '22023',
  'completion date is required',
  'a missing date is rejected before a receipt is committed'
);

reset role;

select is(
  (select count(*) from app_private.completion_increment_receipts),
  1::bigint,
  'only the successful operation has a receipt'
);
select is(
  (select count(*) from app_private.completion_increment_receipts
   where operation_id = '30000000-0000-4000-8000-000000000014'),
  0::bigint,
  'a failed mutation leaves no receipt'
);

select * from finish();
rollback;
