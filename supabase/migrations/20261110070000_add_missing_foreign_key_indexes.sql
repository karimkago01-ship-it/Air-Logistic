-- Add small, non-destructive indexes for foreign-key lookups flagged by Supabase advisors.
-- Existing rows and access policies are unchanged.
create index if not exists chat_messages_sender_id_idx
  on public.chat_messages (sender_id);

create index if not exists identity_access_requests_reviewer_id_idx
  on public.identity_access_requests (reviewer_id);

create index if not exists identity_documents_reviewer_id_idx
  on public.identity_documents (reviewer_id);

create index if not exists notifications_workspace_id_idx
  on public.notifications (workspace_id);
