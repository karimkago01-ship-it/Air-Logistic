-- Protect the primary Air Logistic owner account and administrator profile.
-- Owner: karimkago01@gmail.com
-- This does not prevent the owner from signing out or signing back in.

create or replace function private.protect_air_logistic_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  protected_owner constant uuid := '0e7fe9b5-bc54-403b-9884-ad1facf5efe0'::uuid;
begin
  if tg_table_schema = 'public' and tg_table_name = 'profiles' then
    if old.user_id = protected_owner then
      if tg_op = 'DELETE' then
        raise exception 'The primary Air Logistic owner profile is protected from deletion.';
      end if;
      if new.user_id is distinct from old.user_id
         or new.role is distinct from old.role
         or new.active is distinct from old.active
         or new.workspace_id is distinct from old.workspace_id then
        raise exception 'The primary Air Logistic owner identity and administrator role are protected.';
      end if;
    end if;
    return new;
  end if;

  if tg_table_schema = 'auth' and tg_table_name = 'users' then
    if old.id = protected_owner then
      if tg_op = 'DELETE' then
        raise exception 'The primary Air Logistic owner account is protected from deletion.';
      end if;
      if new.email is distinct from old.email
         or new.phone is distinct from old.phone
         or new.banned_until is distinct from old.banned_until
         or new.deleted_at is distinct from old.deleted_at
         or new.raw_app_meta_data is distinct from old.raw_app_meta_data
         or new.aud is distinct from old.aud
         or new.role is distinct from old.role
         or new.is_sso_user is distinct from old.is_sso_user
         or new.is_anonymous is distinct from old.is_anonymous then
        raise exception 'The primary Air Logistic owner authentication identity is protected.';
      end if;
    end if;
    return new;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function private.protect_air_logistic_owner() from public, anon, authenticated;

drop trigger if exists protect_air_logistic_owner_profile on public.profiles;
create trigger protect_air_logistic_owner_profile
before update or delete on public.profiles
for each row execute function private.protect_air_logistic_owner();

drop trigger if exists protect_air_logistic_owner_auth on auth.users;
create trigger protect_air_logistic_owner_auth
before update or delete on auth.users
for each row execute function private.protect_air_logistic_owner();
