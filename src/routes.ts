// Central map of tab id <-> URL path. Each tab is a real, shareable URL so it
// can be deep-linked, bookmarked, or opened in its own browser tab.
export const TAB_PATHS: Record<string, string> = {
  schedule: '/',
  agents: '/agents',
  clock: '/clock',
  'my-shifts': '/my-shifts',
  'my-clock-log': '/my-clock-log',
  'days-off': '/days-off',
  'time-off-approval': '/time-off',
  insights: '/insights',
  activity: '/activity',
  'clock-logs': '/clock-logs',
  settings: '/settings',
};

const PATH_TABS: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab])
);

export function pathForTab(tab: string): string {
  return TAB_PATHS[tab] || '/';
}

export function tabForPath(path: string): string {
  return PATH_TABS[path] || 'schedule';
}

// The tab implied by the current browser URL.
export function currentTab(): string {
  return tabForPath(window.location.pathname);
}
