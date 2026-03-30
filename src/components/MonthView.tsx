import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { getMonthCalendarDays, formatDate, formatDayNum, formatMonthYear, addMonths } from '../utils/dates';
import { ShiftCard } from './ShiftCard';
import { ShiftModal } from './ShiftModal';
import { ChevronLeft, ChevronRight, Plus, Copy } from 'lucide-react';
import { isToday, isSameMonth, startOfWeek, startOfMonth } from 'date-fns';
import type { Shift } from '../types';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthView() {
  const { state, dispatch, getShiftsForDate, getTimeOffsForDate, getPublicHolidaysForDate } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isAdmin = state.currentUser.role === 'admin';
  const calendarDays = getMonthCalendarDays(currentDate);

  const handlePrevMonth = () => setCurrentDate(addMonths(currentDate, -1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleCreateShift = (date?: string) => {
    setEditingShift(null);
    setSelectedDate(date || null);
    setShowModal(true);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setShowModal(true);
  };

  const handleDuplicateMonth = () => {
    // Duplicate all shifts from current month to next month
    const monthStart = startOfMonth(currentDate);
    const nextMonthStart = startOfMonth(addMonths(currentDate, 1));
    const diffMs = nextMonthStart.getTime() - monthStart.getTime();

    const monthShifts = state.shifts.filter(s => {
      const d = new Date(s.date);
      return isSameMonth(d, currentDate);
    });

    if (monthShifts.length > 0) {
      // Use DUPLICATE_WEEK won't work for a month, so dispatch individual shifts
      // We'll duplicate week by week across the month
      const weeksInMonth = new Set<string>();
      monthShifts.forEach(s => {
        const weekStart = startOfWeek(new Date(s.date), { weekStartsOn: 1 });
        weeksInMonth.add(formatDate(weekStart));
      });

      weeksInMonth.forEach(weekStartStr => {
        const sourceStart = new Date(weekStartStr);
        const targetStart = new Date(sourceStart.getTime() + diffMs);
        dispatch({
          type: 'DUPLICATE_WEEK',
          payload: {
            sourceWeekStart: weekStartStr,
            targetWeekStart: formatDate(targetStart),
          },
        });
      });

      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {formatMonthYear(currentDate)}
          </h2>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDuplicateMonth}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">Duplicate Month</span>
            </button>
            <button
              onClick={() => handleCreateShift()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Shift
            </button>
          </div>
        )}
      </div>

      {/* Month Grid */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {DAY_HEADERS.map(day => (
            <div key={day} className="px-2 py-2 text-xs font-medium text-gray-500 text-center uppercase">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {calendarDays.map(day => {
            const dateStr = formatDate(day);
            const shifts = getShiftsForDate(dateStr);
            const timeOffs = getTimeOffsForDate(dateStr);
            const publicHolidays = getPublicHolidaysForDate(dateStr);
            const today = isToday(day);
            const inMonth = isSameMonth(day, currentDate);

            return (
              <div
                key={dateStr}
                className={`bg-white min-h-[100px] sm:min-h-[120px] ${
                  today ? 'bg-indigo-50/30' : ''
                } ${!inMonth ? 'opacity-40' : ''}`}
              >
                {/* Day Number */}
                <div className="px-2 py-1 flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      today
                        ? 'w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]'
                        : 'text-gray-500'
                    }`}
                  >
                    {formatDayNum(day)}
                  </span>
                  {isAdmin && inMonth && (
                    <button
                      onClick={() => handleCreateShift(dateStr)}
                      className="p-0.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded transition-colors opacity-0 hover:opacity-100 focus:opacity-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Time Off Indicators */}
                {timeOffs.length > 0 && (
                  <div className="px-1">
                    {timeOffs.map(to => {
                      const user = state.users.find(u => u.id === to.userId);
                      const isSick = to.category === 'sick';
                      return (
                        <div key={to.id} className={`text-[9px] rounded px-1 py-0.5 mb-0.5 truncate ${
                          isSick ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
                        }`} title={to.reason || to.category || 'Day off'}>
                          {user?.name?.split(' ')[0]} {isSick ? '🤒' : 'off'}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Public Holidays */}
                {publicHolidays.length > 0 && (
                  <div className="px-1">
                    {publicHolidays.slice(0, 2).map(({ agent, holidays }) => (
                      <div key={agent.id} className="text-[9px] text-purple-600 bg-purple-50 rounded px-1 py-0.5 mb-0.5 truncate" title={holidays.map(h => h.name).join(', ')}>
                        {agent.name.split(' ')[0]}: {holidays[0].name}
                      </div>
                    ))}
                    {publicHolidays.length > 2 && (
                      <div className="text-[9px] text-purple-500 px-1">+{publicHolidays.length - 2} more</div>
                    )}
                  </div>
                )}

                {/* Shifts */}
                <div className="px-1 pb-1 space-y-0.5">
                  {shifts.slice(0, 3).map(shift => (
                    <ShiftCard
                      key={shift.id}
                      shift={shift}
                      compact
                      onEdit={handleEditShift}
                    />
                  ))}
                  {shifts.length > 3 && (
                    <div className="text-[9px] text-gray-400 text-center font-medium">
                      +{shifts.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <ShiftModal
          onClose={() => { setShowModal(false); setEditingShift(null); }}
          editShift={editingShift}
          defaultDate={selectedDate || undefined}
        />
      )}
    </div>
  );
}
