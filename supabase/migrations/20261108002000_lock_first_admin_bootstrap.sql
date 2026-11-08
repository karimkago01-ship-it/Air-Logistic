-- Serialize first-user bootstrap to prevent two concurrent signups from both becoming admin.
create or replace function public.handle_new_air_logistic_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_role text;
  v_active boolean;
begin
  perform pg_advisory_xact_lock(hashtext('air-logistic-first-admin-bootstrap'));
  select id into v_workspace_id from public.workspaces where slug = 'air-logistic-main' limit 1;
  if v_workspace_id is null then raise exception 'Air Logistic workspace is not configured'; end if;
  if not exists (select 1 from public.profiles) then
    v_role := 'admin'; v_active := true;
  else
    v_role := 'employee'; v_active := false;
  end if;
  insert into public.profiles (user_id,workspace_id,full_name,role,active)
  values (new.id,v_workspace_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),split_part(new.email,'@',1)),
    v_role,v_active)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_air_logistic_user() from public, anon, authenticated;
