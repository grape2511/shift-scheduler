-- ============================================
-- Shifts App - Supabase Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Profiles (extends auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  color text not null default '#6366f1',
  country text
);

-- 2. Shifts
create table shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  timezone text not null default 'Europe/Amsterdam',
  assigned_agent_ids uuid[] default '{}',
  recurring text not null default 'none',
  recurring_group_id uuid,
  required_agents integer not null default 1,
  color text not null default '#3b82f6',
  created_by uuid references profiles(id)
);

-- 3. Time Offs
create table time_offs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  date date not null,
  reason text
);

-- 4. Swap Requests
create table swap_requests (
  id uuid primary key default gen_random_uuid(),
  from_shift_id uuid references shifts(id) on delete cascade not null,
  to_shift_id uuid references shifts(id) on delete cascade not null,
  from_agent_id uuid references profiles(id) on delete cascade not null,
  to_agent_id uuid references profiles(id) on delete cascade not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

-- 5. Notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  message text not null,
  type text not null default 'info' check (type in ('assignment', 'change', 'info', 'swap-request')),
  read boolean not null default false,
  swap_request_id uuid references swap_requests(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

alter table profiles enable row level security;
alter table shifts enable row level security;
alter table time_offs enable row level security;
alter table swap_requests enable row level security;
alter table notifications enable row level security;

-- Profiles: everyone can read, users can update their own
create policy "Anyone can view profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Shifts: everyone can read, admins can insert/update/delete
create policy "Anyone can view shifts" on shifts for select using (true);
create policy "Authenticated can insert shifts" on shifts for insert with check (auth.uid() is not null);
create policy "Authenticated can update shifts" on shifts for update using (auth.uid() is not null);
create policy "Authenticated can delete shifts" on shifts for delete using (auth.uid() is not null);

-- Time Offs: everyone can read, users manage their own
create policy "Anyone can view time_offs" on time_offs for select using (true);
create policy "Users can insert own time_offs" on time_offs for insert with check (auth.uid() = user_id);
create policy "Users can delete own time_offs" on time_offs for delete using (auth.uid() = user_id);

-- Swap Requests: everyone can read, participants can manage
create policy "Anyone can view swap_requests" on swap_requests for select using (true);
create policy "Authenticated can insert swap_requests" on swap_requests for insert with check (auth.uid() is not null);
create policy "Authenticated can update swap_requests" on swap_requests for update using (auth.uid() is not null);

-- Notifications: users can see their own, authenticated can insert
create policy "Users can view own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Authenticated can insert notifications" on notifications for insert with check (auth.uid() is not null);
create policy "Users can update own notifications" on notifications for update using (auth.uid() = user_id);

-- ============================================
-- Auto-create profile on signup
-- ============================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, role, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'agent'),
    coalesce(new.raw_user_meta_data->>'color', '#6366f1')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- Indexes for performance
-- ============================================

create index idx_shifts_date on shifts(date);
create index idx_shifts_recurring_group on shifts(recurring_group_id);
create index idx_time_offs_user_date on time_offs(user_id, date);
create index idx_notifications_user on notifications(user_id, created_at desc);
create index idx_swap_requests_status on swap_requests(status);
