create table if not exists public.app_diagnostics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  message text not null check (char_length(message) between 1 and 700),
  page text not null default '' check (char_length(page) <= 120),
  route text not null default '' check (char_length(route) <= 180),
  app_version text not null default '' check (char_length(app_version) <= 80),
  created_at timestamptz not null default now(),
  constraint app_diagnostics_owner_only check (user_id = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid)
);

create index if not exists app_diagnostics_created_at_idx
  on public.app_diagnostics (created_at desc);

alter table public.app_diagnostics enable row level security;
revoke all on public.app_diagnostics from anon, authenticated;
grant select, insert on public.app_diagnostics to authenticated;

drop policy if exists app_diagnostics_owner_read on public.app_diagnostics;
create policy app_diagnostics_owner_read
  on public.app_diagnostics for select to authenticated
  using (
    auth.uid() = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid
    and user_id = auth.uid()
    and workspace_id = (select private.my_workspace_id())
  );

drop policy if exists app_diagnostics_owner_insert on public.app_diagnostics;
create policy app_diagnostics_owner_insert
  on public.app_diagnostics for insert to authenticated
  with check (
    auth.uid() = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid
    and user_id = auth.uid()
    and workspace_id = (select private.my_workspace_id())
  );