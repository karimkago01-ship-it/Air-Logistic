create table if not exists public.identity_access_requests (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'requested' check (status in ('requested','approved','rejected','expired')),
 requested_at timestamptz not null default now(),
 reviewer_id uuid references auth.users(id),
 reviewed_at timestamptz,
 expires_at timestamptz,
 rejection_reason text,
 constraint identity_access_review_consistency check (
   (status='requested' and reviewer_id is null and reviewed_at is null and expires_at is null)
   or (status='approved' and reviewer_id is not null and reviewed_at is not null and expires_at is not null)
   or (status in ('rejected','expired') and reviewer_id is not null and reviewed_at is not null)
 )
);
create index if not exists identity_access_requests_workspace_user_idx
 on public.identity_access_requests(workspace_id,user_id,requested_at desc);
alter table public.identity_access_requests enable row level security;
drop policy if exists identity_access_requests_read on public.identity_access_requests;
create policy identity_access_requests_read on public.identity_access_requests
for select to authenticated using (
 user_id=(select auth.uid())
 or (workspace_id=(select private.my_workspace_id()) and (select private.my_role()) in ('admin','manager'))
);
drop policy if exists identity_access_requests_insert_own on public.identity_access_requests;
create policy identity_access_requests_insert_own on public.identity_access_requests
for insert to authenticated with check (
 user_id=(select auth.uid()) and workspace_id=(select private.my_workspace_id())
 and status='requested' and reviewer_id is null and reviewed_at is null and expires_at is null
);
drop policy if exists identity_access_requests_review on public.identity_access_requests;
create policy identity_access_requests_review on public.identity_access_requests
for update to authenticated using (
 workspace_id=(select private.my_workspace_id()) and (select private.my_role()) in ('admin','manager')
) with check (
 workspace_id=(select private.my_workspace_id()) and (select private.my_role()) in ('admin','manager')
 and reviewer_id=(select auth.uid()) and reviewed_at is not null
 and (status <> 'approved' or expires_at between reviewed_at + interval '14 days 23 hours' and reviewed_at + interval '15 days 1 hour')
);
grant select,insert,update on public.identity_access_requests to authenticated;
