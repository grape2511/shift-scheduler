import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { ShiftCard } from './ShiftCard';
import { Calendar, AlertTriangle, X, ArrowRightLeft, Check, XCircle, Clock } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { getHolidays, getCountryName } from '../utils/holidays';

export function MyShiftsView() {
  const { state, dispatch, getShiftsForAgent, getPendingSwapRequests, getAgentById, getMonthlyHours, getPtoBalance } = useApp();
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [timeOffDate, setTimeOffDate] = useState('');
  const [timeOffReason, setTimeOffReason] = useState('');

  const myShifts = getShiftsForAgent(state.currentUser.id);
  const today = startOfDay(new Date());
  const now = new Date();
  const monthlyHours = getMonthlyHours(state.currentUser.id, now.getFullYear(), now.getMonth());
  const TARGET_HOURS = 40;
  const isOvertime = monthlyHours > TARGET_HOURS;

  const upcomingShifts = myShifts.filter(s => !isBefore(parseISO(s.date), today));
  const pastShifts = myShifts.filter(s => isBefore(parseISO(s.date), today));

  const myTimeOffs = state.timeOffs.filter(t => t.userId === state.currentUser.id);

  const handleAddTimeOff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeOffDate) return;
    const { remaining } = getPtoBalance(state.currentUser.id);
    if (remaining <= 0) {
      if (!confirm('You have no remaining paid days off this year. Continue anyway?')) return;
    }
    dispatch({
      type: 'ADD_TIME_OFF',
      payload: {
        id: uuid(),
        userId: state.currentUser.id,
        date: timeOffDate,
        reason: timeOffReason || undefined,
      },
    });
    setTimeOffDate('');
    setTimeOffReason('');
    setShowTimeOff(false);
  };

  const handleRemoveTimeOff = (id: string) => {
    dispatch({ type: 'REMOVE_TIME_OFF', payload: id });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">My Shifts</h2>
          <p className="text-sm text-gray-500">{upcomingShifts.length} upcoming shifts</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Monthly Hours Counter */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="text-sm">
              <span className="text-xs text-gray-400 block leading-tight">{format(now, 'MMMM')}</span>
              <span className={`font-bold ${isOvertime ? 'text-red-600' : 'text-gray-900'}`}>
                {monthlyHours}/{TARGET_HOURS}h
              </span>
            </div>
          </div>
          {/* PTO Balance */}
          {(() => {
            const { remaining, total, used } = getPtoBalance(state.currentUser.id);
            const isOver = used > total;
            return (
              <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div className="text-sm">
                  <span className="text-xs text-gray-400 block leading-tight">{now.getFullYear()}</span>
                  <span className={`font-bold ${isOver ? 'text-red-600' : remaining <= 3 ? 'text-amber-600' : 'text-gray-900'}`}>
                    {remaining}/{total} days
                  </span>
                </div>
              </div>
            );
          })()}
          <button
            onClick={() => setShowTimeOff(!showTimeOff)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            OOO
          </button>
        </div>
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
          <h3 className="text-sm font-medium text-amber-800 mb-3">Mark Unavailable Date</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <label className="block text-xs font-medium text-amber-700 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={timeOffReason}
                onChange={e => setTimeOffReason(e.target.value)}
                placeholder="e.g. Vacation, Doctor"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setShowTimeOff(false)}
              className="px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* Time Off List */}
      {myTimeOffs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">My Time Off</h3>
          <div className="flex flex-wrap gap-2">
            {myTimeOffs.map(to => (
              <div
                key={to.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm"
              >
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-amber-800 font-medium">
                  {format(parseISO(to.date), 'MMM d, yyyy')}
                </span>
                {to.reason && <span className="text-amber-600">– {to.reason}</span>}
                <button
                  onClick={() => handleRemoveTimeOff(to.id)}
                  className="p-0.5 text-amber-400 hover:text-red-500 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div className="text-gray-300 text-5xl mb-4">🗓️</div>
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
