drop policy if exists "sleep_entries: owner read" on public.sleep_entries;
create policy "sleep_entries: owner read"
  on public.sleep_entries for select
  using ((select auth.uid()) = user_id);

drop policy if exists "sleep_entries: owner insert" on public.sleep_entries;
create policy "sleep_entries: owner insert"
  on public.sleep_entries for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "sleep_entries: owner update" on public.sleep_entries;
create policy "sleep_entries: owner update"
  on public.sleep_entries for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "sleep_entries: owner delete" on public.sleep_entries;
create policy "sleep_entries: owner delete"
  on public.sleep_entries for delete
  using ((select auth.uid()) = user_id);
