import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { LogIn, LogOut, X } from 'lucide-react';

export function ShiftPrompt() {
  const { state, dispatch, getShiftsForAgent, getClockRecord } = useApp();
  const [dismissed, setDismissed] = useState<Map<string, number>>(new Map());
  const [elapsed, setElapsed] = useState(0);

  const isAgent = state.currentUser.role === 'agent' || state.currentUser.role === 'team-lead';
  const nowDate = new Date();
  const todayStr = nowDate.toISOString().split('T')[0];
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

  const myShiftsToday = getShiftsForAgent(state.currentUser.id).filter(s => s.date === todayStr);

  // Find shift that needs clock-in (starts within 15 min or already started, not clocked in)
  const needsClockIn = myShiftsToday.find(s => {
    const [h, m] = s.startTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const [eh, em] = s.endTime.split(':').map(Number);
    const endMin = eh * 60 + em;
    const adjustedEnd = endMin < startMin ? endMin + 1440 : endMin;
    const adjustedNow = nowMinutes < startMin && endMin < startMin ? nowMinutes + 1440 : nowMinutes;
    const record = getClockRecord(s.id, state.currentUser.id);
    const dismissedAt = dismissed.get(`in-${s.id}`);
    const isDismissed = dismissedAt && (Date.now() - dismissedAt) < 300000; // re-show after 5 min
    return !record && adjustedNow >= startMin - 15 && adjustedNow < adjustedEnd && !isDismissed;
  });

  // Find shift that needs clock-out (ends within 15 min or past end, clocked in but not out)
  const needsClockOut = myShiftsToday.find(s => {
    const record = getClockRecord(s.id, state.currentUser.id);
    if (!record || !record.clockIn || record.clockOut) return false;
    const [eh, em] = s.endTime.split(':').map(Number);
    const endMin = eh * 60 + em;
    const [sh, sm] = s.startTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const adjustedEnd = endMin < startMin ? endMin + 1440 : endMin;
    const adjustedNow = nowMinutes < startMin ? nowMinutes + 1440 : nowMinutes;
    const dismissedAt = dismissed.get(`out-${s.id}`);
    const isDismissed = dismissedAt && (Date.now() - dismissedAt) < 300000; // re-show after 5 min
    return adjustedNow >= adjustedEnd - 15 && !isDismissed;
  });

  // Find active clocked-in shift for timer
  const activeClockedShift = myShiftsToday.find(s => {
    const record = getClockRecord(s.id, state.currentUser.id);
    return record?.clockIn && !record?.clockOut;
  });
  const activeRecord = activeClockedShift ? getClockRecord(activeClockedShift.id, state.currentUser.id) : undefined;

  // Live timer
  useEffect(() => {
    if (!activeRecord?.clockIn) return;
    const update = () => setElapsed(Math.floor((Date.now() - new Date(activeRecord.clockIn!).getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeRecord?.clockIn]);

  // Recheck every minute for prompts
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!isAgent) return null;

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleClockIn = (shiftId: string) => {
    dispatch({
      type: 'CLOCK_IN',
      payload: {
        id: uuid(),
        shiftId,
        userId: state.currentUser.id,
        clockIn: new Date().toISOString(),
        clockOut: null,
      },
    });
    setDismissed(prev => new Map(prev).set(`in-${shiftId}`, Date.now()));
  };

  const handleClockOut = (shiftId: string) => {
    dispatch({
      type: 'CLOCK_OUT',
      payload: {
        shiftId,
        userId: state.currentUser.id,
        clockOut: new Date().toISOString(),
      },
    });
    setDismissed(prev => new Map(prev).set(`out-${shiftId}`, Date.now()));
  };

  return (
    <>
      {/* Live Timer in header */}
      {activeClockedShift && activeRecord && (
        <div className="fixed bottom-4 right-4 z-40 bg-white rounded-xl shadow-lg border border-green-200 px-4 py-3 flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <div>
            <p className="text-xs text-gray-500">{activeClockedShift.name}</p>
            <p className="text-lg font-mono font-bold text-gray-900">{formatElapsed(elapsed)}</p>
          </div>
          <button
            onClick={() => handleClockOut(activeClockedShift.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Clock Out
          </button>
        </div>
      )}

      {/* Clock In Prompt */}
      {needsClockIn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <img
              src="https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif"
              alt="Good morning"
              className="w-full h-32 object-cover"
            />
            <div className="p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-gray-900">Rise and shine! ☀️</h3>
                <button onClick={() => setDismissed(prev => new Map(prev).set(`in-${needsClockIn.id}`, Date.now()))} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">{needsClockIn.name} · {needsClockIn.startTime} – {needsClockIn.endTime}</p>

              <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-3 mb-4">
                <p className="text-sm text-indigo-700">
                  👋 Hop into <strong>#support_team_on_duty</strong> on Slack and let the team know you're here — a simple "good morning" goes a long way!
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setDismissed(prev => new Map(prev).set(`in-${needsClockIn.id}`, Date.now()))}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Snooze 5 min
                </button>
                <button
                  onClick={() => handleClockIn(needsClockIn.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Let's go!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clock Out Prompt */}
      {needsClockOut && !needsClockIn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <img
              src="https://media.giphy.com/media/l3q2wJsC23ikJg9xe/giphy.gif"
              alt="Great job"
              className="w-full h-32 object-cover"
            />
            <div className="p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-gray-900">You crushed it today! 🎉</h3>
                <button onClick={() => setDismissed(prev => new Map(prev).set(`out-${needsClockOut.id}`, Date.now()))} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-3">{needsClockOut.name} · ends at {needsClockOut.endTime}</p>

              {activeRecord && (
                <div className="bg-green-50 rounded-lg p-3 mb-3 text-center">
                  <p className="text-[10px] text-green-600 uppercase font-medium">Shift duration</p>
                  <p className="text-2xl font-mono font-bold text-green-800">{formatElapsed(elapsed)}</p>
                </div>
              )}

              <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-3 mb-4">
                <p className="text-sm text-indigo-700">
                  🫡 Before you head out, drop a quick goodbye in <strong>#support_team_on_duty</strong> — your teammates appreciate it!
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setDismissed(prev => new Map(prev).set(`out-${needsClockOut.id}`, Date.now()))}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Not yet
                </button>
                <button
                  onClick={() => handleClockOut(needsClockOut.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Clock Out & Relax
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
