import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Clock, X } from 'lucide-react';
import type { Shift } from '../types';

/**
 * Lets an agent with `canEditOwnHours` change the start/end time of their own
 * shift — by default for this day and every later day in the same recurring
 * series, or for this one day only. Times are in the shift's own timezone.
 */
export function EditHoursModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const me = state.currentUser;
  const tz = shift.timezone.split('/').pop()?.replace('_', ' ');

  const futureShifts = shift.recurringGroupId
    ? state.shifts.filter(s =>
        s.recurringGroupId === shift.recurringGroupId &&
        s.date >= shift.date &&
        s.assignedAgentIds.includes(me.id))
    : [shift];

  const [scope, setScope] = useState<'future' | 'day'>(futureShifts.length > 1 ? 'future' : 'day');
  const [from, setFrom] = useState(shift.startTime);
  const [to, setTo] = useState(shift.endTime);

  const invalid = !from || !to || from === to;
  const unchanged = from === shift.startTime && to === shift.endTime;
  const targets = scope === 'future' ? futureShifts : [shift];

  const handleSave = () => {
    if (invalid) return;
    const firstName = me.name.split(' ')[0];
    const when = scope === 'future'
      ? `from ${shift.date} onward (${targets.length} shifts)`
      : `on ${shift.date}`;
    dispatch({
      type: 'UPDATE_OWN_SHIFT_HOURS',
      payload: {
        shiftIds: targets.map(s => s.id),
        startTime: from,
        endTime: to,
        summary: `${firstName} changed "${shift.name}" hours to ${from}–${to} (${tz}) ${when}`,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Edit my hours — {shift.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            Currently <strong>{shift.startTime}–{shift.endTime}</strong> ({tz} time) on {shift.date}.
          </p>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-gray-400 uppercase mb-1">Start</label>
              <input type="time" value={from} onChange={e => setFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <span className="text-gray-400 pt-5">–</span>
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-gray-400 uppercase mb-1">End</label>
              <input type="time" value={to} onChange={e => setTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          {futureShifts.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setScope('future')}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                  scope === 'future' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                From this day on
              </button>
              <button
                onClick={() => setScope('day')}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                  scope === 'day' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Just this day
              </button>
            </div>
          )}

          <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {scope === 'future'
              ? <>Applies to {targets.length} shifts from {shift.date} on. Admins are notified.</>
              : <>Applies to {shift.date} only. Admins are notified.</>}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={handleSave}
            disabled={invalid || (unchanged && scope === 'day')}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save hours
          </button>
        </div>
      </div>
    </div>
  );
}
