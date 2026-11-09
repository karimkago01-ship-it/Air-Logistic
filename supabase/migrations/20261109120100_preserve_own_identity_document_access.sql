-- Preserve self-service status visibility while keeping cross-account access exclusive to Abu Rizq.
drop policy if exists identity_documents_read_abu_rizq_only on public.identity_documents;
create policy identity_documents_read_own_or_abu_rizq
on public.identity_documents
for select
to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (
    user_id = (select auth.uid())
    or (
      (select auth.uid()) = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid
      and (select private.my_role()) = 'admin'
    )
  )
);
