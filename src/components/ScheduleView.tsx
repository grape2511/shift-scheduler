import { useState } from 'react';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { Calendar, CalendarDays, List } from 'lucide-react';
import type { ViewMode } from '../types';

export function ScheduleView() {
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  return (
    <div>
      {/* View Toggle */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
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
