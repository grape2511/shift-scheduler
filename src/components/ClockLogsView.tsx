import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useApp } from '../store/AppContext';
import { getUserTimezone, convertTime } from '../utils/timezone';
import { upsertClockRecord, insertNotification } from '../lib/database';
import type { ClockRecord } from '../types';
import { format, parseISO } from 'date-fns';
import { Clock, AlertCircle, CheckCircle2, CircleAlert, PlayCircle, Filter, Pencil, X } from 'lucide-react';

const RANGE_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last 12 months' },
] as const;

type Status = 'on-time' | 'late' | 'missed' | 'active' | 'no-show';

const LATE_THRESHOLD_MIN = 10;

function statusBadge(status: Status) {
  switch (status) {
    case 'on-time':
      return { label: 'On time', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 };
    case 'late':
      return { label: 'Late', cls: 'bg-amber-100 text-amber-700', Icon: CircleAlert };
    case 'missed':
      return { label: 'No clock-out', cls: 'bg-orange-100 text-orange-700', Icon: AlertCircle };
    case 'active':
      return { label: 'In progress', cls: 'bg-indigo-100 text-indigo-700', Icon: PlayCircle };
    case 'no-show':
      return { label: 'No clock-in', cls: 'bg-red-100 text-red-700', Icon: AlertCircle };
  }
}

function shiftStartUtcMs(date: string, startTime: string, timezone: string): number {
  const asUtc = new Date(`${date}T${startTime}:00Z`).getTime();
  const tzFormatted = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: timezone })).getTime();
  const utcFormatted = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return asUtc - (tzFormatted - utcFormatted);
}

function shiftEndUtcMs(date: string, startTime: string, endTime: string, timezone: string): number {
  const startMin = parseInt(startTime.slice(0, 2)) * 60 + parseInt(startTime.slice(3, 5));
  const endMin = parseInt(endTime.slice(0, 2)) * 60 + parseInt(endTime.slice(3, 5));
  const overnight = endMin <= startMin;
  const endDate = overnight
    ? new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    : date;
  return shiftStartUtcMs(endDate, endTime, timezone);
}

interface EditTarget {
  shiftId: string;
  agentId: string;
  agentName: string;
  shiftName: string;
  shiftDate: string;
  shiftTimezone: string;
  clockInIso: string | null;
  clockOutIso: string | null;
}

// Render an ISO instant as HH:MM in the shift's own timezone, for the time inputs.
function isoToLocalHHMM(iso: string | null, tz: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
}

export function ClockLogsView() {
  const { state, dispatch } = useApp();
  const isAdmin = state.currentUser.role === 'admin';
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [includeMissing, setIncludeMissing] = useState<boolean>(true);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [saving, setSaving] = useState(false);

  const viewerTz = getUserTimezone(state.currentUser.timezone, state.currentUser.country);

  const openEdit = (t: EditTarget) => {
    setEdit(t);
    setEditIn(isoToLocalHHMM(t.clockInIso, t.shiftTimezone));
    setEditOut(isoToLocalHHMM(t.clockOutIso, t.shiftTimezone));
  };

  const handleSaveEdit = async () => {
    if (!edit || saving) return;
    if (editOut && !editIn) {
      alert('Set a clock-in time before a clock-out time.');
      return;
    }
    setSaving(true);
    try {
      // Times are entered in the shift's timezone; convert back to UTC instants.
      const clockIn = editIn ? new Date(shiftStartUtcMs(edit.shiftDate, editIn, edit.shiftTimezone)).toISOString() : null;
      let clockOut: string | null = null;
      if (editOut) {
        // A clock-out at or before clock-in means the shift ran past midnight.
        const nextDay = new Date(new Date(`${edit.shiftDate}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
        const outDate = editIn && editOut <= editIn ? nextDay : edit.shiftDate;
        clockOut = new Date(shiftStartUtcMs(outDate, editOut, edit.shiftTimezone)).toISOString();
      }

      const existing = state.clockRecords.find(r => r.shiftId === edit.shiftId && r.userId === edit.agentId);
      const record: ClockRecord = {
        id: existing?.id || uuid(),
        shiftId: edit.shiftId,
        userId: edit.agentId,
        clockIn,
        clockOut,
      };

      dispatch({ type: 'UPSERT_CLOCK_RECORD', payload: record });
      await upsertClockRecord(record);

      // Leave an audit note in the admin's Activity log.
      const summary = clockIn
        ? `${isoToLocalHHMM(clockIn, edit.shiftTimezone)}–${clockOut ? isoToLocalHHMM(clockOut, edit.shiftTimezone) : '—'}`
        : 'cleared';
      const notif = {
        id: uuid(),
        userId: state.currentUser.id,
        message: `You edited ${edit.agentName}'s clock times for "${edit.shiftName}" on ${edit.shiftDate} → ${summary} (${edit.shiftTimezone})`,
        timestamp: new Date().toISOString(),
        read: false,
        type: 'change' as const,
      };
      dispatch({ type: 'ADD_NOTIFICATION', payload: notif });
      insertNotification(notif);

      setEdit(null);
    } finally {
      setSaving(false);
    }
  };

  const agents = useMemo(
    () => state.users
      .filter(u => u.role === 'agent' || u.role === 'team-lead')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [state.users]
  );

  const rows = useMemo(() => {
    const cutoffMs = Date.now() - rangeDays * 86400000;
    const out: {
      key: string;
      agentId: string;
      agentName: string;
      agentColor: string;
      shiftId: string;
      shiftName: string;
      shiftDate: string;
      shiftTimezone: string;
      scheduledStart: string;
      scheduledEnd: string;
      startUtcMs: number;
      endUtcMs: number;
      clockInIso: string | null;
      clockOutIso: string | null;
      durationMin: number | null;
      status: Status;
    }[] = [];

    state.shifts.forEach(shift => {
      const startUtcMs = shiftStartUtcMs(shift.date, shift.startTime, shift.timezone);
      const endUtcMs = shiftEndUtcMs(shift.date, shift.startTime, shift.endTime, shift.timezone);
      if (startUtcMs < cutoffMs) return;
      if (startUtcMs > Date.now()) return; // future shifts have no clock data

      shift.assignedAgentIds.forEach(agentId => {
        if (agentFilter !== 'all' && agentId !== agentFilter) return;
        const agent = state.users.find(u => u.id === agentId);
        if (!agent) return;
        const record = state.clockRecords.find(r => r.shiftId === shift.id && r.userId === agentId);

        let status: Status;
        let durationMin: number | null = null;

        if (!record || !record.clockIn) {
          if (!includeMissing) return;
          status = 'no-show';
        } else if (!record.clockOut) {
          status = endUtcMs < Date.now() ? 'missed' : 'active';
        } else {
          const clockInMs = new Date(record.clockIn).getTime();
          const clockOutMs = new Date(record.clockOut).getTime();
          durationMin = Math.round((clockOutMs - clockInMs) / 60000);
          status = clockInMs - startUtcMs > LATE_THRESHOLD_MIN * 60000 ? 'late' : 'on-time';
        }

        if (statusFilter !== 'all' && status !== statusFilter) return;

        out.push({
          key: `${shift.id}:${agentId}`,
          agentId,
          agentName: agent.name,
          agentColor: agent.color,
          shiftId: shift.id,
          shiftName: shift.name,
          shiftDate: shift.date,
          shiftTimezone: shift.timezone,
          scheduledStart: shift.startTime,
          scheduledEnd: shift.endTime,
          startUtcMs,
          endUtcMs,
          clockInIso: record?.clockIn || null,
          clockOutIso: record?.clockOut || null,
          durationMin,
          status,
        });
      });
    });

    out.sort((a, b) => b.startUtcMs - a.startUtcMs || a.agentName.localeCompare(b.agentName));
    return out;
  }, [state.shifts, state.clockRecords, state.users, agentFilter, statusFilter, rangeDays, includeMissing]);

  const summary = useMemo(() => {
    const tally: Record<Status, number> = { 'on-time': 0, late: 0, missed: 0, active: 0, 'no-show': 0 };
    rows.forEach(r => { tally[r.status]++; });
    return tally;
  }, [rows]);

  const formatTimeInViewerTz = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: viewerTz }) : '—';

  const formatDuration = (mins: number | null) => {
    if (mins === null) return '—';
    const sign = mins < 0 ? '-' : '';
    const abs = Math.abs(mins);
    return `${sign}${Math.floor(abs / 60)}h ${abs % 60}m`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clock Logs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Clock-in / clock-out history per agent — times shown in your local timezone ({viewerTz}).
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Agent</label>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | Status)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All statuses</option>
            <option value="on-time">On time</option>
            <option value="late">Late</option>
            <option value="missed">No clock-out</option>
            <option value="active">In progress</option>
            <option value="no-show">No clock-in</option>
          </select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Time range</label>
          <select
            value={rangeDays}
            onChange={e => setRangeDays(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeMissing}
            onChange={e => setIncludeMissing(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          Include no-shows
        </label>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['on-time', 'late', 'missed', 'active', 'no-show'] as Status[]).map(s => {
          const b = statusBadge(s);
          return (
            <div key={s} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${b.cls}`}>
                <b.Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{summary[s]}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{b.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Filter className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No matching clock records.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                  <th className="px-4 py-2.5 text-left font-medium">Shift</th>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">Scheduled</th>
                  <th className="px-4 py-2.5 text-left font-medium">Clocked in</th>
                  <th className="px-4 py-2.5 text-left font-medium">Clocked out</th>
                  <th className="px-4 py-2.5 text-left font-medium">Duration</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  {isAdmin && <th className="px-4 py-2.5 text-right font-medium">Edit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map(r => {
                  const b = statusBadge(r.status);
                  const localStart = convertTime(r.scheduledStart, r.shiftTimezone, viewerTz);
                  const localEnd = convertTime(r.scheduledEnd, r.shiftTimezone, viewerTz);
                  return (
                    <tr key={r.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
                            style={{ backgroundColor: r.agentColor }}
                          >
                            {r.agentName[0]}
                          </div>
                          <span className="text-gray-900 dark:text-gray-100">{r.agentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{r.shiftName}</td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                        {format(parseISO(r.shiftDate), 'EEE, MMM d')}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {localStart} – {localEnd}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatTimeInViewerTz(r.clockInIso)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatTimeInViewerTz(r.clockOutIso)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDuration(r.durationMin)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${b.cls}`}>
                          <b.Icon className="w-3 h-3" />
                          {b.label}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => openEdit({
                              shiftId: r.shiftId,
                              agentId: r.agentId,
                              agentName: r.agentName,
                              shiftName: r.shiftName,
                              shiftDate: r.shiftDate,
                              shiftTimezone: r.shiftTimezone,
                              clockInIso: r.clockInIso,
                              clockOutIso: r.clockOutIso,
                            })}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-2 py-1 rounded-lg transition-colors"
                            title="Edit clock-in / clock-out times"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {rows.length} record{rows.length === 1 ? '' : 's'} · &gt;{LATE_THRESHOLD_MIN} min after start counts as late
          </div>
        </div>
      )}

      {/* Admin: edit clock-in / clock-out times */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setEdit(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Edit clock times</h3>
              <button onClick={() => !saving && setEdit(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-gray-100">{edit.agentName}</span> · {edit.shiftName} · {format(parseISO(edit.shiftDate), 'EEE, MMM d, yyyy')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Clock in</label>
                  <input type="time" value={editIn} onChange={e => setEditIn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Clock out</label>
                  <input type="time" value={editOut} onChange={e => setEditOut(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Times are in the shift's timezone ({edit.shiftTimezone}). Leave both blank to clear the record (marks it a no-show). A clock-out earlier than clock-in is treated as the next day.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setEdit(null)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-60">Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
