import type { ClockRecord } from '../types';

// The Clock Out button renders in the same place the Clock In button just
// occupied, so a double-click (or an impatient second click while the first is
// still saving) used to clock the agent straight back out — producing records a
// couple of seconds long that looked to them like "the clock stopped by itself".
// Anything under this window is treated as an accident and has to be confirmed.
const ACCIDENTAL_CLOCK_OUT_MS = 2 * 60_000;

/**
 * Returns true if the clock-out should go ahead. Blocks a repeat clock-out on a
 * record that is already closed, and asks for confirmation when the agent has
 * been clocked in for less than two minutes.
 */
export function confirmClockOut(record: ClockRecord | undefined): boolean {
  if (!record?.clockIn) return false;
  if (record.clockOut) return false; // already clocked out — ignore the extra click

  const elapsedMs = Date.now() - new Date(record.clockIn).getTime();
  if (elapsedMs >= ACCIDENTAL_CLOCK_OUT_MS) return true;

  const secs = Math.max(0, Math.round(elapsedMs / 1000));
  return confirm(
    `You clocked in ${secs} second${secs === 1 ? '' : 's'} ago.\n\n` +
    'Clock out already? This will close your shift with almost no time logged.'
  );
}
