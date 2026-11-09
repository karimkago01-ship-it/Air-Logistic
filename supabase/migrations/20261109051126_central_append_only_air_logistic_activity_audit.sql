
-- Central, append-only audit trail for every business record change.
create or replace function private.log_air_logistic_record_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_workspace_id uuid;
  v_actor_id uuid;
  v_collection text;
  v_record_id text;
  v_old_data jsonb;
  v_new_data jsonb;
  v_details jsonb;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_workspace_id := old.workspace_id;
    v_collection := old.collection;
    v_record_id := old.record_id;
    v_old_data := old.data;
    v_actor_id := auth.uid();
    if v_actor_id is null then v_actor_id := old.updated_by; end if;
  else
    v_workspace_id := new.workspace_id;
    v_collection := new.collection;
    v_record_id := new.record_id;
    v_new_data := new.data;
    v_actor_id := auth.uid();
    if v_actor_id is null then v_actor_id := new.updated_by; end if;
    if tg_op = 'UPDATE' then
      v_old_data := old.data;
      if old.data is not distinct from new.data then
        return new;
      end if;
    end if;
  end if;

  if v_actor_id is null or not exists (
    select 1 from public.profiles p
    where p.user_id = v_actor_id
      and p.workspace_id = v_workspace_id
      and p.active = true
  ) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_action := 'record_' || lower(tg_op);
  v_details := jsonb_build_object(
    'operation', lower(tg_op),
    'collection', v_collection,
    'record_id', v_record_id
  );

  if v_collection = 'shipments' then
    v_details := v_details || jsonb_build_object(
      'shipment_id', coalesce(v_new_data->>'id', v_old_data->>'id', v_record_id),
      'status_before', v_old_data->>'status',
      'status_after', v_new_data->>'status',
      'agent_before', v_old_data->>'agent',
      'agent_after', v_new_data->>'agent',
      'courier_user_id_before', v_old_data->>'courier_user_id',
      'courier_user_id_after', v_new_data->>'courier_user_id'
    );
  end if;

  insert into public.activity_log (workspace_id, actor_id, action, details)
  values (v_workspace_id, v_actor_id, v_action, v_details);

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

revoke all on function private.log_air_logistic_record_activity() from public, anon, authenticated;

drop trigger if exists air_logistic_record_audit on public.app_records;
create trigger air_logistic_record_audit
after insert or update of data or delete on public.app_records
for each row execute function private.log_air_logistic_record_activity();

-- Clients cannot forge, edit, or erase the server-generated audit trail.
drop policy if exists activity_insert on public.activity_log;
revoke insert, update, delete on public.activity_log from anon, authenticated;
