import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { getWeekDays, formatDate, formatShortDay, formatDayNum, formatWeekRange, addWeeks } from '../utils/dates';
import { ShiftCard } from './ShiftCard';
import { ShiftModal } from './ShiftModal';
import { ChevronLeft, ChevronRight, Plus, Copy } from 'lucide-react';
import { isToday, startOfWeek } from 'date-fns';
import type { Shift } from '../types';

export function WeekView() {
  const { state, dispatch, getShiftsForDate, getTimeOffsForDate, getPublicHolidaysForDate } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isAdmin = state.currentUser.role === 'admin';
  const weekDays = getWeekDays(currentDate);

  const handlePrevWeek = () => setCurrentDate(addWeeks(currentDate, -1));
  const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
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

  const handleDuplicateWeek = () => {
    const sourceStart = formatDate(startOfWeek(currentDate, { weekStartsOn: 1 }));
    const targetStart = formatDate(startOfWeek(addWeeks(currentDate, 1), { weekStartsOn: 1 }));
    dispatch({ type: 'DUPLICATE_WEEK', payload: { sourceWeekStart: sourceStart, targetWeekStart: targetStart } });
    setCurrentDate(addWeeks(currentDate, 1));
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevWeek}
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
              onClick={handleNextWeek}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {formatWeekRange(currentDate)}
          </h2>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDuplicateWeek}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">Duplicate Week</span>
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

      {/* Week Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden border border-gray-200">
        {weekDays.map(day => {
          const dateStr = formatDate(day);
          const shifts = getShiftsForDate(dateStr);
          const timeOffs = getTimeOffsForDate(dateStr);
          const publicHolidays = getPublicHolidaysForDate(dateStr);
          const today = isToday(day);

          return (
            <div
              key={dateStr}
              className={`bg-white min-h-[160px] ${today ? 'bg-indigo-50/30' : ''}`}
            >
              {/* Day Header */}
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 uppercase">
                    {formatShortDay(day)}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      today
                        ? 'w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center'
                        : 'text-gray-700'
                    }`}
                  >
                    {formatDayNum(day)}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleCreateShift(dateStr)}
                    className="p-1 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Time Off Indicators */}
              {timeOffs.length > 0 && (
                <div className="px-2 pt-2">
                  {timeOffs.map(to => {
                    const user = state.users.find(u => u.id === to.userId);
                    const isSick = to.category === 'sick';
                    const catLabel = to.category ? to.category.charAt(0).toUpperCase() + to.category.slice(1) : 'Off';
                    return (
                      <div key={to.id} className={`text-[10px] rounded px-1.5 py-0.5 mb-1 truncate ${
                        isSick ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
                      }`}>
                        {user?.name} – {catLabel}{to.reason ? `: ${to.reason}` : ''}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Public Holidays */}
              {publicHolidays.length > 0 && (
                <div className="px-2 pt-1">
                  {publicHolidays.map(({ agent, holidays }) => (
                    <div key={agent.id} className="text-[10px] text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 mb-1 truncate" title={holidays.map(h => h.name).join(', ')}>
                      {agent.name.split(' ')[0]}: {holidays[0].name}
                    </div>
                  ))}
                </div>
              )}

              {/* Shifts */}
              <div className="p-2 space-y-1.5">
                {shifts.length === 0 && (
                  <div className="text-xs text-gray-300 text-center py-4">No shifts</div>
                )}
                {shifts.map(shift => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    compact
                    onEdit={handleEditShift}
                  />
                ))}
              </div>
            </div>
          );
        })}
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
