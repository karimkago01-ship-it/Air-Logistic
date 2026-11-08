-- Air Logistic secure employee authentication bootstrap
-- First registered Auth user becomes the initial administrator.
-- All later users are created as inactive employees until approved by admin.

create or replace function public.handle_new_air_logistic_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_role text;
  v_active boolean;
begin
  select id into v_workspace_id
  from public.workspaces
  where slug = 'air-logistic-main'
  limit 1;

  if v_workspace_id is null then
    raise exception 'Air Logistic workspace is not configured';
  end if;

  if not exists (select 1 from public.profiles) then
    v_role := 'admin';
    v_active := true;
  else
    v_role := 'employee';
    v_active := false;
  end if;

  insert into public.profiles (user_id, workspace_id, full_name, role, active)
  values (
    new.id,
    v_workspace_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    v_role,
    v_active
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_air_logistic_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_air_logistic on auth.users;
create trigger on_auth_user_created_air_logistic
after insert on auth.users
for each row execute function public.handle_new_air_logistic_user();

revoke all on function public.my_full_name() from public, anon;
revoke all on function public.my_role() from public, anon;
revoke all on function public.my_workspace_id() from public, anon;

grant execute on function public.my_full_name() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_workspace_id() to authenticated;

create index if not exists profiles_workspace_id_idx on public.profiles(workspace_id);
create index if not exists app_records_created_by_idx on public.app_records(created_by);
create index if not exists app_records_updated_by_idx on public.app_records(updated_by);
create index if not exists activity_log_actor_id_idx on public.activity_log(actor_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_records'
  ) then
    alter publication supabase_realtime add table public.app_records;
  end if;
end $$;
