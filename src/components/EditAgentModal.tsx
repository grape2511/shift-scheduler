import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { X, Info } from 'lucide-react';
import { adminUpdateEmail } from '../lib/database';
import type { User } from '../types';

/** Admin-only editor for an agent's name and email. */
export function EditAgentModal({ agent, onClose }: { agent: User; onClose: () => void }) {
  const { dispatch } = useApp();
  const [name, setName] = useState(agent.name);
  const [email, setEmail] = useState(agent.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const nameChanged = cleanName !== agent.name;
  const emailChanged = cleanEmail !== agent.email.toLowerCase();
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail);
  const canSave = !busy && !!cleanName && emailValid && (nameChanged || emailChanged);

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    if (emailChanged) {
      const err = await adminUpdateEmail(agent.id, cleanEmail);
      if (err) {
        setError(err);
        setBusy(false);
        return;
      }
    }
    const updates: Partial<User> = {};
    if (nameChanged) updates.name = cleanName;
    if (emailChanged) updates.email = cleanEmail;
    dispatch({ type: 'UPDATE_USER', payload: { id: agent.id, updates } });
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Edit profile — {agent.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <form className="px-5 py-4 space-y-4" onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {email && !emailValid && <p className="mt-1 text-xs text-red-600">Enter a valid email address.</p>}
          </div>

          {emailChanged && emailValid && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                This changes the address they sign in with. Google sign-in keeps working,
                but the new email only sticks once their Google account uses it too.
              </span>
            </p>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button
              type="submit"
              disabled={!canSave}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
