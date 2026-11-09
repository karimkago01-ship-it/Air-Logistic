create or replace function private.notify_air_logistic_shipment_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid;
  v_status_changed boolean := false;
  v_agent_changed boolean := false;
  v_title text;
  v_body text;
  v_event text;
  v_shipment_id text;
  v_status text;
  v_agent text;
begin
  if new.collection <> 'shipments' then return new; end if;

  v_actor := coalesce(new.updated_by, auth.uid());
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.user_id = v_actor and p.workspace_id = new.workspace_id and p.active = true
  ) then return new; end if;

  v_shipment_id := coalesce(new.data->>'id', new.record_id, 'غير محدد');
  v_status := nullif(new.data->>'status', '');
  v_agent := nullif(new.data->>'agent', '');

  if tg_op = 'INSERT' then
    v_event := 'shipment_created';
    v_title := 'شحنة جديدة';
    v_body := 'تم إنشاء الشحنة رقم ' || v_shipment_id ||
      case when v_agent is not null then ' وإسنادها إلى ' || v_agent else '' end || '.';
  else
    v_status_changed := (old.data->>'status') is distinct from (new.data->>'status');
    v_agent_changed := (old.data->>'agent') is distinct from (new.data->>'agent');
    if not v_status_changed and not v_agent_changed then return new; end if;

    if v_status_changed and v_agent_changed then
      v_event := 'shipment_status_and_assignment_changed';
      v_title := 'تحديث وإسناد شحنة';
      v_body := 'تم تحديث حالة الشحنة رقم ' || v_shipment_id ||
        ' إلى ' || coalesce(v_status, 'غير محددة') ||
        ' وإسنادها إلى ' || coalesce(v_agent, 'بدون مندوب') || '.';
    elsif v_status_changed then
      v_event := 'shipment_status_changed';
      v_title := case when v_status = 'تم التسليم' then 'تم تسليم الشحنة'
        when v_status = 'مرتجع' then 'تم تسجيل شحنة مرتجعة'
        else 'تحديث حالة الشحنة' end;
      v_body := 'الشحنة رقم ' || v_shipment_id ||
        ' أصبحت في حالة: ' || coalesce(v_status, 'غير محددة') || '.';
    else
      v_event := 'shipment_assigned';
      v_title := 'إسناد شحنة لمندوب';
      v_body := 'تم إسناد الشحنة رقم ' || v_shipment_id ||
        ' إلى ' || coalesce(v_agent, 'بدون مندوب') || '.';
    end if;
  end if;

  insert into public.notifications (workspace_id, recipient_id, title, body, payload)
  select new.workspace_id, p.user_id, v_title, v_body,
    jsonb_build_object('kind',v_event,'shipment_id',v_shipment_id,'status',v_status,'agent',v_agent)
  from public.profiles p
  where p.workspace_id = new.workspace_id and p.active = true and p.user_id <> v_actor
    and (
      (v_event = 'shipment_created' and
        (p.role in ('admin','manager') or (v_agent is not null and p.full_name = v_agent)))
      or v_event in ('shipment_status_changed','shipment_status_and_assignment_changed')
      or (v_event = 'shipment_assigned' and
        (p.role in ('admin','manager') or (v_agent is not null and p.full_name = v_agent)))
    );
  return new;
end;
$function$;
revoke all on function private.notify_air_logistic_shipment_events() from public, anon, authenticated;
