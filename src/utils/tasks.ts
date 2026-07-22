// Deterministic per-shift task rotation. Two goals held at once, statelessly:
//   1. Coverage — every day the shift covers each task (>=1 Intercom, >=1 Notion,
//      the rest on Dashboard) whenever there are at least 3 agents.
//   2. Fair per-agent rotation — each agent has their own rotation clock that
//      advances one task per calendar day (Dashboard -> Intercom -> Notion -> ...),
//      independent of who else is on the shift that day. This is what keeps an
//      agent from getting stuck on the same task when the daily roster changes.
// Each agent is given their personal preferred task; assignments are then capped
// to the per-task coverage quota, bumping only the minimum number of agents to the
// next task in their own cycle. Priority for a contested task rotates by day so the
// same person isn't always the one bumped.

export const TASKS = ['Dashboard', 'Intercom', 'Notion Tasks'] as const;
export type Task = (typeof TASKS)[number];

// Slot allocation by team size:
//   1 → [D]
//   2 → [D, I]
//   3 → [D, I, N]
//   4 → [D, D, I, N]   (extra weight on Dashboard, per ops decision)
//   5 → [D, D, I, I, N]
//   6 → [D, D, I, I, N, N]
//   N → ceil(N/3) Dashboard, ceil(rem/2) Intercom, rest Notion Tasks
function buildSlots(n: number): Task[] {
  if (n <= 0) return [];
  const dCount = Math.ceil(n / 3);
  const remaining = n - dCount;
  const iCount = Math.ceil(remaining / 2);
  const tCount = remaining - iCount;
  return [
    ...Array(dCount).fill('Dashboard' as Task),
    ...Array(iCount).fill('Intercom' as Task),
    ...Array(tCount).fill('Notion Tasks' as Task),
  ];
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

  // Per-task coverage quota (e.g. 4 agents -> 2 Dashboard, 1 Intercom, 1 Notion).
  const remaining: Record<Task, number> = { Dashboard: 0, Intercom: 0, 'Notion Tasks': 0 };
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

export const TASK_STYLES: Record<
  Task,
  { bg: string; iconUrl: string; tooltip: string }
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
  'Notion Tasks': {
    bg: 'bg-gray-100',
    iconUrl: '/icons/notion.png',
    tooltip: 'This shift you will mainly work on pending Notion Tasks',
  },
};
