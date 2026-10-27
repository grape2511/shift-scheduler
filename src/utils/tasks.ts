// Deterministic per-shift task rotation. Two goals held at once, statelessly:
//   1. Coverage — every shift covers one each of the coverage tasks (see
//      buildSlots for the exact per-size makeup), with Dashboard taking the
//      surplus up to its cap. buildSlots defines the mix for each era.
//   2. Fair per-agent rotation — agents are ranked by id, and each agent takes the
//      coverage slot at (rank + day) mod n. Because that's a straight rotation of a
//      fixed slot list, every agent walks through *all* the slots over n days: the
//      assignment is an exact permutation of the quota each day (coverage holds),
//      and no agent is ever stuck on one task. Over a full cycle everyone pulls
//      Dashboard the same number of times, so the load is equal.
// This is deliberately collision-free: an earlier version gave each agent a hashed
// "preferred" task and bumped losers off contested tasks, which could pin an agent
// (whose hash collided with a teammate's) to Dashboard every single day.
//
// KYC + Notion merge: from 2026-10-23 onward KYC and Notion are a single combined
// task ("KYC / Notion") handled by one person, so the rotation runs on three tasks
// (Dashboard, Intercom, KYC / Notion). Shifts *before* that date keep the historical
// four-task split, so past rosters and reports are unchanged. The cutoff is applied
// per shift date and mirrored in the SQL shift_task_map.

// All task labels the app can display (current + legacy). The active rotation set
// is chosen per date in `baseTasksForDate`.
export type Task = 'Dashboard' | 'Intercom' | 'KYC' | 'Notion Tasks' | 'KYC / Notion';
export const TASKS: readonly Task[] = ['Dashboard', 'Intercom', 'KYC', 'Notion Tasks', 'KYC / Notion'];

// Date (inclusive) from which KYC and Notion are one combined task. ISO yyyy-mm-dd
// compares chronologically as a string, so a plain string compare picks the era.
export const KYC_NOTION_MERGE_FROM = '2026-10-23';

// The per-rank coverage slot list for a shift, in priority order. Rank r takes
// slots[(r + day) mod n], so this list's makeup sets each shift's task mix.
function buildSlots(n: number, shiftDate: string): Task[] {
  const slots: Task[] = [];
  if (shiftDate < KYC_NOTION_MERGE_FROM) {
    // Legacy four-task era (history, unchanged): D, I, KYC, Notion, extras → Dashboard.
    const base: Task[] = ['Dashboard', 'Intercom', 'KYC', 'Notion Tasks'];
    for (let i = 0; i < n; i++) slots.push(i < base.length ? base[i] : 'Dashboard');
    return slots;
  }
  // Merged three-task era: cover one each (Dashboard, Intercom, KYC/Notion); the
  // 4th person is a 2nd Dashboard (cap); every further person alternates Intercom /
  // KYC-Notion, so Dashboard stays at 2 and the other two stay even.
  //   1 → [D]            2 → [D, I]              3 → [D, I, KN]
  //   4 → [D, I, KN, D]  5 → [D, I, KN, D, I]    6 → [D, I, KN, D, I, KN]
  for (let i = 0; i < n; i++) {
    if (i === 0) slots.push('Dashboard');
    else if (i === 1) slots.push('Intercom');
    else if (i === 2) slots.push('KYC / Notion');
    else if (i === 3) slots.push('Dashboard');
    else slots.push((i - 4) % 2 === 0 ? 'Intercom' : 'KYC / Notion');
  }
  return slots;
}

// Shifts outside the support rotation (no Dashboard/Intercom/KYC duties). Mirrored
// in the SQL compute_shift_tasks, which skips these names.
export const NON_SUPPORT_SHIFTS: ReadonlySet<string> = new Set(['Finance Shift']);

const REFERENCE_DATE_MS = Date.UTC(2026, 0, 1); // 2026-01-01

function daysSinceReference(shiftDate: string): number {
  const t = new Date(`${shiftDate}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((t - REFERENCE_DATE_MS) / 86_400_000);
}

export function getTaskAssignments(
  shiftDate: string,
  agentIds: string[],
): Map<string, Task> {
  const result = new Map<string, Task>();
  const sorted = Array.from(new Set(agentIds)).sort();
  const n = sorted.length;
  if (n === 0) return result;

  // The coverage quota as an ordered list (makeup depends on the shift date).
  const slots = buildSlots(n, shiftDate);

  // Each agent (by rank) takes the slot `day` steps along from their rank, so the
  // whole shift rotates one slot per calendar day and every agent visits every slot.
  const day = daysSinceReference(shiftDate);
  for (let rank = 0; rank < n; rank++) {
    const pos = (((rank + day) % n) + n) % n;
    result.set(sorted[rank], slots[pos]);
  }

  return result;
}

// iconUrl is optional — tasks without an icon asset render as a text badge.
export const TASK_STYLES: Record<
  Task,
  { bg: string; iconUrl?: string; badge?: string; tooltip: string }
> = {
  Dashboard: {
    bg: 'bg-blue-50',
    iconUrl: '/icons/dashboard.png',
    tooltip: 'This shift you will mainly work on Dashboard Tickets',
  },
  Intercom: {
    bg: 'bg-purple-50',
    iconUrl: '/icons/intercom.png',
    tooltip: 'This shift you will mainly work on Intercom tickets',
  },
  'KYC / Notion': {
    bg: 'bg-rose-100',
    iconUrl: '/icons/kyc-notion.svg',
    tooltip: 'This shift you will mainly work on KYC and Notion tasks',
  },
  // Legacy single tasks — still shown for shifts before the KYC+Notion merge.
  KYC: {
    bg: 'bg-rose-100',
    badge: 'bg-rose-100 text-rose-700',
    tooltip: 'This shift you will mainly work on KYC',
  },
  'Notion Tasks': {
    bg: 'bg-gray-100',
    iconUrl: '/icons/notion.png',
    tooltip: 'This shift you will mainly work on pending Notion Tasks',
  },
};
