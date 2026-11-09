-- Restrict 15-day identity grace decisions to the verified Abu Rizq admin account.
drop policy if exists identity_access_requests_review on public.identity_access_requests;
create policy identity_access_requests_review on public.identity_access_requests
for update to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (select auth.uid()) = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid
  and (select private.my_role()) = 'admin'
)
with check (
  workspace_id = (select private.my_workspace_id())
  and (select auth.uid()) = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid
  and (select private.my_role()) = 'admin'
  and reviewer_id = (select auth.uid())
  and reviewed_at is not null
  and (
    status <> 'approved'
    or (
      expires_at >= reviewed_at + interval '14 days 23 hours'
      and expires_at <= reviewed_at + interval '15 days 1 hour'
    )
  )
);
