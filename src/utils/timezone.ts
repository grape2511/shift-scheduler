// Map country codes to their primary timezone
const COUNTRY_TIMEZONES: Record<string, string> = {
  NL: 'Europe/Amsterdam',
  US: 'America/New_York',
  DE: 'Europe/Berlin',
  GB: 'Europe/London',
  FR: 'Europe/Paris',
  FI: 'Europe/Helsinki',
  GR: 'Europe/Athens',
  HU: 'Europe/Budapest',
  IL: 'Asia/Jerusalem',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  PH: 'Asia/Manila',
  PL: 'Europe/Warsaw',
  RO: 'Europe/Bucharest',
  BR: 'America/Sao_Paulo',
  IN: 'Asia/Kolkata',
  VE: 'America/Caracas',
  AU: 'Australia/Sydney',
  JP: 'Asia/Tokyo',
  CA: 'America/Toronto',
};

/**
 * Get the timezone for a user based on their settings.
 * Priority: explicit timezone > country > browser default
 */
export function getUserTimezone(timezone?: string, country?: string): string {
  if (timezone && timezone !== 'auto') return timezone;
  if (country && COUNTRY_TIMEZONES[country]) return COUNTRY_TIMEZONES[country];
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Convert a time string (HH:mm) from one timezone to another.
 * E.g., "08:00" in "Europe/Amsterdam" → "14:00" in "Asia/Manila"
 * Handles DST automatically via Intl.DateTimeFormat.
 */
export function convertTime(time: string, fromTz: string, toTz: string): string {
  if (fromTz === toTz) return time;
  try {
    const [h, m] = time.split(':').map(Number);
    const today = new Date().toISOString().split('T')[0];
    const refDate = new Date(`${today}T12:00:00Z`);

    // Get offset of each timezone from UTC in minutes
    const fromOffset = getOffset(refDate, fromTz);
    const toOffset = getOffset(refDate, toTz);

    // Convert
    const diffMinutes = toOffset - fromOffset;
    let totalMinutes = h * 60 + m + diffMinutes;
    if (totalMinutes < 0) totalMinutes += 1440;
    if (totalMinutes >= 1440) totalMinutes -= 1440;

    const newH = Math.floor(totalMinutes / 60);
    const newM = totalMinutes % 60;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
  } catch {
    return time;
  }
}

function getOffset(date: Date, tz: string): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: tz });
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000;
}

/**
 * Build an absolute Date for the given YYYY-MM-DD + HH:mm interpreted in `tz`.
 */
function makeZonedDate(date: string, time: string, tz: string): Date {
  const [h, m] = time.split(':').map(Number);
  const utcGuess = new Date(`${date}T${time}:00Z`);
  const offset = getOffset(utcGuess, tz);
  return new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    h,
    m,
  ) - offset * 60000);
}

/**
 * Whether the given shift's time window currently contains `now`,
 * interpreted in the shift's own timezone. Handles overnight shifts
 * (endTime <= startTime) by treating end as the next day.
 */
export function isShiftActiveNow(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  try {
    const start = makeZonedDate(date, startTime, timezone);
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const overnight = eh * 60 + em <= sh * 60 + sm;
    const endDateStr = overnight
      ? new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000)
          .toISOString()
          .slice(0, 10)
      : date;
    const end = makeZonedDate(endDateStr, endTime, timezone);
    return now >= start && now < end;
  } catch {
    return false;
  }
}
