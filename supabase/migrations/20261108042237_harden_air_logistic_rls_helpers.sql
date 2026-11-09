create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.my_full_name()
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select full_name from public.profiles
  where user_id = (select auth.uid()) and active = true limit 1;
$$;

create or replace function private.my_role()
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles
  where user_id = (select auth.uid()) and active = true limit 1;
$$;

create or replace function private.my_workspace_id()
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select workspace_id from public.profiles
  where user_id = (select auth.uid()) and active = true limit 1;
$$;

revoke all on function private.my_full_name() from public, anon;
revoke all on function private.my_role() from public, anon;
revoke all on function private.my_workspace_id() from public, anon;
grant execute on function private.my_full_name() to authenticated;
grant execute on function private.my_role() to authenticated;
grant execute on function private.my_workspace_id() to authenticated;

revoke all on function public.my_full_name() from public, anon, authenticated;
revoke all on function public.my_role() from public, anon, authenticated;
revoke all on function public.my_workspace_id() from public, anon, authenticated;

drop policy if exists profile_admin_insert on public.profiles;
create policy profile_admin_insert on public.profiles
for insert to authenticated
with check (workspace_id = (select private.my_workspace_id()) and (select private.my_role()) = 'admin');

drop policy if exists profile_admin_update on public.profiles;
create policy profile_admin_update on public.profiles
for update to authenticated
using (workspace_id = (select private.my_workspace_id()) and (select private.my_role()) = 'admin')
with check (workspace_id = (select private.my_workspace_id()) and (select private.my_role()) = 'admin');

drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    workspace_id = (select private.my_workspace_id())
    and (select private.my_role()) in ('admin','manager')
  )
);

drop policy if exists workspace_read on public.workspaces;
create policy workspace_read on public.workspaces
for select to authenticated
using (id = (select private.my_workspace_id()));

drop policy if exists records_delete on public.app_records;
create policy records_delete on public.app_records
for delete to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin','manager')
);

drop policy if exists records_insert on public.app_records;
create policy records_insert on public.app_records
for insert to authenticated
with check (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin','manager','employee')
);

drop policy if exists records_read on public.app_records;
create policy records_read on public.app_records
for select to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (
    (select private.my_role()) in ('admin','manager','employee')
    or (
      (select private.my_role()) = 'courier'
      and collection = 'shipments'
      and data ->> 'agent' = (select private.my_full_name())
    )
  )
);

drop policy if exists records_update on public.app_records;
create policy records_update on public.app_records
for update to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (
    (select private.my_role()) in ('admin','manager','employee')
    or (
      (select private.my_role()) = 'courier'
      and collection = 'shipments'
      and data ->> 'agent' = (select private.my_full_name())
    )
  )
)
with check (
  workspace_id = (select private.my_workspace_id())
  and (
    (select private.my_role()) in ('admin','manager','employee')
    or (
      (select private.my_role()) = 'courier'
      and collection = 'shipments'
      and data ->> 'agent' = (select private.my_full_name())
    )
  )
);

drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log
for insert to authenticated
with check (
  workspace_id = (select private.my_workspace_id())
  and actor_id = (select auth.uid())
);

drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log
for select to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin','manager')
);

