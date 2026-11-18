import type { ClockRecord, Shift, User } from '../types';

export const FLEX_SHIFT = 'Compliance Team';

// An open clock record older than this is a forgotten / wiped clock-out, not
// someone actually working right now.
const STALE_MS = 16 * 60 * 60 * 1000;

export interface ClockedInEntry {
  user: User;
  shift: Shift | undefined;
  since: string;
}

/** Everyone currently clocked in (open record, started in the last 16h), earliest first. */
export function getClockedInNow(users: User[], shifts: Shift[], records: ClockRecord[], nowMs = Date.now()): ClockedInEntry[] {
  const usersById = new Map(users.map(u => [u.id, u]));
  const shiftsById = new Map(shifts.map(s => [s.id, s]));
  const latest = new Map<string, ClockedInEntry>();
  for (const r of records) {
    if (!r.clockIn || r.clockOut) continue;
    const started = new Date(r.clockIn).getTime();
    if (nowMs - started > STALE_MS || started > nowMs + 60_000) continue;
    const user = usersById.get(r.userId);
    if (!user || user.active === false) continue;
    const prev = latest.get(user.id);
    if (!prev || prev.since < r.clockIn) latest.set(user.id, { user, shift: shiftsById.get(r.shiftId), since: r.clockIn });
  }
  return [...latest.values()].sort((a, b) => a.since.localeCompare(b.since));
}
