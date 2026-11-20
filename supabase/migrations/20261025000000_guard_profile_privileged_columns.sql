-- "Users can update own profile" (UPDATE using auth.uid() = id) has no column
-- restriction, so any agent could set role='admin', can_edit_own_hours, PTO
-- allowances, etc. on their own row. This trigger blocks non-admin callers
-- from changing privileged columns. Calls without a JWT (service role, SQL
-- editor, pg_cron) have auth.uid() = null and are unaffected.

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

revoke execute on function public.guard_profile_privileged_columns() from public, anon, authenticated;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();
