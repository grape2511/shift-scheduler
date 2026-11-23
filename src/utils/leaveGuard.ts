import type { Shift, TimeOff, User } from '../types';
import { NON_SUPPORT_SHIFTS } from './tasks';

export const FINANCE_SPECIALIST = 'Finance Specialist';

export function isFinanceSpecialist(user: Pick<User, 'labels'> | undefined): boolean {
  return !!user?.labels?.includes(FINANCE_SPECIALIST);
}

/**
 * Support shifts on `date` that would be left with NO finance specialist if
 * `agentId` came off them. Empty unless the agent is a finance specialist who
 * is currently the only one on that shift. Finance / Compliance shifts don't
 * need the role, so they're skipped.
 */
export function financeGapShifts(agentId: string, date: string, shifts: Shift[], users: User[]): Shift[] {
  if (!isFinanceSpecialist(users.find(u => u.id === agentId))) return [];
  return shifts.filter(s =>
    s.date === date &&
    !NON_SUPPORT_SHIFTS.has(s.name) &&
    s.assignedAgentIds.includes(agentId) &&
    !s.assignedAgentIds.some(id => id !== agentId && isFinanceSpecialist(users.find(u => u.id === id)))
  );
}

export interface LeaveEval {
  /** Non-null when the agent may NOT leave — show this to the agent. */
  blockedMessage: string | null;
  /** Shifts the agent would still work that week after leaving this one. */
  weeklyDayCount: number;
  /** Weekly minimum after crediting approved days off (normally 5). */
  weeklyAdjustedMin: number;
}

/**
 * Decide whether the current agent may remove themselves from `shift`.
 *
 * Rules:
 *  0. A finance specialist can't leave a shift that has no other finance
 *     specialist on it.
 *  1. A shift can't drop below its required headcount.
 *  2. Every agent owes 5 shifts a week unless an admin approved a day off,
 *     in which case the minimum drops by the size of the approved time off.
 *
 * The weekly minimum is a per-week rule, so a cross-week duty swap (cover a
 * teammate's Saturday, they cover yours next week) legitimately trips it —
 * that's why the block message steers agents to the Swap feature, which trades
 * two shifts atomically and never hits this guard.
 */
export function evalSelfLeave(
  shift: Shift,
  agentId: string,
  shifts: Shift[],
  timeOffs: TimeOff[],
  users: User[],
): LeaveEval {
  const minRequired = shift.requiredAgents || 1;
  const afterCount = shift.assignedAgentIds.length - 1;

  // Count the days they'd still work in this shift's week after removing this
  // one, and reduce the minimum by any approved days off that week.
  const d = new Date(shift.date + 'T12:00:00');
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
  const weekDateSet = new Set(weekDates);
  const weeklyDayCount = weekDates.filter(ds =>
    shifts.some(s => s.id !== shift.id && s.date === ds && s.assignedAgentIds.includes(agentId))
  ).length;
  const approvedDaysOff = timeOffs
    .filter(t => t.userId === agentId && (t.status || 'approved') === 'approved' && weekDateSet.has(t.date))
    .reduce((sum, t) => sum + (t.halfDay ? 0.5 : 1), 0);
  const weeklyAdjustedMin = Math.max(0, 5 - approvedDaysOff);

  // Rule 0: finance coverage.
  if (financeGapShifts(agentId, shift.date, [shift], users).length > 0) {
    return {
      blockedMessage:
        `Cannot leave — you're the only finance specialist on this shift. ` +
        `Swap with another finance specialist, or ask an admin to arrange cover first.`,
      weeklyDayCount,
      weeklyAdjustedMin,
    };
  }

  // Rule 1: headcount.
  if (afterCount < minRequired) {
    return {
      blockedMessage: `Cannot leave — this shift needs at least ${minRequired} agents and would only have ${afterCount}.`,
      weeklyDayCount,
      weeklyAdjustedMin,
    };
  }

  // Rule 2: weekly minimum (skipped when this exact day is an approved day off).
  const hasApprovedDayOff = timeOffs.some(t =>
    t.userId === agentId && t.date === shift.date && (t.status || 'approved') === 'approved'
  );
  if (!hasApprovedDayOff && weeklyDayCount < weeklyAdjustedMin) {
    return {
      blockedMessage:
        `Leaving this shift would drop you to ${weeklyDayCount} this week — you need at least ${weeklyAdjustedMin}.\n\n` +
        `• Trading with a teammate? Don't use Leave. Open this shift and pick "Swap Shift with Teammate" — that trades this shift for one of theirs, takes effect the moment they accept, and needs no admin. It also handles trades across different weeks (e.g. you cover their Saturday, they cover yours next week).\n\n` +
        `• Need the day off entirely? Request it from the Days Off tab so an admin can approve it.`,
      weeklyDayCount,
      weeklyAdjustedMin,
    };
  }

  return { blockedMessage: null, weeklyDayCount, weeklyAdjustedMin };
}
