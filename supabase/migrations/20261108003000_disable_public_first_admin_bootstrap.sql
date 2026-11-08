-- Critical security hardening: never let an arbitrary public sign-up become admin.
create or replace function public.handle_new_air_logistic_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select id into v_workspace_id
  from public.workspaces
  where slug = 'air-logistic-main'
  limit 1;
  if v_workspace_id is null then raise exception 'Air Logistic workspace is not configured'; end if;

  insert into public.profiles (user_id,workspace_id,full_name,role,active)
  values (
    new.id,
    v_workspace_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),split_part(new.email,'@',1)),
    'employee',
    false
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_air_logistic_user() from public, anon, authenticated;
