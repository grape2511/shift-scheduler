-- handle_new_user took the profile role from raw_user_meta_data, which the
-- person signing up controls: supabase.auth.signUp({ options: { data: { role:
-- 'admin' } } }) created an admin. The app never passes a role, so new
-- profiles are always 'agent'; admins promote people from the Agents page.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'agent',
    coalesce(new.raw_user_meta_data->>'color', '#6366f1')
  );
  return new;
end;
$$;

-- "Users can insert own profile" also lets a user whose profile row was
-- deleted (deleteProfile leaves the auth user) re-insert it with any role.
-- Extend the privileged-column guard to inserts by non-admin callers.

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'agent' or coalesce(new.can_edit_own_hours, false) then
      raise exception 'New profiles must be created as agent'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.active is distinct from old.active
    or new.pto_allowance is distinct from old.pto_allowance
    or new.sick_days_allowance is distinct from old.sick_days_allowance
    or new.holidays_deduct_pto is distinct from old.holidays_deduct_pto
    or new.labels is distinct from old.labels
    or new.label is distinct from old.label
    or new.can_edit_own_hours is distinct from old.can_edit_own_hours
    or new.email is distinct from old.email
  then
    raise exception 'Only admins can change role, active, allowances, labels, hours permission or email'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();
