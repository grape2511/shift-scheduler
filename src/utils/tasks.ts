// Deterministic per-shift task rotation. Two goals held at once, statelessly:
//   1. Coverage — every shift covers one each of Dashboard, Intercom, KYC and
//      Notion first, then every extra agent goes to Dashboard (the highest-traffic
//      queue). So Intercom/KYC/Notion stay at one and Dashboard absorbs the surplus
//      (e.g. 5 agents -> 2 Dashboard, 1 Intercom, 1 KYC, 1 Notion).
//   2. Fair per-agent rotation — agents are ranked by id, and each agent takes the
//      coverage slot at (rank + day) mod n. Because that's a straight rotation of a
//      fixed slot list, every agent walks through *all* the slots over n days: the
//      assignment is an exact permutation of the quota each day (coverage holds),
//      and no agent is ever stuck on one task. Over a full cycle everyone pulls
//      Dashboard the same number of times, so the load is equal.
// This is deliberately collision-free: an earlier version gave each agent a hashed
// "preferred" task and bumped losers off contested tasks, which could pin an agent
// (whose hash collided with a teammate's) to Dashboard every single day.

export const TASKS = ['Dashboard', 'Intercom', 'KYC', 'Notion Tasks'] as const;
export type Task = (typeof TASKS)[number];

// The first four slots cover one each of Dashboard, Intercom, KYC, Notion (in that
// order for smaller shifts); every slot beyond the fourth is Dashboard.
const BASE_PRIORITY: Task[] = ['Dashboard', 'Intercom', 'KYC', 'Notion Tasks'];

// Slot allocation by team size:
//   1 → [D]                      2 → [D, I]
//   3 → [D, I, KYC]              4 → [D, I, KYC, N]
//   5 → [D, I, KYC, N, D]        6 → [D, I, KYC, N, D, D]
function buildSlots(n: number): Task[] {
  const slots: Task[] = [];
  for (let i = 0; i < n; i++) slots.push(i < BASE_PRIORITY.length ? BASE_PRIORITY[i] : 'Dashboard');
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

  // The coverage quota as an ordered list, e.g. 5 agents -> [D, I, KYC, N, D].
  const slots = buildSlots(n);

  // Each agent (by rank) takes the slot `day` steps along from their rank, so the
  // whole shift rotates one slot per calendar day and every agent visits every slot.
  const day = daysSinceReference(shiftDate);
  for (let rank = 0; rank < n; rank++) {
    const pos = (((rank + day) % n) + n) % n;
    result.set(sorted[rank], slots[pos]);
  }

  return result;
}

// iconUrl is optional — tasks without an icon asset (KYC) render as a text badge.
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
