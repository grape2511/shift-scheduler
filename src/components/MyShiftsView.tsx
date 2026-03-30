import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { ShiftCard } from './ShiftCard';
import { Calendar, X, ArrowRightLeft, Check, XCircle, Clock, ChevronLeft, ChevronRight, Plus, LogIn, LogOut } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay, addMonths, isSameMonth, isToday } from 'date-fns';
import { getHolidays, getCountryName } from '../utils/holidays';
import { getMonthCalendarDays, formatDate, formatDayNum, formatMonthYear } from '../utils/dates';
import { TIME_OFF_CATEGORIES, type TimeOffCategory } from '../types';
import { insertTimeOff, deleteTimeOff as dbDeleteTimeOff, insertNotification } from '../lib/database';
import { sendSlackNotification } from '../utils/slack';

export function MyShiftsView() {
  const { state, dispatch, getShiftsForAgent, getPendingSwapRequests, getAgentById, getMonthlyHours, getPtoBalance } = useApp();
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [timeOffDate, setTimeOffDate] = useState('');
  const [timeOffReason, setTimeOffReason] = useState('');
  const [timeOffCategory, setTimeOffCategory] = useState<TimeOffCategory>('vacation');
  const [calendarDate, setCalendarDate] = useState(new Date());

  const myShifts = getShiftsForAgent(state.currentUser.id);
  const today = startOfDay(new Date());
  const now = new Date();
  const monthlyHours = getMonthlyHours(state.currentUser.id, now.getFullYear(), now.getMonth());
  const TARGET_HOURS = 208;
  const isOvertime = monthlyHours > TARGET_HOURS;

  const upcomingShifts = myShifts.filter(s => !isBefore(parseISO(s.date), today));
  const pastShifts = myShifts.filter(s => isBefore(parseISO(s.date), today));

  const myTimeOffs = state.timeOffs.filter(t => t.userId === state.currentUser.id);

  const handleAddTimeOff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeOffDate) return;
    const balance = getPtoBalance(state.currentUser.id);
    if (timeOffCategory === 'sick' && balance.sickRemaining <= 0) {
      if (!confirm('You have no remaining sick days this year. Continue anyway?')) return;
    } else if (timeOffCategory !== 'sick' && balance.remaining <= 0) {
      if (!confirm('You have no remaining paid days off this year. Continue anyway?')) return;
    }
    const isAdmin = state.currentUser.role === 'admin';
    const timeOffId = uuid();
    const status = (isAdmin ? 'approved' : 'pending') as 'approved' | 'pending';
    const timeOffRecord = {
      id: timeOffId,
      userId: state.currentUser.id,
      date: timeOffDate,
      reason: timeOffReason || undefined,
      category: timeOffCategory,
      status,
    };
    dispatch({ type: 'ADD_TIME_OFF', payload: timeOffRecord });
    // Write directly to DB (don't rely on sync)
    insertTimeOff(timeOffRecord);
    // Notify the approver (einav@adrevival.io)
    if (!isAdmin) {
      const approver = state.users.find(u => u.email === 'einav@adrevival.io');
      if (approver) {
        const notif = {
          id: uuid(),
          userId: approver.id,
          message: `${state.currentUser.name} is requesting ${timeOffCategory || 'time'} off on ${timeOffDate}${timeOffReason ? ` — ${timeOffReason}` : ''}`,
          timestamp: new Date().toISOString(),
          read: false,
          type: 'info' as const,
        };
        dispatch({ type: 'ADD_NOTIFICATION', payload: notif });
        insertNotification(notif);
      }
      // Slack notification
      const slackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
      if (slackUrl) {
        sendSlackNotification(slackUrl,
          `🏖️ *Time off request*: ${state.currentUser.name} is requesting *${timeOffCategory}* off on ${timeOffDate}${timeOffReason ? ` — ${timeOffReason}` : ''}`
        );
      }
    }
    setTimeOffDate('');
    setTimeOffReason('');
    setTimeOffCategory('vacation');
    setShowTimeOff(false);
  };

  const handleCalendarDayClick = (dateStr: string) => {
    const existing = myTimeOffs.find(t => t.date === dateStr);
    if (existing) {
      handleRemoveTimeOff(existing.id);
    } else {
      setTimeOffDate(dateStr);
      setShowTimeOff(true);
    }
  };

  const handleRemoveTimeOff = (id: string) => {
    dispatch({ type: 'REMOVE_TIME_OFF', payload: id });
    dbDeleteTimeOff(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">My Shifts</h2>
          <p className="text-sm text-gray-500">{upcomingShifts.length} upcoming shifts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Monthly Hours Counter */}
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-200 rounded-lg">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="text-sm">
              <span className="text-xs text-gray-400 block leading-tight">{format(now, 'MMMM')}</span>
              <span className={`font-bold ${isOvertime ? 'text-red-600' : 'text-gray-900'}`}>
                {monthlyHours}/{TARGET_HOURS}h
              </span>
            </div>
          </div>
          {/* PTO + Sick Balance */}
          {(() => {
            const b = getPtoBalance(state.currentUser.id);
            return (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <div className="text-sm">
                    <span className="text-[10px] text-gray-400 block leading-tight">PTO</span>
                    <span className={`font-bold ${b.remaining <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                      {b.remaining}/{b.total}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                  <Plus className="w-4 h-4 text-red-400" />
                  <div className="text-sm">
                    <span className="text-[10px] text-gray-400 block leading-tight">Sick</span>
                    <span className={`font-bold ${b.sickRemaining <= 1 ? 'text-red-600' : 'text-gray-900'}`}>
                      {b.sickRemaining}/{b.sickTotal}
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
          <button
            onClick={() => setShowTimeOff(!showTimeOff)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Request Time Off / OOO</span>
            <span className="sm:hidden">Time Off</span>
          </button>
        </div>
      </div>

      {/* Active Shift Clock */}
      <ActiveShiftClock />

      {/* PTO Policy Link */}
      <div className="mb-4 flex items-center gap-2 text-xs text-indigo-600">
        <a
          href="https://www.notion.so/PTO-Sick-Days-and-Holiday-Policy-27ec329efb4180258b20f57502902041"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          📋 Read our PTO, Sick Days &amp; Holiday Policy
        </a>
      </div>

      {/* My Public Holidays */}
      {state.currentUser.country && (() => {
        const holidays = getHolidays(state.currentUser.country!, now.getFullYear())
          .filter(h => h.date >= format(now, 'yyyy-MM-dd'))
          .slice(0, 5);
        if (holidays.length === 0) return null;
        return (
          <div className="mb-6 bg-purple-50 rounded-xl border border-purple-200 p-4">
            <h3 className="text-sm font-medium text-purple-700 mb-2">
              Upcoming Public Holidays ({getCountryName(state.currentUser.country!)})
            </h3>
            <div className="flex flex-wrap gap-2">
              {holidays.map(h => (
                <div key={h.date} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-sm">
                  <span className="text-purple-700 font-medium">{format(parseISO(h.date), 'MMM d')}</span>
                  <span className="text-purple-500">{h.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Time Off Form */}
      {showTimeOff && (
        <form onSubmit={handleAddTimeOff} className="bg-amber-50 rounded-xl border border-amber-200 p-4 mb-6">
          <h3 className="text-sm font-medium text-amber-800 mb-3">Request Day Off</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">Date</label>
              <input
                type="date"
                value={timeOffDate}
                onChange={e => setTimeOffDate(e.target.value)}
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">Reason</label>
              <select
                value={timeOffCategory}
                onChange={e => setTimeOffCategory(e.target.value as TimeOffCategory)}
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                {TIME_OFF_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">Note (optional)</label>
              <input
                type="text"
                value={timeOffReason}
                onChange={e => setTimeOffReason(e.target.value)}
                placeholder="Additional details"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => { setShowTimeOff(false); setTimeOffDate(''); }}
              className="px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
            >
              Submit
            </button>
          </div>
        </form>
      )}

      {/* Days Off Dashboard */}
      {(() => {
        const balance = getPtoBalance(state.currentUser.id);
        const monthStr = format(now, 'yyyy-MM-');
        const monthTimeOffs = myTimeOffs.filter(t => t.date.startsWith(monthStr));
        const calDays = getMonthCalendarDays(calendarDate);

        const getCategoryInfo = (cat?: string) => TIME_OFF_CATEGORIES.find(c => c.value === cat) || TIME_OFF_CATEGORIES[0];

        return (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">My Days Off</h3>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                <p className="text-xl font-bold text-amber-700">{monthTimeOffs.length}</p>
                <p className="text-[9px] text-amber-500 font-medium uppercase">{format(now, 'MMM')}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                <p className={`text-xl font-bold ${balance.remaining <= 3 ? 'text-red-600' : 'text-blue-700'}`}>{balance.remaining}</p>
                <p className="text-[9px] text-blue-500 font-medium uppercase">PTO left</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2.5 text-center">
                <p className={`text-xl font-bold ${balance.sickRemaining <= 1 ? 'text-red-600' : 'text-red-500'}`}>{balance.sickRemaining}</p>
                <p className="text-[9px] text-red-400 font-medium uppercase">Sick left</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-2.5 text-center">
                <p className="text-xl font-bold text-indigo-700">{balance.used + balance.sickUsed}</p>
                <p className="text-[9px] text-indigo-500 font-medium uppercase">{now.getFullYear()} total</p>
              </div>
            </div>

            {/* Full Calendar */}
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
              {/* Calendar Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <button onClick={() => setCalendarDate(addMonths(calendarDate, -1))} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{formatMonthYear(calendarDate)}</span>
                  <button
                    onClick={() => setCalendarDate(new Date())}
                    className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Today
                  </button>
                </div>
                <button onClick={() => setCalendarDate(addMonths(calendarDate, 1))} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} className="px-2 py-2 text-xs font-medium text-gray-500 text-center uppercase">{d}</div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                {calDays.map(day => {
                  const dateStr = formatDate(day);
                  const timeOff = myTimeOffs.find(t => t.date === dateStr);
                  const dayShifts = myShifts.filter(s => s.date === dateStr);
                  const inMonth = isSameMonth(day, calendarDate);
                  const isCurrentDay = isToday(day);
                  const catInfo = timeOff ? getCategoryInfo(timeOff.category) : null;

                  return (
                    <div
                      key={dateStr}
                      className={`bg-white min-h-[60px] sm:min-h-[100px] ${
                        isCurrentDay ? 'bg-indigo-50/30' : ''
                      } ${!inMonth ? 'opacity-40' : ''} ${
                        timeOff ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      {/* Day Number + Add button */}
                      <div className="px-2 py-1 flex items-center justify-between">
                        <span className={`text-xs font-semibold ${
                          isCurrentDay
                            ? 'w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]'
                            : 'text-gray-500'
                        }`}>
                          {formatDayNum(day)}
                        </span>
                        {inMonth && !timeOff && (
                          <button
                            onClick={() => handleCalendarDayClick(dateStr)}
                            className="p-0.5 text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors opacity-0 hover:opacity-100 focus:opacity-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Time Off indicator */}
                      {timeOff && catInfo && (
                        <div className="px-1">
                          <div
                            className={`text-[9px] font-medium rounded px-1 py-0.5 mb-0.5 truncate cursor-pointer hover:opacity-80 ${catInfo.color}`}
                            onClick={() => inMonth && handleCalendarDayClick(dateStr)}
                            title="Click to remove"
                          >
                            {(timeOff.status || 'approved') === 'pending' ? '⏳ ' : ''}{catInfo.label}{timeOff.reason ? `: ${timeOff.reason}` : ''}{(timeOff.status || 'approved') === 'rejected' ? ' ❌' : ''}
                          </div>
                        </div>
                      )}

                      {/* My Shifts */}
                      <div className="px-1 pb-1 space-y-0.5">
                        {dayShifts.slice(0, 2).map(shift => (
                          <div
                            key={shift.id}
                            className="rounded px-1.5 py-0.5 text-[9px] font-medium text-white truncate"
                            style={{ backgroundColor: shift.color }}
                          >
                            {shift.name} {shift.startTime}
                          </div>
                        ))}
                        {dayShifts.length > 2 && (
                          <div className="text-[9px] text-gray-400 text-center">+{dayShifts.length - 2} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-3">
              {TIME_OFF_CATEGORIES.map(c => (
                <div key={c.value} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <div className={`w-2.5 h-2.5 rounded-sm ${c.color.split(' ')[1]}`} />
                  {c.label}
                </div>
              ))}
            </div>

            {/* Upcoming days off list */}
            {(() => {
              const upcoming = myTimeOffs.filter(t => t.date >= format(now, 'yyyy-MM-dd')).sort((a, b) => a.date.localeCompare(b.date));
              if (upcoming.length === 0) return null;
              return (
                <div>
                  <h4 className="text-xs font-medium text-gray-400 mb-2">Upcoming</h4>
                  <div className="space-y-1.5">
                    {upcoming.slice(0, 5).map(to => {
                      const catInfo = getCategoryInfo(to.category);
                      return (
                        <div key={to.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${(to.status || 'approved') === 'pending' ? 'bg-amber-50 border border-amber-200' : (to.status || 'approved') === 'rejected' ? 'bg-red-50 border border-red-200 opacity-60' : 'bg-gray-50'}`}>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-800 font-medium">{format(parseISO(to.date), 'EEE, MMM d')}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${catInfo.color}`}>{catInfo.label}</span>
                            {(to.status || 'approved') === 'pending' && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded text-amber-700 bg-amber-100">Pending</span>}
                            {(to.status || 'approved') === 'rejected' && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded text-red-700 bg-red-100">Rejected</span>}
                            {to.reason && <span className="text-gray-400 text-xs">– {to.reason}</span>}
                          </div>
                          <button onClick={() => handleRemoveTimeOff(to.id)} className="p-0.5 text-gray-300 hover:text-red-500 rounded transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {upcoming.length > 5 && <p className="text-[10px] text-gray-400 pl-3">+{upcoming.length - 5} more</p>}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Swap Requests */}
      <SwapRequestsSection
        swapRequests={getPendingSwapRequests()}
        shifts={state.shifts}
        getAgentById={getAgentById}
        dispatch={dispatch}
      />

      {/* Upcoming Shifts */}
      {upcomingShifts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-2xl flex items-center justify-center">
            <Calendar className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-500">No upcoming shifts</h3>
          <p className="text-sm text-gray-400 mt-1">You haven't been assigned to any shifts yet</p>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Upcoming</h3>
          <div className="space-y-3">
            {upcomingShifts.map(shift => (
              <div key={shift.id} className="flex items-start gap-3">
                <div className="text-center shrink-0 w-14 pt-1">
                  <div className="text-xs font-medium text-gray-400">
                    {format(parseISO(shift.date), 'EEE')}
                  </div>
                  <div className="text-lg font-bold text-gray-700">
                    {format(parseISO(shift.date), 'd')}
                  </div>
                  <div className="text-xs text-gray-400">
                    {format(parseISO(shift.date), 'MMM')}
                  </div>
                </div>
                <div className="flex-1">
                  <ShiftCard shift={shift} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Shifts */}
      {pastShifts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Past Shifts</h3>
          <div className="space-y-2 opacity-60">
            {pastShifts.slice(-5).reverse().map(shift => (
              <div key={shift.id} className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: shift.color }} />
                <span className="text-sm text-gray-600 font-medium">{shift.name}</span>
                <span className="text-xs text-gray-400">
                  {format(parseISO(shift.date), 'MMM d')} · {shift.startTime} – {shift.endTime}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveShiftClock() {
  const { state, dispatch, getShiftsForAgent, getClockRecord } = useApp();
  const [elapsed, setElapsed] = useState(0);

  const todayStr = new Date().toISOString().split('T')[0];
  const myShiftsToday = getShiftsForAgent(state.currentUser.id).filter(s => s.date === todayStr);

  // Find shifts needing clock action
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const activeShift = myShiftsToday.find(s => {
    const record = getClockRecord(s.id, state.currentUser.id);
    return record?.clockIn && !record?.clockOut;
  });

  const needsClockIn = myShiftsToday.find(s => {
    const [h, m] = s.startTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const [eh, em] = s.endTime.split(':').map(Number);
    const endMin = eh < h ? em + 1440 : eh * 60 + em;
    const record = getClockRecord(s.id, state.currentUser.id);
    return !record && nowMinutes >= startMin - 15 && nowMinutes < endMin;
  });

  const activeRecord = activeShift ? getClockRecord(activeShift.id, state.currentUser.id) : undefined;

  useEffect(() => {
    if (!activeRecord?.clockIn) return;
    const update = () => setElapsed(Math.floor((Date.now() - new Date(activeRecord.clockIn!).getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeRecord?.clockIn]);

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleClockIn = (shiftId: string) => {
    dispatch({
      type: 'CLOCK_IN',
      payload: { id: uuid(), shiftId, userId: state.currentUser.id, clockIn: new Date().toISOString(), clockOut: null },
    });
  };

  const handleClockOut = (shiftId: string) => {
    dispatch({
      type: 'CLOCK_OUT',
      payload: { shiftId, userId: state.currentUser.id, clockOut: new Date().toISOString() },
    });
  };

  if (!activeShift && !needsClockIn) {
    // Show completed shifts for today
    const completedToday = myShiftsToday.filter(s => {
      const record = getClockRecord(s.id, state.currentUser.id);
      return record?.clockIn && record?.clockOut;
    });
    if (completedToday.length === 0 && myShiftsToday.length === 0) return null;
    if (completedToday.length === 0) return null;

    return (
      <div className="mb-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Today's Shifts</h3>
        {completedToday.map(s => {
          const record = getClockRecord(s.id, state.currentUser.id)!;
          const diff = new Date(record.clockOut!).getTime() - new Date(record.clockIn!).getTime();
          const hrs = Math.floor(diff / 3600000);
          const mins = Math.round((diff % 3600000) / 60000);
          return (
            <div key={s.id} className="flex items-center justify-between text-sm py-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-gray-700">{s.name}</span>
              </div>
              <span className="text-gray-500 font-medium">{hrs}h {mins}m</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (activeShift && activeRecord) {
    return (
      <div className="mb-4 bg-green-50 rounded-xl border border-green-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <div>
              <h3 className="text-sm font-semibold text-green-800">{activeShift.name}</h3>
              <p className="text-xs text-green-600">Clocked in at {new Date(activeRecord.clockIn!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-mono font-bold text-green-800">{formatElapsed(elapsed)}</p>
            </div>
            <button
              onClick={() => handleClockOut(activeShift.id)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Clock Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsClockIn) {
    return (
      <div className="mb-4 bg-amber-50 rounded-xl border border-amber-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <div>
              <h3 className="text-sm font-semibold text-amber-800">{needsClockIn.name}</h3>
              <p className="text-xs text-amber-600">{needsClockIn.startTime} – {needsClockIn.endTime}</p>
            </div>
          </div>
          <button
            onClick={() => handleClockIn(needsClockIn.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Clock In
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function SwapRequestsSection({
  swapRequests,
  shifts,
  getAgentById,
  dispatch,
}: {
  swapRequests: import('../types').SwapRequest[];
  shifts: import('../types').Shift[];
  getAgentById: (id: string) => import('../types').User | undefined;
  dispatch: React.Dispatch<any>;
}) {
  if (swapRequests.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
        <ArrowRightLeft className="w-4 h-4 text-orange-500" />
        Swap Requests ({swapRequests.length})
      </h3>
      <div className="space-y-2">
        {swapRequests.map(req => {
          const fromShift = shifts.find(s => s.id === req.fromShiftId);
          const toShift = shifts.find(s => s.id === req.toShiftId);
          const fromAgent = getAgentById(req.fromAgentId);
          if (!fromShift || !toShift || !fromAgent) return null;

          return (
            <div key={req.id} className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                  style={{ backgroundColor: fromAgent.color }}
                >
                  {fromAgent.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-semibold">{fromAgent.name}</span> wants to swap shifts with you
                  </p>
                  {req.reason && (
                    <p className="text-xs text-orange-600 mt-1">Reason: {req.reason}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 ml-11 space-y-2">
                <div className="bg-green-50 rounded-lg border border-green-200 p-2.5">
                  <span className="text-[10px] font-semibold text-green-500 uppercase">You get</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: fromShift.color }} />
                    <span className="text-sm font-medium text-gray-700">{fromShift.name}</span>
                    <span className="text-xs text-gray-500">{fromShift.date} · {fromShift.startTime}–{fromShift.endTime}</span>
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg border border-red-200 p-2.5">
                  <span className="text-[10px] font-semibold text-red-400 uppercase">You give up</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: toShift.color }} />
                    <span className="text-sm font-medium text-gray-700">{toShift.name}</span>
                    <span className="text-xs text-gray-500">{toShift.date} · {toShift.startTime}–{toShift.endTime}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3 ml-11">
                <button
                  onClick={() => dispatch({ type: 'ACCEPT_SWAP_REQUEST', payload: req.id })}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Accept
                </button>
                <button
                  onClick={() => dispatch({ type: 'DECLINE_SWAP_REQUEST', payload: req.id })}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
