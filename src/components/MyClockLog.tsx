import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useApp } from '../store/AppContext';
import { getUserTimezone, convertTime } from '../utils/timezone';
import { insertClockCorrection, insertNotification } from '../lib/database';
import type { ClockCorrection, Notification } from '../types';
import {
  shiftStartUtcMs, shiftEndUtcMs, isoToLocalHHMM, localHHMMToIso, clockStatus, LATE_THRESHOLD_MIN,
  type ClockStatus,
} from '../utils/clock';
import { format, parseISO } from 'date-fns';
import { Clock, AlertCircle, CheckCircle2, CircleAlert, PlayCircle, Pencil, X, Hourglass } from 'lucide-react';

const RANGE_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last 12 months' },
] as const;

function statusBadge(status: ClockStatus) {
  switch (status) {
    case 'on-time': return { label: 'On time', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 };
    case 'late': return { label: 'Late', cls: 'bg-amber-100 text-amber-700', Icon: CircleAlert };
    case 'missed': return { label: 'No clock-out', cls: 'bg-orange-100 text-orange-700', Icon: AlertCircle };
    case 'active': return { label: 'In progress', cls: 'bg-indigo-100 text-indigo-700', Icon: PlayCircle };
    case 'no-show': return { label: 'No clock-in', cls: 'bg-red-100 text-red-700', Icon: AlertCircle };
  }
}

interface EditTarget {
  shiftId: string;
  shiftName: string;
  shiftDate: string;
  shiftTimezone: string;
  clockInIso: string | null;
  clockOutIso: string | null;
}

export function MyClockLog() {
  const { state, dispatch } = useApp();
  const me = state.currentUser;
  const viewerTz = getUserTimezone(me.timezone, me.country);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Latest correction per shift for this agent.
  const correctionByShift = useMemo(() => {
    const map = new Map<string, ClockCorrection>();
    (state.clockCorrections || [])
      .filter(c => c.userId === me.id)
      .forEach(c => {
        const prev = map.get(c.shiftId);
        if (!prev || c.createdAt > prev.createdAt) map.set(c.shiftId, c);
      });
    return map;
  }, [state.clockCorrections, me.id]);

  const rows = useMemo(() => {
    const cutoffMs = Date.now() - rangeDays * 86400000;
    const out: {
      shiftId: string; shiftName: string; shiftDate: string; shiftTimezone: string;
      scheduledStart: string; scheduledEnd: string; startUtcMs: number;
      clockInIso: string | null; clockOutIso: string | null;
      durationMin: number | null; status: ClockStatus;
    }[] = [];

    state.shifts.forEach(shift => {
      if (!shift.assignedAgentIds.includes(me.id)) return;
      const startUtcMs = shiftStartUtcMs(shift.date, shift.startTime, shift.timezone);
      const endUtcMs = shiftEndUtcMs(shift.date, shift.startTime, shift.endTime, shift.timezone);
      if (startUtcMs < cutoffMs) return;
      if (startUtcMs > Date.now()) return; // future shifts have no clock data yet
      const record = state.clockRecords.find(r => r.shiftId === shift.id && r.userId === me.id);
      const { status, durationMin } = clockStatus(record?.clockIn || null, record?.clockOut || null, startUtcMs, endUtcMs);
      out.push({
        shiftId: shift.id, shiftName: shift.name, shiftDate: shift.date, shiftTimezone: shift.timezone,
        scheduledStart: shift.startTime, scheduledEnd: shift.endTime, startUtcMs,
        clockInIso: record?.clockIn || null, clockOutIso: record?.clockOut || null,
        durationMin, status,
      });
    });
    out.sort((a, b) => b.startUtcMs - a.startUtcMs);
    return out;
  }, [state.shifts, state.clockRecords, me.id, rangeDays]);

  const openEdit = (t: EditTarget) => {
    setEdit(t);
    // Prefill with existing times, or the scheduled window as a sensible starting point.
    setEditIn(isoToLocalHHMM(t.clockInIso, t.shiftTimezone) || '');
    setEditOut(isoToLocalHHMM(t.clockOutIso, t.shiftTimezone) || '');
    setNote('');
  };

  const handleSubmit = async () => {
    if (!edit || saving) return;
    if (!note.trim()) { alert('Please add a note explaining the correction.'); return; }
    if (editOut && !editIn) { alert('Set a clock-in time before a clock-out time.'); return; }
    setSaving(true);
    try {
      const proposedClockIn = editIn ? localHHMMToIso(editIn, edit.shiftDate, edit.shiftTimezone) : null;
      const proposedClockOut = editOut ? localHHMMToIso(editOut, edit.shiftDate, edit.shiftTimezone, editIn) : null;
      const correction: ClockCorrection = {
        id: uuid(),
        shiftId: edit.shiftId,
        userId: me.id,
        proposedClockIn,
        proposedClockOut,
        note: note.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_CLOCK_CORRECTION', payload: correction });
      await insertClockCorrection(correction);

      // Notify every admin that a request is waiting.
      const times = proposedClockIn
        ? `${isoToLocalHHMM(proposedClockIn, edit.shiftTimezone)}–${proposedClockOut ? isoToLocalHHMM(proposedClockOut, edit.shiftTimezone) : '—'}`
        : 'no time change';
      state.users.filter(u => u.role === 'admin').forEach(admin => {
        const notif: Notification = {
          id: uuid(),
          userId: admin.id,
          message: `${me.name} requested a clock correction for "${edit.shiftName}" on ${edit.shiftDate} (${times}) — ${note.trim()}`,
          timestamp: new Date().toISOString(),
          read: false,
          type: 'change',
        };
        dispatch({ type: 'ADD_NOTIFICATION', payload: notif });
        insertNotification(notif);
      });

      setEdit(null);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: viewerTz }) : '—';
  const fmtDuration = (mins: number | null) => {
    if (mins === null) return '—';
    const abs = Math.abs(mins);
    return `${Math.floor(abs / 60)}h ${abs % 60}m`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Clock Log</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your clock-in / clock-out history — times shown in your local timezone ({viewerTz}). Request a correction if a
          time is wrong or you missed a clock-in; an admin reviews it before it takes effect.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Time range</label>
        <select
          value={rangeDays}
          onChange={e => setRangeDays(Number(e.target.value))}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No clock records in this range.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const b = statusBadge(r.status);
            const localStart = convertTime(r.scheduledStart, r.shiftTimezone, viewerTz);
            const localEnd = convertTime(r.scheduledEnd, r.shiftTimezone, viewerTz);
            const correction = correctionByShift.get(r.shiftId);
            return (
              <div key={r.shiftId} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{r.shiftName}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${b.cls}`}>
                        <b.Icon className="w-3 h-3" />{b.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {format(parseISO(r.shiftDate), 'EEE, MMM d, yyyy')} · scheduled {localStart}–{localEnd}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      Clocked in <span className="font-medium">{fmt(r.clockInIso)}</span> · out <span className="font-medium">{fmt(r.clockOutIso)}</span> · {fmtDuration(r.durationMin)}
                    </p>
                  </div>
                  <div className="shrink-0 self-end sm:self-auto">
                    {correction ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg ${
                        correction.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : correction.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        <Hourglass className="w-3.5 h-3.5" />
                        {correction.status === 'pending' ? 'Correction pending' : correction.status === 'approved' ? 'Correction approved' : 'Correction declined'}
                      </span>
                    ) : (
                      <button
                        onClick={() => openEdit({
                          shiftId: r.shiftId, shiftName: r.shiftName, shiftDate: r.shiftDate,
                          shiftTimezone: r.shiftTimezone, clockInIso: r.clockInIso, clockOutIso: r.clockOutIso,
                        })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Request correction
                      </button>
                    )}
                  </div>
                </div>
                {correction?.status === 'rejected' && correction.note && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Your note: {correction.note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        &gt;{LATE_THRESHOLD_MIN} min after start counts as late.
      </p>

      {/* Correction request modal */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setEdit(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Request clock correction</h3>
              <button onClick={() => !saving && setEdit(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-gray-100">{edit.shiftName}</span> · {format(parseISO(edit.shiftDate), 'EEE, MMM d, yyyy')}
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
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Note (required)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                  placeholder="Explain why you missed the clock-in or were late…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Times are in the shift's timezone ({edit.shiftTimezone}). Your request goes to an admin for approval — nothing changes until they approve it.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setEdit(null)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-60">Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Sending…' : 'Send request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
