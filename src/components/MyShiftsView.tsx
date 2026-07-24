import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { ShiftCard } from './ShiftCard';
import { Calendar, X, ArrowRightLeft, Check, XCircle, Clock, ChevronLeft, ChevronRight, Plus, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay, addMonths, addDays, isSameMonth, isToday } from 'date-fns';
import { getHolidays, getCountryName } from '../utils/holidays';
import { getMonthCalendarDays, formatDate, formatDayNum, formatMonthYear } from '../utils/dates';
import { TIME_OFF_CATEGORIES, type TimeOffCategory } from '../types';
import { insertTimeOff, deleteTimeOff as dbDeleteTimeOff, updateSwapRequestStatus } from '../lib/database';
import { sendSlackNotification } from '../utils/slack';
import { confirmClockOut } from '../utils/clock';

export function MyShiftsView() {
  const { state, dispatch, getShiftsForAgent, getPendingSwapRequests, getAgentById, getMonthlyHours, getPtoBalance } = useApp();
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [timeOffDate, setTimeOffDate] = useState('');
  const [timeOffEndDate, setTimeOffEndDate] = useState('');
  const [timeOffMode, setTimeOffMode] = useState<'single' | 'period'>('single');
  const [timeOffReason, setTimeOffReason] = useState('');
  const [timeOffCategory, setTimeOffCategory] = useState<TimeOffCategory>('vacation');
  const [timeOffHalfDay, setTimeOffHalfDay] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const myShifts = getShiftsForAgent(state.currentUser.id);
  const today = startOfDay(new Date());
  const now = new Date();
  const monthlyHours = getMonthlyHours(state.currentUser.id, now.getFullYear(), now.getMonth());
  const TARGET_HOURS = 208;
  const isOvertime = monthlyHours > TARGET_HOURS;

  const upcomingShifts = myShifts.filter(s => !isBefore(parseISO(s.date), today));
  const pastShifts = myShifts.filter(s => isBefore(parseISO(s.date), today));

  const myTimeOffs = state.timeOffs.filter(t => t.userId === state.currentUser.id);

  const getDatesInRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    let current = parseISO(start);
    const endDate = parseISO(end);
    while (current <= endDate) {
      dates.push(format(current, 'yyyy-MM-dd'));
      current = addDays(current, 1);
    }
    return dates;
  };

  const handleAddTimeOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!timeOffDate) return;
    if (timeOffMode === 'period' && !timeOffEndDate) return;
    if (timeOffMode === 'period' && timeOffEndDate < timeOffDate) {
      alert('End date must be after start date.');
      return;
    }

    const dates = timeOffMode === 'period' ? getDatesInRange(timeOffDate, timeOffEndDate) : [timeOffDate];
    const daysCount = dates.length;

    const balance = getPtoBalance(state.currentUser.id);
    if (timeOffCategory === 'sick' && balance.sickRemaining <= 0) {
      if (!confirm('You have no remaining sick days this year. Continue anyway?')) return;
    } else if (timeOffCategory !== 'sick' && balance.remaining <= 0) {
      if (!confirm('You have no remaining paid days off this year. Continue anyway?')) return;
    }
    const isAdmin = state.currentUser.role === 'admin';
    const status = (isAdmin ? 'approved' : 'pending') as 'approved' | 'pending';

    setIsSubmitting(true);
    try {
      let anyInserted = false;
      for (const date of dates) {
        const timeOffRecord = {
          id: uuid(),
          userId: state.currentUser.id,
          date,
          reason: timeOffReason || undefined,
          category: timeOffCategory,
          status,
          halfDay: timeOffHalfDay,
        };
        const ok = await insertTimeOff(timeOffRecord);
        if (ok) {
          dispatch({ type: 'ADD_TIME_OFF', payload: timeOffRecord });
          anyInserted = true;
        }
      }

      // Every date was a duplicate (rejected by the DB) — don't notify.
      if (!anyInserted) {
        alert('You already have a day off request for the selected date(s).');
        return;
      }

      if (!isAdmin) {
        // New requests surface as the red badge on the Days Off tab — no bell
        // notification for the admin (Slack still fires below).
        const dateLabel = daysCount > 1 ? `${timeOffDate} to ${timeOffEndDate} (${daysCount} days)` : timeOffDate;
        const slackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
        if (slackUrl) {
          sendSlackNotification(slackUrl,
            `🏖️ *Time off request*: ${state.currentUser.name} is requesting *${timeOffHalfDay ? 'half day' : 'full day'}* (${timeOffCategory}) off on ${dateLabel}${timeOffReason ? ` — ${timeOffReason}` : ''}`
          );
        }
      }
      setTimeOffDate('');
      setTimeOffEndDate('');
      setTimeOffMode('single');
      setTimeOffReason('');
      setTimeOffCategory('vacation');
      setTimeOffHalfDay(false);
      setShowTimeOff(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCalendarDayClick = (dateStr: string) => {
    const existing = myTimeOffs.find(t => t.date === dateStr);
    if (!existing) {
      setTimeOffDate(dateStr);
      setShowTimeOff(true);
    }
    // If day off exists, do nothing (use X button in the upcoming list to remove)
  };

  const handleRemoveTimeOff = (id: string) => {
    dispatch({ type: 'REMOVE_TIME_OFF', payload: id });
    dbDeleteTimeOff(id);
  };

  // Check current week's shift count (only enforce from Apr 6, 2026 onwards)
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  const enforceFromDate = new Date('2026-04-06'); // Start enforcing from next week
  const MIN_WEEKLY_SHIFTS = 5;
  let weeklyShiftCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    if (myShifts.some(s => s.date === ds)) weeklyShiftCount++;
  }
  const underMinShifts = state.currentUser.role !== 'admin' && weeklyShiftCount < MIN_WEEKLY_SHIFTS && weekStart >= enforceFromDate;

  return (
    <div>
      {/* Under minimum shifts warning */}
      {underMinShifts && (
        <div className="mb-4 bg-red-600 text-white rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">You only have {weeklyShiftCount} shifts this week — minimum is {MIN_WEEKLY_SHIFTS}</p>
            <p className="text-xs opacity-80">Please join additional shifts to meet the weekly requirement.</p>
          </div>
        </div>
      )}

      {/* Weekly shift count */}
      {state.currentUser.role !== 'admin' && (
        <div className={`mb-4 rounded-xl px-4 py-3 flex items-center justify-between ${
          weeklyShiftCount > MIN_WEEKLY_SHIFTS ? 'bg-green-50 border border-green-200' :
          weeklyShiftCount === MIN_WEEKLY_SHIFTS ? 'bg-blue-50 border border-blue-200' :
          'bg-amber-50 border border-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className={`text-sm font-medium ${
              weeklyShiftCount > MIN_WEEKLY_SHIFTS ? 'text-green-800' :
              weeklyShiftCount === MIN_WEEKLY_SHIFTS ? 'text-blue-800' :
              'text-amber-800'
            }`}>
              You are assigned to <strong>{weeklyShiftCount} shifts</strong> this week
            </span>
            <div className="relative group">
              <span className="w-4 h-4 rounded-full bg-gray-300 text-white text-[10px] font-bold flex items-center justify-center cursor-help">?</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 hidden group-hover:block z-10">
                <p className="mb-1">Minimum required: {MIN_WEEKLY_SHIFTS} shifts per week.</p>
                {weeklyShiftCount > MIN_WEEKLY_SHIFTS ? (
                  <p>You have extra shifts. You can leave a shift where there are more than the minimum required agents assigned.</p>
                ) : weeklyShiftCount === MIN_WEEKLY_SHIFTS ? (
                  <p>You're at the minimum. You cannot leave any shifts this week.</p>
                ) : (
                  <p>You're below the minimum. Please join additional shifts.</p>
                )}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
              </div>
            </div>
          </div>
          <span className={`text-sm font-bold ${
            weeklyShiftCount > MIN_WEEKLY_SHIFTS ? 'text-green-700' :
            weeklyShiftCount === MIN_WEEKLY_SHIFTS ? 'text-blue-700' :
            'text-amber-700'
          }`}>{weeklyShiftCount}/{MIN_WEEKLY_SHIFTS}</span>
        </div>
      )}

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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-amber-800">Request Day Off</h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-amber-100 rounded-lg p-0.5">
                <button type="button" onClick={() => { setTimeOffMode('single'); setTimeOffEndDate(''); }} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeOffMode === 'single' ? 'bg-white text-amber-800 shadow-sm' : 'text-amber-600'}`}>Single Day</button>
                <button type="button" onClick={() => { setTimeOffMode('period'); setTimeOffHalfDay(false); }} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeOffMode === 'period' ? 'bg-white text-amber-800 shadow-sm' : 'text-amber-600'}`}>Period</button>
              </div>
              {timeOffMode === 'single' && (
                <div className="flex items-center gap-1 bg-amber-100 rounded-lg p-0.5">
                  <button type="button" onClick={() => setTimeOffHalfDay(false)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${!timeOffHalfDay ? 'bg-white text-amber-800 shadow-sm' : 'text-amber-600'}`}>Full Day</button>
                  <button type="button" onClick={() => setTimeOffHalfDay(true)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeOffHalfDay ? 'bg-white text-amber-800 shadow-sm' : 'text-amber-600'}`}>Half Day</button>
                </div>
              )}
            </div>
          </div>
          <div className={`grid grid-cols-1 gap-3 ${timeOffMode === 'period' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">{timeOffMode === 'period' ? 'Start Date' : 'Date'}</label>
              <input type="date" value={timeOffDate} onChange={e => setTimeOffDate(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" required />
            </div>
            {timeOffMode === 'period' && (
              <div>
                <label className="block text-xs font-medium text-amber-700 mb-1">End Date</label>
                <input type="date" value={timeOffEndDate} onChange={e => setTimeOffEndDate(e.target.value)} min={timeOffDate} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" required />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">Reason</label>
              <select value={timeOffCategory} onChange={e => setTimeOffCategory(e.target.value as TimeOffCategory)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                {TIME_OFF_CATEGORIES.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">Note (optional)</label>
              <input type="text" value={timeOffReason} onChange={e => setTimeOffReason(e.target.value)} placeholder="Additional details" className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
          </div>
          {timeOffMode === 'period' && timeOffDate && timeOffEndDate && timeOffEndDate >= timeOffDate && (
            <p className="text-xs text-amber-600 mt-2">
              {getDatesInRange(timeOffDate, timeOffEndDate).length} day(s) will be requested off
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => { setShowTimeOff(false); setTimeOffDate(''); setTimeOffEndDate(''); setTimeOffMode('single'); }} className="px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? 'Submitting…' : 'Submit'}</button>
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
                          <div className={`text-[9px] font-medium rounded px-1 py-0.5 mb-0.5 truncate flex items-center gap-0.5 ${catInfo.color}`}>
                            <span className="truncate">
                              {(timeOff.status || 'approved') === 'pending' ? '⏳ ' : ''}{timeOff.halfDay ? '½ ' : ''}{catInfo.label}{timeOff.reason ? `: ${timeOff.reason}` : ''}{(timeOff.status || 'approved') === 'rejected' ? ' ❌' : ''}
                            </span>
                            {inMonth && (
                              <button
                                onClick={() => handleRemoveTimeOff(timeOff.id)}
                                className="shrink-0 hover:text-red-600"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
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

  const activeShift = myShiftsToday.find(s => {
    const record = getClockRecord(s.id, state.currentUser.id);
    return record?.clockIn && !record?.clockOut;
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
    if (!confirmClockOut(state.clockRecords.find(r => r.shiftId === shiftId && r.userId === state.currentUser.id))) return;
    dispatch({
      type: 'CLOCK_OUT',
      payload: { shiftId, userId: state.currentUser.id, clockOut: new Date().toISOString() },
    });
  };

  if (myShiftsToday.length === 0) return null;

  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-indigo-500" />
        Today's Shifts
      </h3>
      <div className="space-y-2">
        {myShiftsToday.map(s => {
          const record = getClockRecord(s.id, state.currentUser.id);
          const isClockedIn = record?.clockIn && !record?.clockOut;
          const isCompleted = record?.clockIn && record?.clockOut;

          return (
            <div key={s.id} className={`flex items-center justify-between p-3 rounded-lg border ${
              isClockedIn ? 'bg-green-50 border-green-200' : isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-3">
                {isClockedIn && <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />}
                {isCompleted && <div className="w-2.5 h-2.5 bg-gray-400 rounded-full" />}
                {!record && <div className="w-2.5 h-2.5 bg-amber-400 rounded-full" />}
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.startTime} – {s.endTime}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isClockedIn && (
                  <>
                    <p className="text-lg font-mono font-bold text-green-800">{formatElapsed(elapsed)}</p>
                    <button
                      onClick={() => handleClockOut(s.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Clock Out
                    </button>
                  </>
                )}
                {isCompleted && (() => {
                  const diff = new Date(record!.clockOut!).getTime() - new Date(record!.clockIn!).getTime();
                  const hrs = Math.floor(diff / 3600000);
                  const mins = Math.round((diff % 3600000) / 60000);
                  return <span className="text-sm font-medium text-gray-500">{hrs}h {mins}m ✓</span>;
                })()}
                {!record && (
                  <button
                    onClick={() => handleClockIn(s.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Clock In
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const { state } = useApp();
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
                  onClick={() => {
                    dispatch({ type: 'ACCEPT_SWAP_REQUEST', payload: req.id });
                    updateSwapRequestStatus(req.id, 'accepted');
                    const slackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
                    if (slackUrl) {
                      const fromAgent = getAgentById(req.fromAgentId);
                      sendSlackNotification(slackUrl, `🔄 *Swap accepted*: ${state.currentUser.name} accepted swap with ${fromAgent?.name}`);
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Accept
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: 'DECLINE_SWAP_REQUEST', payload: req.id });
                    updateSwapRequestStatus(req.id, 'declined');
                    const slackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
                    if (slackUrl) {
                      const fromAgent = getAgentById(req.fromAgentId);
                      sendSlackNotification(slackUrl, `🔄 *Swap declined*: ${state.currentUser.name} declined swap with ${fromAgent?.name}`);
                    }
                  }}
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
