-- Restrict cross-account identity document viewing and review to Abu Rizq's admin account.
-- Owners retain read access to their own document metadata and files.
drop policy if exists identity_documents_read on public.identity_documents;
create policy identity_documents_read_abu_rizq_only
on public.identity_documents
for select
to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (select auth.uid()) = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid
  and (select private.my_role()) = 'admin'
);

drop policy if exists identity_documents_review on public.identity_documents;
create policy identity_documents_review_abu_rizq_only
on public.identity_documents
for update
to authenticated
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
);

drop policy if exists air_identity_read_own_or_reviewers on storage.objects;
create policy air_identity_read_own_or_abu_rizq
on storage.objects
for select
to authenticated
using (
  bucket_id = 'air-logistic-identity'
  and (storage.foldername(name))[1] = ((select private.my_workspace_id())::text)
  and (
    (storage.foldername(name))[2] = ((select auth.uid())::text)
    or (
      (select auth.uid()) = '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid
      and (select private.my_role()) = 'admin'
    )
  )
);
