import { supabase } from './supabase';
import type { User, Shift, TimeOff, TimeOffCategory, TimeOffStatus, Notification, SwapRequest, ClockRecord } from '../types';

// PostgREST caps a single .select() at 1000 rows (db.max_rows). Once a table
// crosses that, a plain .select('*') silently drops rows — which is how agents
// ended up unable to clock out: their fresh clock-in wasn't in the truncated
// batch the browser downloaded, so the UI still showed "Clock In". This pages
// through in 1000-row chunks and returns every row.
const PAGE = 1000;
async function fetchAllRows(table: string): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) { console.error(`fetchAllRows(${table})`, error); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

// ---- Profiles ----

export async function fetchAllProfiles(): Promise<User[]> {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) { console.error('fetchAllProfiles', error); return []; }
  return (data || []).map(p => ({
    id: p.id,
    name: p.name,
    email: p.email || '',
    role: p.role as User['role'],
    color: p.color,
    country: p.country || undefined,
    timezone: p.timezone || undefined,
    enabledHolidayCountries: p.enabled_holiday_countries || undefined,
    ptoAllowance: p.pto_allowance ?? 21,
    sickDaysAllowance: p.sick_days_allowance ?? 7,
    holidaysDeductPto: p.holidays_deduct_pto ?? true,
    label: p.label || undefined,
    labels: p.labels || undefined,
    slackWebhookUrl: p.slack_webhook_url || undefined,
    slackNotifications: p.slack_notifications || undefined,
    active: p.active ?? true,
  }));
}

export async function updateProfile(id: string, updates: Partial<User> & { enabled_holiday_countries?: string[] }) {
  // Map camelCase to snake_case for Supabase
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.color !== undefined) dbUpdates.color = updates.color;
  if (updates.country !== undefined) dbUpdates.country = updates.country;
  if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone;
  if (updates.enabledHolidayCountries !== undefined) dbUpdates.enabled_holiday_countries = updates.enabledHolidayCountries;
  if (updates.enabled_holiday_countries !== undefined) dbUpdates.enabled_holiday_countries = updates.enabled_holiday_countries;
  if (updates.ptoAllowance !== undefined) dbUpdates.pto_allowance = updates.ptoAllowance;
  if (updates.sickDaysAllowance !== undefined) dbUpdates.sick_days_allowance = updates.sickDaysAllowance;
  if (updates.holidaysDeductPto !== undefined) dbUpdates.holidays_deduct_pto = updates.holidaysDeductPto;
  if (updates.label !== undefined) dbUpdates.label = updates.label || null;
  if (updates.labels !== undefined) dbUpdates.labels = updates.labels || [];
  if (updates.slackWebhookUrl !== undefined) dbUpdates.slack_webhook_url = updates.slackWebhookUrl;
  if ((updates as any).slackNotifications !== undefined) dbUpdates.slack_notifications = (updates as any).slackNotifications;
  if (updates.active !== undefined) dbUpdates.active = updates.active;
  const { error } = await supabase.from('profiles').update(dbUpdates).eq('id', id);
  if (error) console.error('updateProfile', error);
}

export async function deleteProfile(id: string) {
  // Delete from auth (cascades to profiles via trigger)
  // For now just delete the profile row — auth admin delete requires service role
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) console.error('deleteProfile', error);
}

// ---- Shifts ----

export async function fetchAllShifts(): Promise<Shift[]> {
  const data = await fetchAllRows('shifts');
  return data.map(s => ({
    id: s.id,
    name: s.name,
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    timezone: s.timezone,
    assignedAgentIds: [...new Set(s.assigned_agent_ids || [])] as string[],
    recurring: s.recurring as Shift['recurring'],
    recurringGroupId: s.recurring_group_id || undefined,
    requiredAgents: s.required_agents,
    color: s.color,
    notes: s.notes || undefined,
  }));
}

export async function insertShifts(shifts: Shift[]) {
  const rows = shifts.map(s => ({
    id: s.id,
    name: s.name,
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    timezone: s.timezone,
    assigned_agent_ids: [...new Set(s.assignedAgentIds)],
    recurring: s.recurring,
    recurring_group_id: s.recurringGroupId || null,
    required_agents: s.requiredAgents,
    color: s.color,
    notes: s.notes || null,
  }));
  // Batch in chunks of 20 to avoid Supabase payload limits
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const { error } = await supabase.from('shifts').insert(batch);
    if (error) console.error('insertShifts batch', i, error);
  }
}

export async function updateShift(shift: Shift) {
  const { error } = await supabase.from('shifts').update({
    name: shift.name,
    date: shift.date,
    start_time: shift.startTime,
    end_time: shift.endTime,
    timezone: shift.timezone,
    assigned_agent_ids: [...new Set(shift.assignedAgentIds)],
    recurring: shift.recurring,
    recurring_group_id: shift.recurringGroupId || null,
    required_agents: shift.requiredAgents,
    color: shift.color,
    notes: shift.notes || null,
  }).eq('id', shift.id);
  if (error) console.error('updateShift', error);
}

export async function deleteShift(id: string) {
  const { error } = await supabase.from('shifts').delete().eq('id', id);
  if (error) console.error('deleteShift', error);
}

export async function deleteShifts(ids: string[]) {
  const { error } = await supabase.from('shifts').delete().in('id', ids);
  if (error) console.error('deleteShifts', error);
}

export async function updateShiftAssignment(shiftId: string, agentIds: string[]) {
  const { error } = await supabase.from('shifts').update({ assigned_agent_ids: [...new Set(agentIds)] }).eq('id', shiftId);
  if (error) console.error('updateShiftAssignment', error);
}

// ---- Time Offs ----

export async function fetchAllTimeOffs(): Promise<TimeOff[]> {
  const data = await fetchAllRows('time_offs');
  return data.map(t => ({
    id: t.id,
    userId: t.user_id,
    date: t.date,
    reason: t.reason || undefined,
    category: t.category || undefined,
    status: t.status || 'approved',
    halfDay: t.half_day || false,
    createdAt: t.created_at || undefined,
  }));
}

export async function insertTimeOff(timeOff: TimeOff): Promise<boolean> {
  const { error } = await supabase.from('time_offs').insert({
    id: timeOff.id,
    user_id: timeOff.userId,
    date: timeOff.date,
    reason: timeOff.reason || null,
    category: timeOff.category || null,
    status: timeOff.status || 'approved',
    half_day: timeOff.halfDay || false,
    created_at: timeOff.createdAt || new Date().toISOString(),
  });
  if (error) console.error('insertTimeOff', error);
  return !error;
}

export async function deleteTimeOff(id: string) {
  const { error } = await supabase.from('time_offs').delete().eq('id', id);
  if (error) console.error('deleteTimeOff', error);
}

export async function updateTimeOffStatus(id: string, status: string) {
  const { error } = await supabase.from('time_offs').update({ status }).eq('id', id);
  if (error) console.error('updateTimeOffStatus', error);
}

// Edit an already-submitted request (half/full day, category, note). Agents may
// edit their own rows and admins any row — both covered by existing RLS policies.
export async function updateTimeOff(
  id: string,
  updates: { category?: TimeOffCategory; halfDay?: boolean; reason?: string; status?: TimeOffStatus },
): Promise<boolean> {
  const payload: Record<string, unknown> = {};
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.halfDay !== undefined) payload.half_day = updates.halfDay;
  if (updates.reason !== undefined) payload.reason = updates.reason || null;
  if (updates.status !== undefined) payload.status = updates.status;
  const { error } = await supabase.from('time_offs').update(payload).eq('id', id);
  if (error) console.error('updateTimeOff', error);
  return !error;
}

// ---- Notifications ----

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('fetchNotifications', error); return []; }
  return (data || []).map(n => ({
    id: n.id,
    userId: n.user_id,
    message: n.message,
    timestamp: n.created_at,
    read: n.read,
    type: n.type as Notification['type'],
    swapRequestId: n.swap_request_id || undefined,
  }));
}

export async function insertNotification(notif: Notification) {
  const { error } = await supabase.from('notifications').insert({
    id: notif.id,
    user_id: notif.userId,
    message: notif.message,
    type: notif.type,
    read: notif.read,
    swap_request_id: notif.swapRequestId || null,
    created_at: notif.timestamp,
  });
  if (error) console.error('insertNotification', error);
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) console.error('markNotificationRead', error);
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) console.error('markAllNotificationsRead', error);
}

// ---- Swap Requests ----

export async function fetchAllSwapRequests(): Promise<SwapRequest[]> {
  const data = await fetchAllRows('swap_requests');
  return data.map(r => ({
    id: r.id,
    fromShiftId: r.from_shift_id,
    toShiftId: r.to_shift_id,
    fromAgentId: r.from_agent_id,
    toAgentId: r.to_agent_id,
    reason: r.reason || undefined,
    status: r.status as SwapRequest['status'],
    timestamp: r.created_at,
  }));
}

export async function insertSwapRequest(req: SwapRequest) {
  const { error } = await supabase.from('swap_requests').insert({
    id: req.id,
    from_shift_id: req.fromShiftId,
    to_shift_id: req.toShiftId,
    from_agent_id: req.fromAgentId,
    to_agent_id: req.toAgentId,
    reason: req.reason || null,
    status: req.status,
    created_at: req.timestamp,
  });
  if (error) console.error('insertSwapRequest', error);
}

export async function updateSwapRequestStatus(id: string, status: 'accepted' | 'declined') {
  const { error } = await supabase.from('swap_requests').update({ status }).eq('id', id);
  if (error) console.error('updateSwapRequestStatus', error);
}

// ---- Clock Records ----

export async function fetchAllClockRecords(): Promise<ClockRecord[]> {
  const data = await fetchAllRows('clock_records');
  return data.map(r => ({
    id: r.id,
    shiftId: r.shift_id,
    userId: r.user_id,
    clockIn: r.clock_in,
    clockOut: r.clock_out,
  }));
}

export async function upsertClockRecord(record: ClockRecord) {
  const { error } = await supabase.from('clock_records').upsert({
    id: record.id,
    shift_id: record.shiftId,
    user_id: record.userId,
    clock_in: record.clockIn,
    clock_out: record.clockOut,
  }, { onConflict: 'shift_id,user_id' });
  if (error) console.error('upsertClockRecord', error);
}
