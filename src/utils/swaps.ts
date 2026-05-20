import type { Shift, SwapRequest } from '../types';
import { formatDate } from './dates';

/**
 * A swap is "expired" once at least one of its two shift dates is in the
 * past, since neither side can meaningfully act on the trade anymore. If
 * either referenced shift is missing, treat the swap as expired too — it
 * can't be resolved.
 */
export function isSwapExpired(
  swap: Pick<SwapRequest, 'fromShiftId' | 'toShiftId'>,
  shifts: Pick<Shift, 'id' | 'date'>[],
  todayStr: string = formatDate(new Date()),
): boolean {
  const a = shifts.find(s => s.id === swap.fromShiftId);
  const b = shifts.find(s => s.id === swap.toShiftId);
  if (!a || !b) return true;
  return a.date < todayStr || b.date < todayStr;
}
