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

// ---- Shared clock-time helpers (admin Clock Logs + agent My Clock Log) ----

export type ClockStatus = 'on-time' | 'late' | 'missed' | 'active' | 'no-show';

export const LATE_THRESHOLD_MIN = 10;

// The UTC instant of a wall-clock time (HH:MM) on `date` in `timezone`.
export function shiftStartUtcMs(date: string, startTime: string, timezone: string): number {
  const asUtc = new Date(`${date}T${startTime}:00Z`).getTime();
  const tzFormatted = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: timezone })).getTime();
  const utcFormatted = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return asUtc - (tzFormatted - utcFormatted);
}

// The UTC instant of a shift's end, accounting for overnight shifts.
export function shiftEndUtcMs(date: string, startTime: string, endTime: string, timezone: string): number {
  const startMin = parseInt(startTime.slice(0, 2)) * 60 + parseInt(startTime.slice(3, 5));
  const endMin = parseInt(endTime.slice(0, 2)) * 60 + parseInt(endTime.slice(3, 5));
  const overnight = endMin <= startMin;
  const endDate = overnight
    ? new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    : date;
  return shiftStartUtcMs(endDate, endTime, timezone);
}

// Convert an HH:MM entered in the shift's timezone to a UTC ISO instant on the
// shift's date. Handles a clock-out that falls past midnight (next day).
export function localHHMMToIso(hhmm: string, shiftDate: string, timezone: string, afterHHMM?: string): string {
  const nextDay = new Date(new Date(`${shiftDate}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const date = afterHHMM && hhmm <= afterHHMM ? nextDay : shiftDate;
  return new Date(shiftStartUtcMs(date, hhmm, timezone)).toISOString();
}

// Render an ISO instant as HH:MM in a given timezone, for time inputs.
export function isoToLocalHHMM(iso: string | null, tz: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
}

// Classify a clock record against its scheduled shift window.
export function clockStatus(
  clockIn: string | null,
  clockOut: string | null,
  startUtcMs: number,
  endUtcMs: number,
): { status: ClockStatus; durationMin: number | null } {
  if (!clockIn) return { status: 'no-show', durationMin: null };
  if (!clockOut) return { status: endUtcMs < Date.now() ? 'missed' : 'active', durationMin: null };
  const clockInMs = new Date(clockIn).getTime();
  const clockOutMs = new Date(clockOut).getTime();
  const durationMin = Math.round((clockOutMs - clockInMs) / 60000);
  const status: ClockStatus = clockInMs - startUtcMs > LATE_THRESHOLD_MIN * 60000 ? 'late' : 'on-time';
  return { status, durationMin };
}
