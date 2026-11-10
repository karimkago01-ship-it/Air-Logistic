-- Cover user_id foreign keys used by private identity-document and access-request workflows.
-- Non-destructive performance-only change.
create index if not exists identity_access_requests_user_id_idx
  on public.identity_access_requests (user_id);

create index if not exists identity_documents_user_id_idx
  on public.identity_documents (user_id);
