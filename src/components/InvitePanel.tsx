import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Check, Copy, Mail, Timer, Trash2, UserPlus } from 'lucide-react';
import { COUNTRIES, getCountryName } from '../utils/holidays';
import { createInvite, deleteInvite, fetchInvites, type Invite } from '../lib/database';

function inviteMessage(inv: Pick<Invite, 'name' | 'email'>) {
  const first = inv.name.split(' ')[0];
  const url = window.location.origin;
  return `Hi ${first}, you've been invited to our Shifts app.\n\n` +
    `1. Open ${url}\n` +
    `2. Sign in with Google using ${inv.email}, or choose "Sign up" and create a password with that same email.\n\n` +
    `Your profile is already set up for you.`;
}

/**
 * Admin: invite a new member. Saves an invite (any email domain allowed); when
 * they sign up with that email, their profile is created with the name, country
 * and settings chosen here. Also lists pending invites.
 */
export function InvitePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, refreshData } = useApp();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [flexible, setFlexible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<Pick<Invite, 'name' | 'email'> | null>(null);

  const load = useCallback(() => fetchInvites().then(setInvites), []);
  useEffect(() => {
    let live = true;
    fetchInvites().then(list => { if (live) setInvites(list); });
    return () => { live = false; };
  }, []);

  const pending = invites.filter(i => !i.acceptedAt);
  const cleanEmail = email.trim().toLowerCase();
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail);
  const alreadyMember = state.users.some(u => u.email.toLowerCase() === cleanEmail);

  const copy = async (inv: Pick<Invite, 'name' | 'email'>) => {
    try {
      await navigator.clipboard.writeText(inviteMessage(inv));
      setCopied(inv.email);
      setTimeout(() => setCopied(c => (c === inv.email ? null : c)), 2000);
    } catch {
      window.prompt('Copy this message:', inviteMessage(inv));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !emailValid || alreadyMember) return;
    setBusy(true);
    setError(null);
    const err = await createInvite({
      email: cleanEmail,
      name,
      country: country || undefined,
      labels: [],
      flexibleHours: flexible,
      invitedBy: state.currentUser.id,
    });
    setBusy(false);
    if (err) { setError(err); return; }
    setJustCreated({ name: name.trim(), email: cleanEmail });
    setName(''); setEmail(''); setCountry(''); setFlexible(false);
    load();
  };

  const revoke = async (inv: Invite) => {
    if (!window.confirm(`Revoke the invite for ${inv.email}? They won't be able to sign up with it.`)) return;
    await deleteInvite(inv.id);
    load();
    refreshData();
  };

  return (
    <>
      {open && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          {justCreated ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                <Check className="w-4 h-4" /> Invite saved for {justCreated.email}
              </div>
              <p className="text-xs text-gray-500">Send them this message (Slack, WhatsApp or email):</p>
              <pre className="text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700">{inviteMessage(justCreated)}</pre>
              <div className="flex gap-2">
                <button onClick={() => copy(justCreated)} className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                  {copied === justCreated.email ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied === justCreated.email ? 'Copied' : 'Copy message'}
                </button>
                <button onClick={() => setJustCreated(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Invite another</button>
                <button onClick={() => { setJustCreated(null); onClose(); }} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Done</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoFocus required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email (any domain)</label>
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null); }} placeholder="name@example.com" required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  {alreadyMember && <p className="mt-1 text-xs text-red-600">This email already belongs to a team member.</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                  <select value={country} onChange={e => setCountry(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Not set</option>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="mt-3 flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={flexible} onChange={e => setFlexible(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-indigo-600" />
                <span className="text-sm text-gray-700">
                  Flexible hours
                  <span className="block text-xs text-gray-400">No fixed shifts — they clock in and out whenever they work, and everyone sees when they're on.</span>
                </span>
              </label>
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={busy || !name.trim() || !emailValid || alreadyMember}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  <UserPlus className="w-4 h-4" />
                  {busy ? 'Saving…' : 'Create invite'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-amber-50/60 rounded-xl border border-amber-200 p-3 mb-4">
          <p className="text-xs font-semibold text-amber-800 mb-2">Pending invites ({pending.length}) — they appear as agents once they sign up</p>
          <div className="space-y-1.5">
            {pending.map(inv => (
              <div key={inv.id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                    {inv.name}
                    {inv.flexibleHours && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full">
                        <Timer className="w-2.5 h-2.5" /> Flexible
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {inv.email}
                    {inv.country && <> · {getCountryName(inv.country)}</>}
                    {' '}· invited {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => copy(inv)} className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-md" title="Copy invite message">
                  {copied === inv.email ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === inv.email ? 'Copied' : 'Copy message'}
                </button>
                <button onClick={() => revoke(inv)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md" title="Revoke invite">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
