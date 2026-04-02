/**
 * Convert a time string (HH:mm) from one timezone to another.
 * E.g., "08:00" in "Europe/Amsterdam" → "14:00" in "Asia/Manila"
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
