import { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { getUserTimezone } from '../utils/timezone';
import { getClockedInNow } from '../utils/clockedIn';

/** "Clocked in now" strip for the Schedule tab — visible to everyone. */
export function ClockedInNow() {
  const { state, refreshData } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const tz = getUserTimezone(state.currentUser.timezone, state.currentUser.country);

  // Re-evaluate every 30s, and pull fresh data every minute so clock-ins by
  // others show up quickly while the Schedule tab is open.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const pull = setInterval(() => { if (document.visibilityState === 'visible') refreshData(); }, 60_000);
    return () => { clearInterval(tick); clearInterval(pull); };
  }, [refreshData]);

  const entries = getClockedInNow(state.users, state.shifts, state.clockRecords, now);

  const duration = (since: string) => {
    const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  };

  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex w-2.5 h-2.5">
          {entries.length > 0 && <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />}
          <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${entries.length > 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
        </span>
        <span className="text-sm font-semibold text-gray-900">Clocked in now</span>
        <span className="text-xs text-gray-400">({entries.length})</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400">Nobody is clocked in right now.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map(({ user, shift, since }) => (
            <div
              key={user.id}
              className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-green-50 border border-green-200"
              title={`Since ${new Date(since).toLocaleString([], { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' })}`}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
                style={{ backgroundColor: user.color }}
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-medium text-gray-900">{user.name}</span>
              {shift && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: shift.color }}>
                  {shift.name}
                </span>
              )}
              <span className="text-[11px] text-green-700">
                since {new Date(since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz })} · {duration(since)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
