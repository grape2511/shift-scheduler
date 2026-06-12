import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { X, Copy } from 'lucide-react';
import { formatDate } from '../utils/dates';

interface Props {
  onClose: () => void;
}

// Returns the YYYY-MM-DD of the Monday of the week containing `date`.
function mondayOf(date: Date): string {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - dow);
  return formatDate(d);
}

export function ScheduleMirrorModal({ onClose }: Props) {
  const { state, mirrorAgentSchedule } = useApp();

  const lastMonday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return mondayOf(d);
  }, []);
  const nextMonday = useMemo(() => {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() + (7 - dow));
    return formatDate(d);
  }, []);

  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [refWeek, setRefWeek] = useState(lastMonday);
  const [targetStart, setTargetStart] = useState(nextMonday);
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ patterns: number; shiftsAssigned: number } | null>(null);

  const sourceCandidates = state.users; // include inactive — replacing a terminated agent is the main use case
  const targetCandidates = state.users.filter(u => u.active !== false && u.id !== sourceId);

  const preview = useMemo(() => {
    if (!sourceId) return null;
    const dayMs = 86400000;
    const start = new Date(`${refWeek}T00:00:00Z`).getTime();
    const dates = new Set(
      Array.from({ length: 7 }, (_, i) => new Date(start + i * dayMs).toISOString().slice(0, 10)),
    );
    return state.shifts
      .filter(s => dates.has(s.date) && s.assignedAgentIds.includes(sourceId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [state.shifts, sourceId, refWeek]);

  const canApply = !busy && sourceId && targetId && weeks > 0 && (preview?.length ?? 0) > 0;

  const handleApply = async () => {
    if (!canApply) return;
    setBusy(true);
    const r = await mirrorAgentSchedule(sourceId, targetId, refWeek, targetStart, weeks);
    setResult(r);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-lg w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Copy className="w-4 h-4 text-indigo-500" />
            Copy schedule between agents
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500">
            Mirrors one agent's weekly pattern onto another. Matches by shift name, day of week, and start time.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Copy from</label>
              <select
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="">Choose agent…</option>
                {sourceCandidates.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{a.active === false ? ' (inactive)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Copy to</label>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="">Choose agent…</option>
                {targetCandidates.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reference week (Monday)</label>
              <input
                type="date"
                value={refWeek}
                onChange={e => setRefWeek(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Apply from (Monday)</label>
              <input
                type="date"
                value={targetStart}
                onChange={e => setTargetStart(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">For how many weeks?</label>
            <input
              type="number"
              min={1}
              max={26}
              value={weeks}
              onChange={e => setWeeks(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
              className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>

          {preview && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                Pattern to copy ({preview.length} shift{preview.length === 1 ? '' : 's'})
              </p>
              {preview.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  No shifts found for this agent in that week.
                </p>
              ) : (
                <div className="border border-gray-100 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
                  {preview.map(s => (
                    <div key={s.id} className="px-3 py-1.5 text-xs flex items-center justify-between">
                      <span className="text-gray-700">{s.date} · {s.name}</span>
                      <span className="text-gray-400">{s.startTime}–{s.endTime}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Added the replacement to {result.shiftsAssigned} shift{result.shiftsAssigned === 1 ? '' : 's'}
              {' '}across {weeks} week{weeks === 1 ? '' : 's'}.
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleApply}
              disabled={!canApply}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Copying…' : 'Copy schedule'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
