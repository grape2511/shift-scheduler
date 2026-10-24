// Deterministic per-shift task rotation. Two goals held at once, statelessly:
//   1. Coverage — every shift covers one each of the coverage tasks first, then
//      every extra agent goes to Dashboard (the highest-traffic queue). So the
//      non-Dashboard tasks stay at one person and Dashboard absorbs the surplus.
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

// The coverage tasks in priority order for a given shift date. The first slots cover
// one each of these; every extra agent beyond the list goes to Dashboard.
function baseTasksForDate(shiftDate: string): Task[] {
  return shiftDate >= KYC_NOTION_MERGE_FROM
    ? ['Dashboard', 'Intercom', 'KYC / Notion']
    : ['Dashboard', 'Intercom', 'KYC', 'Notion Tasks'];
}

// Slot allocation by team size, e.g. for the 3-task era:
//   1 → [D]            2 → [D, I]            3 → [D, I, KN]
//   4 → [D, I, KN, D]  5 → [D, I, KN, D, D]
function buildSlots(n: number, base: Task[]): Task[] {
  const slots: Task[] = [];
  for (let i = 0; i < n; i++) slots.push(i < base.length ? base[i] : 'Dashboard');
  return slots;
}

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

  // The coverage quota as an ordered list (task set depends on the shift date).
  const slots = buildSlots(n, baseTasksForDate(shiftDate));

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
    badge: 'bg-rose-100 text-rose-700',
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
