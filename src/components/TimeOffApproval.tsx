import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, isSameMonth, isToday } from 'date-fns';
import { getMonthCalendarDays, formatDate, formatDayNum, formatMonthYear } from '../utils/dates';
import { updateTimeOffStatus } from '../lib/database';
import { TIME_OFF_CATEGORIES } from '../types';
import { v4 as uuid } from 'uuid';

export function TimeOffApproval() {
  const { state, dispatch, getAgentById, getShiftsForDate } = useApp();
  const [calendarDate, setCalendarDate] = useState(new Date());

  const pendingRequests = state.timeOffs
    .filter(t => (t.status || 'approved') === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date));

  const allTimeOffs = state.timeOffs.filter(t => (t.status || 'approved') !== 'rejected');
  const calDays = getMonthCalendarDays(calendarDate);

  const getCategoryInfo = (cat?: string) => TIME_OFF_CATEGORIES.find(c => c.value === cat) || TIME_OFF_CATEGORIES[0];

  const handleApprove = (id: string) => {
    dispatch({ type: 'UPDATE_TIME_OFF_STATUS', payload: { id, status: 'approved' } });
    updateTimeOffStatus(id, 'approved');
    const to = state.timeOffs.find(t => t.id === id);
    if (to) {
      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: uuid(),
          userId: to.userId,
          message: `Your time off request for ${to.date} has been approved ✅`,
          timestamp: new Date().toISOString(),
          read: false,
          type: 'info',
        },
      });
    }
  };

  const handleReject = (id: string) => {
    dispatch({ type: 'UPDATE_TIME_OFF_STATUS', payload: { id, status: 'rejected' } });
    updateTimeOffStatus(id, 'rejected');
    const to = state.timeOffs.find(t => t.id === id);
    if (to) {
      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: uuid(),
          userId: to.userId,
          message: `Your time off request for ${to.date} has been declined ❌`,
          timestamp: new Date().toISOString(),
          read: false,
          type: 'info',
        },
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Time Off Requests</h2>
          <p className="text-sm text-gray-500">{pendingRequests.length} pending</p>
        </div>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-6 space-y-2">
          {pendingRequests.map(to => {
            const agent = getAgentById(to.userId);
            const catInfo = getCategoryInfo(to.category);
            const shiftsOnDay = getShiftsForDate(to.date);
            const otherOffsOnDay = allTimeOffs.filter(t => t.date === to.date && t.id !== to.id && (t.status || 'approved') === 'approved');

            return (
              <div key={to.id} className="bg-white rounded-xl border border-amber-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {agent && (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0" style={{ backgroundColor: agent.color }}>
                        {agent.name[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{agent?.name}</p>
                      <p className="text-xs text-gray-500">{format(new Date(to.date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${catInfo.color}`}>{catInfo.label}</span>
                        {to.reason && <span className="text-xs text-gray-400">– {to.reason}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReject(to.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(to.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  </div>
                </div>

                {/* Context: who else is off and shift coverage */}
                <div className="mt-3 pt-3 border-t border-amber-100 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">Also off this day</p>
                    {otherOffsOnDay.length > 0 ? (
                      <div className="space-y-0.5">
                        {otherOffsOnDay.map(o => {
                          const a = getAgentById(o.userId);
                          return (
                            <p key={o.id} className="text-xs text-amber-700">{a?.name}</p>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No one</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">Shifts on this day</p>
                    {shiftsOnDay.length > 0 ? (
                      <div className="space-y-0.5">
                        {shiftsOnDay.map(s => (
                          <p key={s.id} className="text-xs text-gray-600">
                            {s.name} ({s.assignedAgentIds.length}/{s.requiredAgents} agents)
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No shifts</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingRequests.length === 0 && (
        <div className="mb-6 bg-green-50 rounded-xl border border-green-200 p-4 text-center">
          <p className="text-sm text-green-700">No pending requests</p>
        </div>
      )}

      {/* Calendar Overview */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <button onClick={() => setCalendarDate(addMonths(calendarDate, -1))} className="p-1.5 hover:bg-gray-200 rounded-lg">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-900">{formatMonthYear(calendarDate)}</span>
          <button onClick={() => setCalendarDate(addMonths(calendarDate, 1))} className="p-1.5 hover:bg-gray-200 rounded-lg">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-gray-500 text-center uppercase">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {calDays.map(day => {
            const dateStr = formatDate(day);
            const dayOffs = allTimeOffs.filter(t => t.date === dateStr);
            const shifts = getShiftsForDate(dateStr);
            const inMonth = isSameMonth(day, calendarDate);
            const isCurrentDay = isToday(day);

            return (
              <div
                key={dateStr}
                className={`bg-white min-h-[80px] ${isCurrentDay ? 'bg-indigo-50/30' : ''} ${!inMonth ? 'opacity-40' : ''}`}
              >
                <div className="px-2 py-1 flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isCurrentDay ? 'w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]' : 'text-gray-500'}`}>
                    {formatDayNum(day)}
                  </span>
                  {shifts.length > 0 && (
                    <span className="text-[9px] text-gray-400">{shifts.reduce((s, sh) => s + sh.assignedAgentIds.length, 0)} on shift</span>
                  )}
                </div>
                <div className="px-1 pb-1 space-y-0.5">
                  {dayOffs.map(to => {
                    const agent = getAgentById(to.userId);
                    const isPending = (to.status || 'approved') === 'pending';
                    return (
                      <div key={to.id} className={`text-[9px] rounded px-1 py-0.5 truncate ${
                        isPending ? 'text-amber-700 bg-amber-100 border border-amber-300' : 'text-amber-600 bg-amber-50'
                      }`}>
                        {isPending && '⏳ '}{agent?.name?.split(' ')[0]}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
