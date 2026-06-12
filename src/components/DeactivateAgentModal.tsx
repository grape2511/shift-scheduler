import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { X, AlertTriangle } from 'lucide-react';
import { formatDate } from '../utils/dates';
import type { User } from '../types';

interface Props {
  agent: User;
  onClose: () => void;
}

export function DeactivateAgentModal({ agent, onClose }: Props) {
  const { state, activeAgents, setAgentActive } = useApp();
  const [mode, setMode] = useState<'remove' | 'transfer'>('remove');
  const [transferTo, setTransferTo] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const todayStr = formatDate(new Date());
  const futureShifts = state.shifts.filter(
    s => s.date >= todayStr && s.assignedAgentIds.includes(agent.id),
  );
  const futureShiftCount = futureShifts.length;
  const candidates = activeAgents.filter(a => a.id !== agent.id);

  const canConfirm = !busy && (mode === 'remove' || !!transferTo);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    await setAgentActive(agent.id, false, mode === 'transfer' ? transferTo : undefined);
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Deactivate {agent.name}?
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            They'll be signed out and blocked from logging back in until you re-activate them.
          </p>

          {futureShiftCount > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">
                {futureShiftCount} upcoming shift{futureShiftCount === 1 ? '' : 's'} on or after today
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  checked={mode === 'remove'}
                  onChange={() => setMode('remove')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm text-gray-900">Just remove them</p>
                  <p className="text-xs text-gray-500">Slots will be left empty until you reassign.</p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  checked={mode === 'transfer'}
                  onChange={() => setMode('transfer')}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">Transfer them to another agent</p>
                  {mode === 'transfer' && (
                    <select
                      value={transferTo}
                      onChange={e => setTransferTo(e.target.value)}
                      className="mt-1.5 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    >
                      <option value="">Choose someone…</option>
                      {candidates.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No upcoming shifts assigned — nothing to transfer.</p>
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
          >
            {busy ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}
