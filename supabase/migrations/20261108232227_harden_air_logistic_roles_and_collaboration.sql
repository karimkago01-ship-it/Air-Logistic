-- Air Logistic production hardening and collaboration tables.
-- Existing business records are preserved; no data is deleted.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  room_key text not null default 'general',
  message text not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_workspace_room_created_idx
  on public.chat_messages (workspace_id, room_key, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '' check (char_length(body) <= 2000),
  link text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

create index if not exists app_records_courier_user_idx
  on public.app_records ((data ->> 'courier_user_id'))
  where collection = 'shipments';

alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;

-- Remove broad default table grants, especially the anonymous role.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

grant select on public.workspaces to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.app_records to authenticated;
grant select, insert on public.activity_log to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select, insert on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Profiles: only the admin role can provision or change team accounts.
drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    workspace_id = (select private.my_workspace_id())
    and (select private.my_role()) in ('admin', 'manager')
  )
);

drop policy if exists profile_admin_insert on public.profiles;
create policy profile_admin_insert on public.profiles
for insert to authenticated
with check (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) = 'admin'
);

drop policy if exists profile_admin_update on public.profiles;
create policy profile_admin_update on public.profiles
for update to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) = 'admin'
)
with check (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) = 'admin'
);

-- Workspace data: employees perform operations; couriers are scoped by immutable Auth user ID.
drop policy if exists records_read on public.app_records;
create policy records_read on public.app_records
for select to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (
    (select private.my_role()) in ('admin', 'manager', 'employee')
    or (
      (select private.my_role()) = 'courier'
      and collection = 'shipments'
      and data ->> 'courier_user_id' = (select auth.uid())::text
    )
  )
);

drop policy if exists records_insert on public.app_records;
create policy records_insert on public.app_records
for insert to authenticated
with check (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin', 'manager', 'employee')
);

drop policy if exists records_update on public.app_records;
create policy records_update on public.app_records
for update to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (
    (select private.my_role()) in ('admin', 'manager', 'employee')
    or (
      (select private.my_role()) = 'courier'
      and collection = 'shipments'
      and data ->> 'courier_user_id' = (select auth.uid())::text
    )
  )
)
with check (
  workspace_id = (select private.my_workspace_id())
  and (
    (select private.my_role()) in ('admin', 'manager', 'employee')
    or (
      (select private.my_role()) = 'courier'
      and collection = 'shipments'
      and data ->> 'courier_user_id' = (select auth.uid())::text
    )
  )
);

drop policy if exists records_delete on public.app_records;
create policy records_delete on public.app_records
for delete to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin', 'manager')
);

-- Team activity is visible to active workspace members; each member can log only their own action.
drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log
for select to authenticated
using (workspace_id = (select private.my_workspace_id()));

drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log
for insert to authenticated
with check (
  workspace_id = (select private.my_workspace_id())
  and actor_id = (select auth.uid())
);

-- Workspace chat: members can read and send; only the sender identity can be used.
drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages
for select to authenticated
using (workspace_id = (select private.my_workspace_id()));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
for insert to authenticated
with check (
  workspace_id = (select private.my_workspace_id())
  and sender_id = (select auth.uid())
);

-- Notifications are private to their recipient. Admin/manager can issue notifications.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
for select to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and recipient_id = (select auth.uid())
);

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
for insert to authenticated
with check (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin', 'manager')
);

drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
for update to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and recipient_id = (select auth.uid())
)
with check (
  workspace_id = (select private.my_workspace_id())
  and recipient_id = (select auth.uid())
);

-- Enable live updates for collaboration and team activity.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;

