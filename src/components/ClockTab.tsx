import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { LogIn, LogOut, Clock, Calendar } from 'lucide-react';
import { convertTime, getUserTimezone } from '../utils/timezone';
import { format } from 'date-fns';

export function ClockTab() {
  const { state, dispatch, getShiftsForAgent, getClockRecord, getMonthlyHours } = useApp();
  const [elapsed, setElapsed] = useState(0);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const myShiftsToday = getShiftsForAgent(state.currentUser.id).filter(s => s.date === todayStr);

  const userTimezone = getUserTimezone(state.currentUser.timezone, state.currentUser.country);

  const formatShiftTime = (time: string, shiftTz: string) => {
    return convertTime(time, shiftTz, userTimezone);
  };

  // Find active clocked-in shift
  const activeShift = myShiftsToday.find(s => {
    const record = getClockRecord(s.id, state.currentUser.id);
    return record?.clockIn && !record?.clockOut;
  });
  const activeRecord = activeShift ? getClockRecord(activeShift.id, state.currentUser.id) : undefined;

  // Live timer
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

  const monthlyHours = getMonthlyHours(state.currentUser.id, now.getFullYear(), now.getMonth());

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Clock In / Out</h2>
          <p className="text-sm text-gray-500">{format(now, 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg">
          <Clock className="w-4 h-4 text-gray-400" />
          <div className="text-sm">
            <span className="text-xs text-gray-400 block leading-tight">{format(now, 'MMMM')}</span>
            <span className="font-bold text-gray-900">{monthlyHours}/208h</span>
          </div>
        </div>
      </div>

      {/* Active Shift Timer */}
      {activeShift && activeRecord && (
        <div className="mb-6 bg-green-50 rounded-2xl border border-green-200 p-8 text-center">
          <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse mx-auto mb-3" />
          <p className="text-sm text-green-600 font-medium mb-1">{activeShift.name}</p>
          <p className="text-xs text-green-500 mb-4">
            {formatShiftTime(activeShift.startTime, activeShift.timezone)} – {formatShiftTime(activeShift.endTime, activeShift.timezone)}
            {userTimezone && userTimezone !== activeShift.timezone ? ' (your time)' : ''}
          </p>
          <p className="text-6xl font-mono font-bold text-green-800 mb-2">{formatElapsed(elapsed)}</p>
          <p className="text-xs text-green-500 mb-6">
            Clocked in at {new Date(activeRecord.clockIn!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: userTimezone })}
          </p>
          <button
            onClick={() => handleClockOut(activeShift.id)}
            className="inline-flex items-center gap-2 px-8 py-3 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Clock Out
          </button>
        </div>
      )}

      {/* Today's Shifts */}
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Today's Shifts</h3>
      {myShiftsToday.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center">
          <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No shifts assigned for today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myShiftsToday.map(s => {
            const record = getClockRecord(s.id, state.currentUser.id);
            const isClockedIn = record?.clockIn && !record?.clockOut;
            const isCompleted = record?.clockIn && record?.clockOut;

            return (
              <div key={s.id} className={`rounded-xl border p-5 ${
                isClockedIn ? 'bg-green-50 border-green-200' : isCompleted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {isClockedIn && <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />}
                      {isCompleted && <div className="w-2.5 h-2.5 bg-gray-400 rounded-full" />}
                      {!record && <div className="w-2.5 h-2.5 bg-amber-400 rounded-full" />}
                      <h4 className="text-sm font-semibold text-gray-900">{s.name}</h4>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatShiftTime(s.startTime, s.timezone)} – {formatShiftTime(s.endTime, s.timezone)}
                      {userTimezone && userTimezone !== s.timezone ? ' (your time)' : ''}
                      <span className="text-gray-400 ml-2">({s.timezone.split('/').pop()})</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {isClockedIn && (
                      <span className="text-lg font-mono font-bold text-green-800">{formatElapsed(elapsed)}</span>
                    )}
                    {isCompleted && (() => {
                      const diff = new Date(record!.clockOut!).getTime() - new Date(record!.clockIn!).getTime();
                      const hrs = Math.floor(diff / 3600000);
                      const mins = Math.round((diff % 3600000) / 60000);
                      return (
                        <div className="text-right">
                          <span className="text-sm font-bold text-gray-700">{hrs}h {mins}m</span>
                          <p className="text-[10px] text-gray-400">
                            {new Date(record!.clockIn!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: userTimezone })} – {new Date(record!.clockOut!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: userTimezone })}
                          </p>
                        </div>
                      );
                    })()}
                    {!record && (
                      <button
                        onClick={() => handleClockIn(s.id)}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 transition-colors"
                      >
                        <LogIn className="w-4 h-4" />
                        Clock In
                      </button>
                    )}
                    {isClockedIn && (
                      <button
                        onClick={() => handleClockOut(s.id)}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Clock Out
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
