-- notify_missed_clock_ins() alerted from the shift's start even for agents who
-- only cover part of it (shift_partials), e.g. Momen covering 04:00-08:00 of a
-- 00:00 Mid Shift was flagged at 00:15. It also only accepted a clock-in on the
-- same shift, but an agent covering the end of one shift and the start of the
-- next clocks in once, against either shift.
--
-- Now: the due time is the agent's partial start when they have one, and they
-- count as clocked in if they clocked in on this shift, or if any clock-in
-- session of theirs was running at the due time (+ grace).

create or replace function public.notify_missed_clock_ins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webhook text;
  v_grace   interval := interval '15 minutes';
  v_window  interval := interval '6 hours';
  v_lines   text;
  v_msg     text;
begin
  -- Webhook + toggle come from an admin's Settings, mirroring the app: an admin
  -- with a main webhook set and the missed-clock-in toggle on; prefer one that
  -- also set a dedicated missed-clock-in channel.
  select coalesce(p.slack_missed_clockin_webhook_url, p.slack_webhook_url)
    into v_webhook
  from public.profiles p
  where p.role = 'admin'
    and p.slack_webhook_url is not null
    and coalesce((p.slack_notifications->>'slackNotifyMissedClockIn')::boolean, true)
  order by (p.slack_missed_clockin_webhook_url is null)
  limit 1;
  if v_webhook is null then return; end if;

  with assignments as (
    select s.id as shift_id, a.agent_id as user_id, s.name as shift_name, s.date, s.timezone,
           coalesce(sp.start_time, s.start_time) as due_time,
           ((s.date + coalesce(sp.start_time, s.start_time)::time
             -- a partial starting earlier in the clock than its overnight shift is on the next day
             + case when sp.start_time::time < s.start_time::time then interval '1 day' else interval '0' end)
            at time zone s.timezone) as due_at
    from public.shifts s
    cross join lateral unnest(s.assigned_agent_ids) as a(agent_id)
    join public.profiles p on p.id = a.agent_id and p.active is not false
    left join public.shift_partials sp on sp.shift_id = s.id and sp.user_id = a.agent_id
    where s.date >= current_date - 1
  ),
  candidates as (
    select a.*
    from assignments a
    where now() >= a.due_at + v_grace
      and now() <  a.due_at + v_window
      and not exists (
        select 1 from public.clock_records r
        where r.user_id = a.user_id
          and r.clock_in is not null
          and (
            r.shift_id = a.shift_id
            or (r.clock_in <= a.due_at + v_grace
                and r.clock_in > a.due_at - interval '12 hours'
                and (r.clock_out is null or r.clock_out > a.due_at))
          )
      )
  ),
  claimed as (
    insert into public.clock_missed_alert_log (shift_id, user_id)
    select shift_id, user_id from candidates
    on conflict (shift_id, user_id) do nothing
    returning shift_id, user_id
  )
  select string_agg(
           '• ' || split_part(p.name, ' ', 1) || ' — "' || c.shift_name || '" (' ||
           to_char(c.date, 'YYYY-MM-DD') || ' ' || c.due_time || ' ' || c.timezone || ')',
           E'\n' order by c.shift_name, p.name)
    into v_lines
  from claimed cl
  join candidates c on c.shift_id = cl.shift_id and c.user_id = cl.user_id
  join public.profiles p on p.id = cl.user_id;

  if v_lines is null then return; end if;

  v_msg := '⏰ *Missed clock-in* (15min+ past start):' || E'\n' || v_lines;

  perform net.http_post(
    url     := v_webhook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('text', v_msg)
  );
end;
$$;
