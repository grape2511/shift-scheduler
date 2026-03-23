export const SHIFT_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
];

export const AGENT_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#f43f5e',
  '#eab308',
];

export function getNextColor(usedColors: string[], palette: string[]): string {
  const available = palette.filter(c => !usedColors.includes(c));
  return available.length > 0 ? available[0] : palette[Math.floor(Math.random() * palette.length)];
}
