-- Private identity-document storage and role-scoped review for Air Logistic.
-- Applied to the original Supabase project; this file records the production schema change.
create table if not exists public.identity_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('national_id_front','national_id_back','personal_photo','driving_license')),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  constraint identity_documents_review_consistency check (
    (status = 'pending' and reviewer_id is null and reviewed_at is null)
    or (status in ('approved','rejected') and reviewer_id is not null and reviewed_at is not null)
  )
);
create index if not exists identity_documents_workspace_user_idx
  on public.identity_documents(workspace_id,user_id,created_at desc);
alter table public.identity_documents enable row level security;
drop policy if exists identity_documents_read on public.identity_documents;
create policy identity_documents_read on public.identity_documents
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    workspace_id = (select private.my_workspace_id())
    and (select private.my_role()) in ('admin','manager')
  )
);
drop policy if exists identity_documents_insert_own on public.identity_documents;
create policy identity_documents_insert_own on public.identity_documents
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and workspace_id = (select private.my_workspace_id())
  and status = 'pending'
  and reviewer_id is null
  and reviewed_at is null
  and rejection_reason is null
);
drop policy if exists identity_documents_review on public.identity_documents;
create policy identity_documents_review on public.identity_documents
for update to authenticated
using (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin','manager')
)
with check (
  workspace_id = (select private.my_workspace_id())
  and (select private.my_role()) in ('admin','manager')
  and reviewer_id = (select auth.uid())
  and reviewed_at is not null
);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('air-logistic-identity','air-logistic-identity',false,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists air_identity_upload_own on storage.objects;
create policy air_identity_upload_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'air-logistic-identity'
  and (storage.foldername(name))[1] = (select private.my_workspace_id())::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
drop policy if exists air_identity_read_own_or_reviewers on storage.objects;
create policy air_identity_read_own_or_reviewers on storage.objects
for select to authenticated
using (
  bucket_id = 'air-logistic-identity'
  and (storage.foldername(name))[1] = (select private.my_workspace_id())::text
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select private.my_role()) in ('admin','manager')
  )
);
grant select, insert, update on public.identity_documents to authenticated;
