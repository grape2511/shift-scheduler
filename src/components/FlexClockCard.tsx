import { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { LogIn, LogOut, Timer } from 'lucide-react';
import { flexClockIn, flexClockOut } from '../lib/database';
import { getUserTimezone } from '../utils/timezone';
import { FLEX_SHIFT } from '../utils/clockedIn';

/**
 * Clock in / out for agents with flexible hours (no fixed schedule). Every
 * session becomes its own "Compliance Team" shift so hours, logs and corrections work
 * exactly like regular shifts. Renders nothing for everyone else.
 */
export function FlexClockCard() {
  const { state, refreshData } = useApp();
  const me = state.currentUser;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tz = getUserTimezone(me.timezone, me.country);

  const flexShiftIds = new Set(state.shifts.filter(s => s.name === FLEX_SHIFT).map(s => s.id));
  const mine = state.clockRecords.filter(r => r.userId === me.id && flexShiftIds.has(r.shiftId) && r.clockIn);
  const open = mine.find(r => !r.clockOut);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!me.flexibleHours) return null;

  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const todayMs = mine
    .filter(r => r.clockOut && new Date(r.clockIn!).toLocaleDateString('en-CA', { timeZone: tz }) === todayKey)
    .reduce((sum, r) => sum + (new Date(r.clockOut!).getTime() - new Date(r.clockIn!).getTime()), 0);
  const openMs = open ? now - new Date(open.clockIn!).getTime() : 0;

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  };
  const timer = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
  };

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    await refreshData();
    setBusy(false);
  };

  return (
    <div className={`mb-6 rounded-2xl border p-6 text-center ${open ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-center gap-2 mb-1">
        <Timer className={`w-4 h-4 ${open ? 'text-green-600' : 'text-teal-600'}`} />
        <p className={`text-sm font-medium ${open ? 'text-green-700' : 'text-gray-900'}`}>Flexible hours</p>
      </div>
      {open ? (
        <>
          <p className="text-5xl font-mono font-bold text-green-800 my-3">{timer(openMs)}</p>
          <p className="text-xs text-green-600 mb-5">
            Clocked in at {new Date(open.clockIn!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz })} · everyone can see you're working
          </p>
          <button
            onClick={() => run(() => flexClockOut(open.shiftId))}
            disabled={busy}
            className="inline-flex items-center gap-2 px-8 py-3 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {busy ? 'Clocking out…' : 'Clock Out'}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500 mt-1 mb-5">No fixed schedule. Clock in whenever you start working, and out when you stop.</p>
          <button
            onClick={() => run(flexClockIn)}
            disabled={busy}
            className="inline-flex items-center gap-2 px-8 py-3 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {busy ? 'Clocking in…' : 'Clock In'}
          </button>
        </>
      )}
      {(todayMs > 0 || open) && (
        <p className="text-xs text-gray-500 mt-4">Today so far: <strong>{fmt(todayMs + openMs)}</strong></p>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
