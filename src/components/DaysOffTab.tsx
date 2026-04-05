import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { Calendar, X, ChevronLeft, ChevronRight, Plus, Check } from 'lucide-react';
import { updateTimeOffStatus } from '../lib/database';
import { format, parseISO, addMonths, addDays, isSameMonth, isToday } from 'date-fns';
import { getMonthCalendarDays, formatDate, formatDayNum, formatMonthYear } from '../utils/dates';
import { getHolidays, getCountryName } from '../utils/holidays';
import { TIME_OFF_CATEGORIES, type TimeOffCategory } from '../types';
import { insertTimeOff, deleteTimeOff as dbDeleteTimeOff, insertNotification, updateShiftAssignment } from '../lib/database';
import { sendSlackNotification } from '../utils/slack';

export function DaysOffTab() {
  const { state, dispatch, getPtoBalance } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [timeOffDate, setTimeOffDate] = useState('');
  const [timeOffEndDate, setTimeOffEndDate] = useState('');
  const [timeOffMode, setTimeOffMode] = useState<'single' | 'period'>('single');
  const [timeOffReason, setTimeOffReason] = useState('');
  const [timeOffCategory, setTimeOffCategory] = useState<TimeOffCategory>('vacation');
  const [timeOffHalfDay, setTimeOffHalfDay] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const now = new Date();
  const myTimeOffs = state.timeOffs.filter(t => t.userId === state.currentUser.id);
  const balance = getPtoBalance(state.currentUser.id);
  const calDays = getMonthCalendarDays(calendarDate);
  const myShifts = state.shifts.filter(s => s.assignedAgentIds.includes(state.currentUser.id));

  const getCategoryInfo = (cat?: string) => TIME_OFF_CATEGORIES.find(c => c.value === cat) || TIME_OFF_CATEGORIES[0];

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeOffDate) return;
    if (timeOffMode === 'period' && !timeOffEndDate) return;
    if (timeOffMode === 'period' && timeOffEndDate < timeOffDate) {
      alert('End date must be after start date.');
      return;
    }

    const allDates = timeOffMode === 'period' ? getDatesInRange(timeOffDate, timeOffEndDate) : [timeOffDate];
    // PTO is counted in business days — skip weekends
    const effectiveDates = timeOffMode === 'period' ? allDates.filter(d => {
      const day = new Date(d + 'T12:00:00').getDay();
      return day !== 0 && day !== 6;
    }) : allDates;
    const daysCount = effectiveDates.length;

    if (timeOffCategory === 'sick' && balance.sickRemaining <= 0) {
      if (!confirm('You have no remaining sick days this year. Continue anyway?')) return;
    } else if (timeOffCategory !== 'sick' && balance.remaining <= 0) {
      if (!confirm('You have no remaining paid days off this year. Continue anyway?')) return;
    }
    const isAdmin = state.currentUser.role === 'admin';
    const status = (isAdmin ? 'approved' : 'pending') as 'approved' | 'pending';

    for (const date of effectiveDates) {
      const record = {
        id: uuid(),
        userId: state.currentUser.id,
        date,
        reason: timeOffReason || undefined,
        category: timeOffCategory,
        status,
        halfDay: timeOffHalfDay,
      };
      dispatch({ type: 'ADD_TIME_OFF', payload: record });
      insertTimeOff(record);
    }

    if (!isAdmin) {
      const approver = state.users.find(u => u.email === 'einav@adrevival.io');
      const dateLabel = daysCount > 1 ? `${timeOffDate} to ${timeOffEndDate} (${daysCount} working days)` : timeOffDate;
      if (approver) {
        const notif = {
          id: uuid(),
          userId: approver.id,
          message: `${state.currentUser.name} is requesting ${timeOffHalfDay ? 'half day' : ''} ${timeOffCategory || 'time'} off on ${dateLabel}${timeOffReason ? ` — ${timeOffReason}` : ''}`,
          timestamp: new Date().toISOString(),
          read: false,
          type: 'info' as const,
        };
        dispatch({ type: 'ADD_NOTIFICATION', payload: notif });
        insertNotification(notif);
      }
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
    setShowForm(false);
  };

  const handleRemove = (id: string) => {
    dispatch({ type: 'REMOVE_TIME_OFF', payload: id });
    dbDeleteTimeOff(id);
  };

  const handleCalendarDayClick = (dateStr: string) => {
    const existing = myTimeOffs.find(t => t.date === dateStr);
    if (!existing) {
      setTimeOffDate(dateStr);
      setShowForm(true);
    }
  };

  // Separate time offs by status and time
  const approvedUpcoming = myTimeOffs
    .filter(t => (t.status || 'approved') === 'approved' && t.date >= format(now, 'yyyy-MM-dd'))
    .sort((a, b) => a.date.localeCompare(b.date));
  const pending = myTimeOffs
    .filter(t => (t.status || 'approved') === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = myTimeOffs
    .filter(t => (t.status || 'approved') === 'approved' && t.date < format(now, 'yyyy-MM-dd'))
    .sort((a, b) => b.date.localeCompare(a.date));
  const rejected = myTimeOffs
    .filter(t => (t.status || 'approved') === 'rejected')
    .sort((a, b) => b.date.localeCompare(a.date));

  // Pending PTO requests for approval (only for einav@adrevival.io)
  const isApprover = state.currentUser.email === 'einav@adrevival.io';
  const pendingApprovals = isApprover
    ? state.timeOffs.filter(t => (t.status || 'approved') === 'pending' && t.userId !== state.currentUser.id).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const handleApprove = (id: string) => {
    dispatch({ type: 'UPDATE_TIME_OFF_STATUS', payload: { id, status: 'approved' } });
    updateTimeOffStatus(id, 'approved');
    const to = state.timeOffs.find(t => t.id === id);
    if (to) {
      // Remove agent from all shifts on that day
      const shiftsOnDay = state.shifts.filter(s => s.date === to.date && s.assignedAgentIds.includes(to.userId));
      shiftsOnDay.forEach(s => {
        const newAgentIds = s.assignedAgentIds.filter(aid => aid !== to.userId);
        dispatch({ type: 'UNASSIGN_AGENT', payload: { shiftId: s.id, agentId: to.userId } });
        updateShiftAssignment(s.id, newAgentIds);
      });

      const notif = { id: uuid(), userId: to.userId, message: `Your time off request for ${to.date} has been approved ✅`, timestamp: new Date().toISOString(), read: false, type: 'info' as const };
      dispatch({ type: 'ADD_NOTIFICATION', payload: notif });
      insertNotification(notif);
      const slackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
      if (slackUrl) {
        const agent = state.users.find(u => u.id === to.userId);
        sendSlackNotification(slackUrl, `✅ *Time off approved*: ${agent?.name} on ${to.date}${shiftsOnDay.length > 0 ? ` (removed from ${shiftsOnDay.length} shift${shiftsOnDay.length > 1 ? 's' : ''})` : ''}`);
      }
    }
  };

  const handleReject = (id: string) => {
    dispatch({ type: 'UPDATE_TIME_OFF_STATUS', payload: { id, status: 'rejected' } });
    updateTimeOffStatus(id, 'rejected');
    const to = state.timeOffs.find(t => t.id === id);
    if (to) {
      const notif = { id: uuid(), userId: to.userId, message: `Your time off request for ${to.date} has been declined ❌`, timestamp: new Date().toISOString(), read: false, type: 'info' as const };
      dispatch({ type: 'ADD_NOTIFICATION', payload: notif });
      insertNotification(notif);
      const slackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
      if (slackUrl) {
        const agent = state.users.find(u => u.id === to.userId);
        sendSlackNotification(slackUrl, `❌ *Time off rejected*: ${agent?.name} on ${to.date}`);
      }
    }
  };

  // Team days off (approved, upcoming)
  const teamDaysOff = state.timeOffs
    .filter(t => t.userId !== state.currentUser.id && (t.status || 'approved') === 'approved' && t.date >= format(now, 'yyyy-MM-dd'))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Days Off</h2>
          <p className="text-sm text-gray-500">Manage your time off and see team availability</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Request Time Off
        </button>
      </div>

      {/* PTO Policy Link */}
      <div className="mb-4 flex items-center gap-2 text-xs text-indigo-600">
        <a href="https://www.notion.so/PTO-Sick-Days-and-Holiday-Policy-27ec329efb4180258b20f57502902041" target="_blank" rel="noopener noreferrer" className="hover:underline">
          📋 Read our PTO, Sick Days &amp; Holiday Policy
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className={`text-2xl font-bold ${balance.remaining <= 3 ? 'text-red-600' : 'text-blue-700'}`}>{balance.remaining}</p>
          <p className="text-[9px] text-blue-500 font-medium uppercase">PTO remaining</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className={`text-2xl font-bold ${balance.sickRemaining <= 1 ? 'text-red-600' : 'text-red-500'}`}>{balance.sickRemaining}</p>
          <p className="text-[9px] text-red-400 font-medium uppercase">Sick remaining</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{balance.used}</p>
          <p className="text-[9px] text-amber-500 font-medium uppercase">PTO used</p>
        </div>
        <div className="bg-indigo-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-indigo-700">{balance.sickUsed}</p>
          <p className="text-[9px] text-indigo-500 font-medium uppercase">Sick used</p>
        </div>
      </div>

      {/* Pending Approvals (only for einav@adrevival.io) */}
      {isApprover && pendingApprovals.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-800">Pending PTO Requests ({pendingApprovals.length})</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingApprovals.map(to => {
              const agent = state.users.find(u => u.id === to.userId);
              const catInfo = getCategoryInfo(to.category);
              return (
                <div key={to.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: agent?.color || '#6366f1' }}>
                      {agent?.name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{agent?.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{to.date}</span>
                        <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${catInfo.color}`}>{catInfo.label}</span>
                        {to.halfDay && <span className="px-1.5 py-0.5 text-[9px] font-medium rounded text-indigo-700 bg-indigo-50">½ day</span>}
                        {to.reason && <span className="text-xs text-gray-400">– {to.reason}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleReject(to.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                      <X className="w-3 h-3" />
                      Reject
                    </button>
                    <button onClick={() => handleApprove(to.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">
                      <Check className="w-3 h-3" />
                      Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Request Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 bg-amber-50 rounded-xl border border-amber-200 p-4">
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
          {timeOffMode === 'period' && timeOffDate && timeOffEndDate && timeOffEndDate >= timeOffDate && (() => {
            const allDays = getDatesInRange(timeOffDate, timeOffEndDate);
            const workingDays = allDays.filter(d => {
              const day = new Date(d + 'T12:00:00').getDay();
              return day !== 0 && day !== 6;
            });
            const skipped = allDays.length - workingDays.length;
            return (
              <p className="text-xs text-amber-600 mt-2">
                {workingDays.length} working day(s) will be deducted{skipped > 0 ? ` (${skipped} weekend day${skipped > 1 ? 's' : ''} excluded)` : ''}
              </p>
            );
          })()}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => { setShowForm(false); setTimeOffDate(''); setTimeOffEndDate(''); setTimeOffMode('single'); }} className="px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700">Submit</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Calendar */}
        <div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <button onClick={() => setCalendarDate(addMonths(calendarDate, -1))} className="p-1.5 hover:bg-gray-200 rounded-lg"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">{formatMonthYear(calendarDate)}</span>
                <button onClick={() => setCalendarDate(new Date())} className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg">Today</button>
              </div>
              <button onClick={() => setCalendarDate(addMonths(calendarDate, 1))} className="p-1.5 hover:bg-gray-200 rounded-lg"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
            </div>
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="px-1 py-2 text-xs font-medium text-gray-500 text-center uppercase">{d}</div>
              ))}
            </div>
            <div>
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                {calDays.map(day => {
                  const dateStr = formatDate(day);
                  const timeOff = myTimeOffs.find(t => t.date === dateStr);
                  const dayShifts = myShifts.filter(s => s.date === dateStr);
                  const inMonth = isSameMonth(day, calendarDate);
                  const isCurrentDay = isToday(day);
                  const catInfo = timeOff ? getCategoryInfo(timeOff.category) : null;
                  return (
                    <div key={dateStr} className={`bg-white min-h-[60px] sm:min-h-[80px] ${isCurrentDay ? 'bg-indigo-50/30' : ''} ${!inMonth ? 'opacity-40' : ''} ${timeOff ? 'bg-amber-50/50' : ''}`}>
                      <div className="px-2 py-1 flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isCurrentDay ? 'w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]' : 'text-gray-500'}`}>{formatDayNum(day)}</span>
                        {inMonth && !timeOff && (
                          <button onClick={() => handleCalendarDayClick(dateStr)} className="p-0.5 text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors opacity-0 hover:opacity-100 focus:opacity-100">
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {timeOff && catInfo && (
                        <div className="px-1">
                          <div className={`text-[9px] font-medium rounded px-1 py-0.5 mb-0.5 truncate flex items-center gap-0.5 ${catInfo.color}`}>
                            <span className="truncate">{(timeOff.status || 'approved') === 'pending' ? '⏳ ' : ''}{timeOff.halfDay ? '½ ' : ''}{catInfo.label}</span>
                            {inMonth && <button onClick={() => handleRemove(timeOff.id)} className="shrink-0 hover:text-red-600"><X className="w-2.5 h-2.5" /></button>}
                          </div>
                        </div>
                      )}
                      <div className="px-1 pb-1 space-y-0.5">
                        {dayShifts.slice(0, 2).map(s => (
                          <div key={s.id} className="rounded px-1 py-0.5 text-[9px] font-medium text-white truncate" style={{ backgroundColor: s.color }}>{s.name}</div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {TIME_OFF_CATEGORIES.map(c => (
              <div key={c.value} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <div className={`w-2.5 h-2.5 rounded-sm ${c.color.split(' ')[1]}`} />
                {c.label}
              </div>
            ))}
          </div>

          {/* Public Holidays */}
          {state.currentUser.country && (() => {
            const holidays = getHolidays(state.currentUser.country!, now.getFullYear())
              .filter(h => h.date >= format(now, 'yyyy-MM-dd')).slice(0, 5);
            if (holidays.length === 0) return null;
            return (
              <div className="mt-4 bg-purple-50 rounded-xl border border-purple-200 p-4">
                <h3 className="text-sm font-medium text-purple-700 mb-2">Upcoming Public Holidays ({getCountryName(state.currentUser.country!)})</h3>
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
        </div>

        {/* Right: Lists */}
        <div className="space-y-4">
          {/* Pending */}
          {pending.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                <h3 className="text-sm font-semibold text-amber-800">Pending Approval ({pending.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {pending.map(to => {
                  const catInfo = getCategoryInfo(to.category);
                  return (
                    <div key={to.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-800 font-medium">{format(parseISO(to.date), 'EEE, MMM d')}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${catInfo.color}`}>{catInfo.label}</span>
                        {to.halfDay && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded text-indigo-700 bg-indigo-50">½</span>}
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded text-amber-700 bg-amber-100">⏳ Pending</span>
                      </div>
                      <button onClick={() => handleRemove(to.id)} className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming approved */}
          {approvedUpcoming.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Upcoming Days Off ({approvedUpcoming.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {approvedUpcoming.map(to => {
                  const catInfo = getCategoryInfo(to.category);
                  return (
                    <div key={to.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-800 font-medium">{format(parseISO(to.date), 'EEE, MMM d')}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${catInfo.color}`}>{catInfo.label}</span>
                        {to.halfDay && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded text-indigo-700 bg-indigo-50">½</span>}
                        {to.reason && <span className="text-gray-400 text-xs">– {to.reason}</span>}
                      </div>
                      <button onClick={() => handleRemove(to.id)} className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Past days off */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Past Days Off ({past.length})</h3>
            </div>
            {past.length > 0 ? (
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                {past.map(to => {
                  const catInfo = getCategoryInfo(to.category);
                  return (
                    <div key={to.id} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
                      <span>{format(parseISO(to.date), 'MMM d, yyyy')}</span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${catInfo.color}`}>{catInfo.label}</span>
                      {to.halfDay && <span className="text-[9px] text-indigo-600">½</span>}
                      {to.reason && <span className="text-xs text-gray-400">– {to.reason}</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-gray-400 text-center">No past days off</p>
            )}
          </div>

          {/* Rejected */}
          {rejected.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 border-b border-red-200">
                <h3 className="text-sm font-semibold text-red-700">Rejected ({rejected.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {rejected.map(to => (
                  <div key={to.id} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 line-through">
                    <span>{format(parseISO(to.date), 'MMM d, yyyy')}</span>
                    {to.reason && <span className="text-xs">– {to.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Days Off */}
          {teamDaysOff.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Team Days Off</h3>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                {teamDaysOff.map(to => {
                  const agent = state.users.find(u => u.id === to.userId);
                  return (
                    <div key={to.id} className="flex items-center justify-between px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium" style={{ backgroundColor: agent?.color || '#6366f1' }}>{agent?.name?.[0]}</div>
                        <span className="text-sm text-gray-700">{agent?.name}</span>
                        {to.halfDay && <span className="text-[9px] px-1 py-0.5 text-indigo-700 bg-indigo-50 rounded font-medium">½</span>}
                      </div>
                      <span className="text-xs text-gray-500">{format(parseISO(to.date), 'MMM d')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
