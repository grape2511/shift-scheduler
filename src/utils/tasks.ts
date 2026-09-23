// Deterministic per-shift task rotation. Two goals held at once, statelessly:
//   1. Coverage — every shift covers one each of Dashboard, Intercom, KYC and
//      Notion first, then every extra agent goes to Dashboard (the highest-traffic
//      queue). So Intercom/KYC/Notion stay at one and Dashboard absorbs the surplus
//      (e.g. 5 agents -> 2 Dashboard, 1 Intercom, 1 KYC, 1 Notion).
//   2. Fair per-agent rotation — each agent has their own rotation clock that
//      advances one task per calendar day, independent of who else is on the
//      shift, so nobody gets stuck on the same task when the roster changes.
// Each agent is given their personal preferred task; assignments are then capped
// to the per-task coverage quota, bumping only the minimum number of agents to the
// next task in their own cycle. Priority for a contested task rotates by day so the
// same person isn't always the one bumped.

export const TASKS = ['Dashboard', 'Intercom', 'KYC', 'Notion Tasks'] as const;
export type Task = (typeof TASKS)[number];

// The first four agents cover one each of Dashboard, Intercom, KYC, Notion (in
// that order for smaller shifts); every agent beyond the fourth goes to Dashboard.
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

// Stable per-agent starting point in the rotation (0..TASKS.length-1) so different
// agents are offset from each other and the shift naturally spreads across tasks.
function agentOffset(agentId: string): number {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) {
    h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return h % TASKS.length;
}

export function getTaskAssignments(
  shiftDate: string,
  agentIds: string[],
): Map<string, Task> {
  const result = new Map<string, Task>();
  const sorted = Array.from(new Set(agentIds)).sort();
  const n = sorted.length;
  if (n === 0) return result;

  // Per-task coverage quota (e.g. 4 agents -> 1 each of Intercom/Dashboard/KYC/Notion).
  const remaining: Record<Task, number> = { Dashboard: 0, Intercom: 0, KYC: 0, 'Notion Tasks': 0 };
  for (const slot of buildSlots(n)) remaining[slot]++;

  // Each agent's preferred task advances one step per calendar day.
  const day = daysSinceReference(shiftDate);
  const preferred = new Map<string, Task>();
  for (const id of sorted) {
    preferred.set(id, TASKS[(((day + agentOffset(id)) % TASKS.length) + TASKS.length) % TASKS.length]);
  }

  // Whose preference wins a contested task rotates by day, so the agent who gets
  // bumped isn't always the same person.
  const order = sorted.map((_, i) => sorted[(i + day) % n]);

  // Pass 1: grant preferred tasks while quota remains.
  const bumped: string[] = [];
  for (const id of order) {
    const t = preferred.get(id)!;
    if (remaining[t] > 0) {
      result.set(id, t);
      remaining[t]--;
    } else {
      bumped.push(id);
    }
  }

  // Pass 2: bumped agents advance to the next task in their own cycle that still
  // has room — a sensible "next in rotation" rather than an arbitrary leftover.
  for (const id of bumped) {
    const start = TASKS.indexOf(preferred.get(id)!);
    for (let k = 1; k <= TASKS.length; k++) {
      const t = TASKS[(start + k) % TASKS.length];
      if (remaining[t] > 0) {
        result.set(id, t);
        remaining[t]--;
        break;
      }
    }
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
