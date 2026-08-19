import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { getWeekDays, formatDate, formatShortDay, formatDayNum, formatWeekRange, addWeeks } from '../utils/dates';
import { ShiftCard } from './ShiftCard';
import { ShiftModal } from './ShiftModal';
import { ChevronLeft, ChevronRight, Plus, Copy, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import { isToday, startOfWeek } from 'date-fns';
import type { Shift } from '../types';

export function WeekView({ weekDate, onWeekDateChange }: { weekDate: Date; onWeekDateChange: (d: Date) => void }) {
  const { state, dispatch, activeAgents: agents, getShiftsForDate, getTimeOffsForDate, getPublicHolidaysForDate, setCoverageNote, clearCoverageNote } = useApp();
  const currentDate = weekDate;
  const setCurrentDate = onWeekDateChange;
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Coverage-note inline editor: which agent's note is being edited, and the draft text.
  const [noteEditFor, setNoteEditFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

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
              className={`bg-white min-h-[120px] sm:min-h-[160px] ${today ? 'bg-indigo-50/30' : ''}`}
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

              {/* Time Off Indicators (approved + pending) */}
              {timeOffs.length > 0 && (
                <div className="px-2 pt-2">
                  {timeOffs
                    .filter(t => (t.status || 'approved') !== 'rejected')
                    .map(to => {
                      const user = state.users.find(u => u.id === to.userId);
                      const isPending = (to.status || 'approved') === 'pending';
                      return (
                        <div
                          key={to.id}
                          className={`text-[10px] rounded px-1.5 py-0.5 mb-1 truncate ${
                            isPending
                              ? 'text-amber-700 bg-amber-50 border border-dashed border-amber-400'
                              : 'text-amber-700 bg-amber-100 border border-amber-300'
                          }`}
                          title={`${user?.name || 'Unknown'} — ${isPending ? 'Pending' : 'Approved'}${to.halfDay ? ' (½ day)' : ''}${to.reason ? ` — ${to.reason}` : ''}`}
                        >
                          {isPending && '⏳ '}{user?.name} {to.halfDay ? '(½ day)' : 'off'}
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

      {/* Upcoming Team Days Off (visible to all) */}
      {(() => {
        const upcoming = state.timeOffs
          .filter(t => (t.status || 'approved') === 'approved' && t.date >= formatDate(new Date()))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 15);
        if (upcoming.length === 0) return null;
        return (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Upcoming Team Days Off</h3>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {upcoming.map(to => {
                const agent = state.users.find(u => u.id === to.userId);
                return (
                  <div key={to.id} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium" style={{ backgroundColor: agent?.color || '#6366f1' }}>
                        {agent?.name?.[0] || '?'}
                      </div>
                      <span className="text-sm text-gray-700">{agent?.name}</span>
                      {to.halfDay && <span className="text-[9px] px-1 py-0.5 text-indigo-700 bg-indigo-50 rounded font-medium">½ day</span>}
                    </div>
                    <span className="text-xs text-gray-500">{to.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Weekly Agent Summary (admin only) */}
      {isAdmin && (() => {
        const weekDateStrs = weekDays.map(d => formatDate(d));
        const weekDateSet = new Set(weekDateStrs);
        const MIN_SHIFTS_PER_WEEK = 5;

        const weekStart = weekDateStrs[0]; // Monday — key for coverage notes
        const shiftLabels = ['USA Shift', 'EU Shift', 'Mid Shift'];
        const agentSummary = agents
          .filter(a => {
            const agentLabels = a.labels || (a.label ? [a.label] : []);
            return agentLabels.some(l => shiftLabels.includes(l));
          })
          .map(agent => {
            const shiftCount = weekDateStrs.filter(dateStr => {
              const shifts = getShiftsForDate(dateStr);
              return shifts.some(s => s.assignedAgentIds.includes(agent.id));
            }).length;
            const approvedDaysOff = state.timeOffs
              .filter(t => t.userId === agent.id && (t.status || 'approved') === 'approved' && weekDateSet.has(t.date))
              .reduce((sum, t) => sum + (t.halfDay ? 0.5 : 1), 0);
            const adjustedMin = Math.max(0, MIN_SHIFTS_PER_WEEK - approvedDaysOff);
            const note = (state.coverageNotes || []).find(n => n.userId === agent.id && n.weekStart === weekStart)?.note;
            return { agent, shiftCount, approvedDaysOff, adjustedMin, note };
          })
          .sort((a, b) => (a.shiftCount - a.adjustedMin) - (b.shiftCount - b.adjustedMin));

        // A shortfall with an admin note is intentional (e.g. a cross-week swap),
        // so it no longer counts as a red "under minimum" alarm.
        const underMin = agentSummary.filter(a => a.shiftCount < a.adjustedMin && !a.note);

        return (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Weekly Agent Coverage</h3>
              {underMin.length > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {underMin.length} under minimum
                </span>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {agentSummary.map(({ agent, shiftCount, approvedDaysOff, adjustedMin, note }) => {
                const isShort = shiftCount < adjustedMin;
                const isFlagged = isShort && !note; // red alarm only when unexplained
                const hasDaysOff = approvedDaysOff > 0;
                const editing = noteEditFor === agent.id;
                return (
                  <div key={agent.id} className={`px-4 py-2 border-b border-gray-50 last:border-0 ${isFlagged ? 'bg-red-50' : isShort ? 'bg-indigo-50/40' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0" style={{ backgroundColor: agent.color }}>
                          {agent.name[0]}
                        </div>
                        <span className="text-sm text-gray-700 truncate">{agent.name}</span>
                        {(agent.labels || []).slice(0, 1).map(l => (
                          <span key={l} className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded-full shrink-0">{l}</span>
                        ))}
                        {hasDaysOff && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium shrink-0"
                            title={`${approvedDaysOff} approved day${approvedDaysOff === 1 ? '' : 's'} off — coverage minimum reduced from ${MIN_SHIFTS_PER_WEEK} to ${adjustedMin}`}
                          >
                            {approvedDaysOff === 1 ? '1 day off' : `${approvedDaysOff} days off`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-sm font-bold ${isFlagged ? 'text-red-600' : isShort ? 'text-indigo-600' : 'text-gray-700'}`}>
                          {shiftCount}/{hasDaysOff ? adjustedMin : MIN_SHIFTS_PER_WEEK}
                        </span>
                        {isFlagged && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                        <button
                          onClick={() => { setNoteEditFor(editing ? null : agent.id); setNoteDraft(note || ''); }}
                          className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded transition-colors"
                          title={note ? 'Edit coverage note' : 'Add a note explaining this week (e.g. a swap)'}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {note && !editing && (
                      <div className="mt-1 ml-8">
                        <span className="inline-block text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                          {note}
                        </span>
                      </div>
                    )}

                    {editing && (
                      <div className="mt-1.5 ml-8 flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          value={noteDraft}
                          onChange={e => setNoteDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { setCoverageNote(agent.id, weekStart, noteDraft); setNoteEditFor(null); }
                            if (e.key === 'Escape') setNoteEditFor(null);
                          }}
                          placeholder="Reason (e.g. swapped Sat with Jainnie — worked 6 last week)"
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => { setCoverageNote(agent.id, weekStart, noteDraft); setNoteEditFor(null); }}
                          className="p-1 text-white bg-indigo-600 rounded hover:bg-indigo-700"
                          title="Save note"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        {note && (
                          <button
                            onClick={() => { clearCoverageNote(agent.id, weekStart); setNoteEditFor(null); }}
                            className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded"
                            title="Remove note"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
