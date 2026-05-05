// Deterministic per-shift task rotation. Each agent assigned to a shift gets one
// task; the rotation is computed from the shift's date so it advances by one slot
// each day, ensuring every agent eventually rotates through every task without any
// stored state.

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

export function getTaskAssignments(
  shiftDate: string,
  agentIds: string[],
): Map<string, Task> {
  const result = new Map<string, Task>();
  if (agentIds.length === 0) return result;

  // Sort for deterministic order so the rotation is stable across renders/devices
  const sorted = Array.from(new Set(agentIds)).sort();
  const n = sorted.length;
  const slots = buildSlots(n);
  const offset = ((daysSinceReference(shiftDate) % n) + n) % n;

  for (let i = 0; i < n; i++) {
    const slotIdx = (i + offset) % n;
    result.set(sorted[i], slots[slotIdx]);
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
