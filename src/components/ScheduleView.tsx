import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { Calendar, CalendarDays, List, Clock } from 'lucide-react';
import { getWeekDays, formatDate } from '../utils/dates';
import { convertTime, getUserTimezone } from '../utils/timezone';
import { format } from 'date-fns';
import type { ViewMode } from '../types';

export function ScheduleView() {
  const { state, getShiftsForDate } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('week');

  const isAdmin = state.currentUser.role === 'admin';
  const userTimezone = getUserTimezone(state.currentUser.timezone, state.currentUser.country);

  // Get this week's shifts for the current agent
  const thisWeekDays = getWeekDays(new Date());
  const myWeekShifts = !isAdmin ? thisWeekDays.flatMap(day => {
    const dateStr = formatDate(day);
    return getShiftsForDate(dateStr)
      .filter(s => [...new Set(s.assignedAgentIds)].includes(state.currentUser.id))
      .map(s => ({ ...s, dayLabel: format(day, 'EEE') }));
  }) : [];

  // Group shifts by name for a compact display
  const shiftGroups = new Map<string, { days: string[]; startTime: string; endTime: string; timezone: string; color?: string }>();
  for (const s of myWeekShifts) {
    const key = s.name;
    if (!shiftGroups.has(key)) {
      shiftGroups.set(key, { days: [], startTime: s.startTime, endTime: s.endTime, timezone: s.timezone, color: s.color });
    }
    shiftGroups.get(key)!.days.push(s.dayLabel);
  }

  return (
    <div>
      {/* My Shifts This Week Banner */}
      {!isAdmin && myWeekShifts.length > 0 && (
        <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Your shifts this week</span>
            <span className="text-xs text-indigo-500">({myWeekShifts.length} shift{myWeekShifts.length !== 1 ? 's' : ''})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...shiftGroups.entries()].map(([name, info]) => {
              const localStart = convertTime(info.startTime, info.timezone, userTimezone);
              const localEnd = convertTime(info.endTime, info.timezone, userTimezone);
              return (
                <div
                  key={name}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ backgroundColor: info.color || '#6366f1' }}
                >
                  <span>{name}</span>
                  <span className="opacity-80">{localStart}–{localEnd}</span>
                  <span className="opacity-70">{info.days.join(', ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setViewMode('week')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'week'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Week
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'month'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Month
        </button>
        <button
          onClick={() => setViewMode('day')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'day'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <List className="w-4 h-4" />
          Day
        </button>
      </div>

      {viewMode === 'month' && <MonthView />}
      {viewMode === 'week' && <WeekView />}
      {viewMode === 'day' && <DayView />}
    </div>
  );
}
