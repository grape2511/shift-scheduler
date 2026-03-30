import { supabase } from './supabase';
import type { User, Shift, TimeOff, Notification, SwapRequest, ClockRecord } from '../types';

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
    slackWebhookUrl: p.slack_webhook_url || undefined,
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
  if (updates.slackWebhookUrl !== undefined) dbUpdates.slack_webhook_url = updates.slackWebhookUrl;
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
  const { data, error } = await supabase.from('shifts').select('*');
  if (error) { console.error('fetchAllShifts', error); return []; }
  return (data || []).map(s => ({
    id: s.id,
    name: s.name,
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    timezone: s.timezone,
    assignedAgentIds: s.assigned_agent_ids || [],
    recurring: s.recurring as Shift['recurring'],
    recurringGroupId: s.recurring_group_id || undefined,
    requiredAgents: s.required_agents,
    color: s.color,
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
    assigned_agent_ids: s.assignedAgentIds,
    recurring: s.recurring,
    recurring_group_id: s.recurringGroupId || null,
    required_agents: s.requiredAgents,
    color: s.color,
  }));
  const { error } = await supabase.from('shifts').insert(rows);
  if (error) console.error('insertShifts', error);
}

export async function updateShift(shift: Shift) {
  const { error } = await supabase.from('shifts').update({
    name: shift.name,
    date: shift.date,
    start_time: shift.startTime,
    end_time: shift.endTime,
    timezone: shift.timezone,
    assigned_agent_ids: shift.assignedAgentIds,
    recurring: shift.recurring,
    recurring_group_id: shift.recurringGroupId || null,
    required_agents: shift.requiredAgents,
    color: shift.color,
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
  const { error } = await supabase.from('shifts').update({ assigned_agent_ids: agentIds }).eq('id', shiftId);
  if (error) console.error('updateShiftAssignment', error);
}

// ---- Time Offs ----

export async function fetchAllTimeOffs(): Promise<TimeOff[]> {
  const { data, error } = await supabase.from('time_offs').select('*');
  if (error) { console.error('fetchAllTimeOffs', error); return []; }
  return (data || []).map(t => ({
    id: t.id,
    userId: t.user_id,
    date: t.date,
    reason: t.reason || undefined,
    category: t.category || undefined,
  }));
}

export async function insertTimeOff(timeOff: TimeOff) {
  const { error } = await supabase.from('time_offs').insert({
    id: timeOff.id,
    user_id: timeOff.userId,
    date: timeOff.date,
    reason: timeOff.reason || null,
    category: timeOff.category || null,
  });
  if (error) console.error('insertTimeOff', error);
}

export async function deleteTimeOff(id: string) {
  const { error } = await supabase.from('time_offs').delete().eq('id', id);
  if (error) console.error('deleteTimeOff', error);
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
  const { data, error } = await supabase.from('swap_requests').select('*');
  if (error) { console.error('fetchAllSwapRequests', error); return []; }
  return (data || []).map(r => ({
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
  const { data, error } = await supabase.from('clock_records').select('*');
  if (error) { console.error('fetchAllClockRecords', error); return []; }
  return (data || []).map(r => ({
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
