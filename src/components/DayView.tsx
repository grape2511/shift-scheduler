import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatDate, formatDisplayDate, addDays } from '../utils/dates';
import { ShiftCard } from './ShiftCard';
import { ShiftModal } from './ShiftModal';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { isToday } from 'date-fns';
import type { Shift } from '../types';

export function DayView() {
  const { state, getShiftsForDate, getPublicHolidaysForDate } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const isAdmin = state.currentUser.role === 'admin';
  const dateStr = formatDate(currentDate);
  const shifts = getShiftsForDate(dateStr);

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setShowModal(true);
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentDate(addDays(currentDate, -1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentDate(addDays(currentDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {formatDisplayDate(currentDate)}
            {isToday(currentDate) && (
              <span className="ml-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                Today
              </span>
            )}
          </h2>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setEditingShift(null);
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Shift
          </button>
        )}
      </div>

      {/* Public Holidays */}
      {(() => {
        const holidays = getPublicHolidaysForDate(dateStr);
        if (holidays.length === 0) return null;
        return (
          <div className="mb-4 flex flex-wrap gap-2">
            {holidays.map(({ agent, holidays: hols }) => (
              <div key={agent.id} className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-sm">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.name[0]}
                </div>
                <span className="text-purple-700 font-medium">{agent.name.split(' ')[0]}</span>
                <span className="text-purple-500">{hols[0].name}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Shifts List */}
      {shifts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-300 text-5xl mb-4">📅</div>
          <h3 className="text-lg font-medium text-gray-500">No shifts scheduled</h3>
          <p className="text-sm text-gray-400 mt-1">
            {isAdmin ? 'Click "New Shift" to create one' : 'No shifts for this day'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map(shift => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              onEdit={handleEditShift}
            />
          ))}
        </div>
      )}

      {showModal && (
        <ShiftModal
          onClose={() => { setShowModal(false); setEditingShift(null); }}
          editShift={editingShift}
          defaultDate={dateStr}
        />
      )}
    </div>
  );
}
