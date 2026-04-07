import { useApp } from '../store/AppContext';
import { Bell, UserPlus, AlertCircle, ArrowRightLeft, Clock, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Notification } from '../types';

const iconMap: Record<string, typeof Bell> = {
  assignment: UserPlus,
  change: AlertCircle,
  info: Bell,
  'swap-request': ArrowRightLeft,
};

const badgeColors: Record<string, string> = {
  assignment: 'bg-blue-100 text-blue-700',
  change: 'bg-amber-100 text-amber-700',
  info: 'bg-gray-100 text-gray-600',
  'swap-request': 'bg-orange-100 text-orange-700',
};

function groupByDate(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    const dateKey = n.timestamp.split('T')[0];
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(n);
  }
  return groups;
}

export function ActivityView() {
  const { state, dispatch } = useApp();

  // Show all notifications for admin user, reverse-chronological
  const allNotifications = [...state.notifications]
    .filter(n => n.userId === state.currentUser.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const grouped = groupByDate(allNotifications);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleClearAll = () => {
    dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Activity</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Recent shift changes and notifications — times shown in Amsterdam (CET/CEST)
          </p>
        </div>
        {allNotifications.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear all
          </button>
        )}
      </div>

      {allNotifications.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No activity yet</p>
        </div>
      ) : (
        sortedDates.map(dateKey => {
          const items = grouped[dateKey];
          const dateLabel = format(parseISO(dateKey), 'EEEE, MMMM d, yyyy');

          return (
            <div key={dateKey}>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                {dateLabel}
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {items.map(notif => {
                  const Icon = iconMap[notif.type] || Bell;
                  const badgeColor = badgeColors[notif.type] || badgeColors.info;

                  return (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 px-4 py-3 ${
                        !notif.read ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                      }`}
                    >
                      <div className={`mt-0.5 p-1.5 rounded-lg ${
                        !notif.read ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notif.read ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badgeColor}`}>
                            {notif.type}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Clock className="w-3 h-3" />
                            {new Date(notif.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}
                          </span>
                        </div>
                      </div>
                      {!notif.read && (
                        <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
