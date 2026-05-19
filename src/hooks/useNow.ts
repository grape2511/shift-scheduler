import { useEffect, useState } from 'react';

/**
 * Re-renders consumers on a fixed interval so time-dependent UI
 * (e.g., "is this shift currently active?") stays in sync.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
