import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Clock, X } from 'lucide-react';
import type { Shift } from '../types';

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Join a shift — either for the whole thing or just part of it. On a partial
 * join the agent is still added to the roster, but a coverage window is stored
 * and shown on the card so everyone can see exactly which hours they cover.
 */
export function JoinShiftModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { state, dispatch, getPartial, setPartial, clearPartial } = useApp();
  const me = state.currentUser.id;
  const alreadyOn = shift.assignedAgentIds.includes(me);
  const existing = getPartial(shift.id, me);

  const startMin = toMin(shift.startTime);
  let dur = (toMin(shift.endTime) - startMin + 1440) % 1440;
  if (dur === 0) dur = 1440; // treat 00:00→00:00 as a full day
  // Quarter boundaries b0..b4 across the shift's duration.
  const b = [0, 1, 2, 3, 4].map(i => toHHMM(startMin + Math.round((dur * i) / 4)));
  const tz = shift.timezone.split('/').pop();

  const [mode, setMode] = useState<'full' | 'partial'>(existing ? 'partial' : 'full');
  const [from, setFrom] = useState(existing?.startTime || shift.startTime);
  const [to, setTo] = useState(existing?.endTime || shift.endTime);

  const presets: { label: string; from: string; to: string }[] = [
    { label: '1st half', from: b[0], to: b[2] },
    { label: '2nd half', from: b[2], to: b[4] },
    { label: 'Q1', from: b[0], to: b[1] },
    { label: 'Q2', from: b[1], to: b[2] },
    { label: 'Q3', from: b[2], to: b[3] },
    { label: 'Q4', from: b[3], to: b[4] },
  ];

  const partialInvalid = mode === 'partial' && (!from || !to || from === to);

  const handleConfirm = () => {
    if (partialInvalid) return;
    if (!alreadyOn) dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: shift.id, agentId: me } });
    if (mode === 'full') clearPartial(shift.id, me);
    else setPartial(shift.id, me, from, to);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {alreadyOn ? 'Your hours' : 'Join'} — {shift.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            Full shift is <strong>{shift.startTime}–{shift.endTime}</strong> ({tz}). Cover all of it, or just part.
          </p>

          {/* Full vs partial */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('full')}
              className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                mode === 'full' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Full shift
            </button>
            <button
              onClick={() => setMode('partial')}
              className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                mode === 'partial' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Part of it
            </button>
          </div>

          {mode === 'partial' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {presets.map(p => {
                  const active = from === p.from && to === p.to;
                  return (
                    <button
                      key={p.label}
                      onClick={() => { setFrom(p.from); setTo(p.to); }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                        active ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                      }`}
                      title={`${p.from}–${p.to}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-gray-400 uppercase mb-1">From</label>
                  <input type="time" value={from} onChange={e => setFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <span className="text-gray-400 pt-5">–</span>
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-gray-400 uppercase mb-1">To</label>
                  <input type="time" value={to} onChange={e => setTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                You'll show on the shift as covering <strong>{from}–{to}</strong> only.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={partialInvalid}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {alreadyOn ? 'Save hours' : mode === 'full' ? 'Join full shift' : `Join ${from}–${to}`}
          </button>
        </div>
      </div>
    </div>
  );
}
