import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { Clock, Calendar, AlertTriangle, Users, TrendingUp, UserCheck } from 'lucide-react';
import { format, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { TIME_OFF_CATEGORIES } from '../types';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

function getDateRange(period: Period, refDate: Date) {
  switch (period) {
    case 'daily':
      return { start: format(startOfDay(refDate), 'yyyy-MM-dd'), end: format(startOfDay(refDate), 'yyyy-MM-dd'), label: format(refDate, 'EEE, MMM d, yyyy') };
    case 'weekly': {
      const s = startOfWeek(refDate, { weekStartsOn: 1 });
      const e = endOfWeek(refDate, { weekStartsOn: 1 });
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), label: `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}` };
    }
    case 'monthly': {
      const s = startOfMonth(refDate);
      const e = endOfMonth(refDate);
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), label: format(refDate, 'MMMM yyyy') };
    }
    case 'yearly': {
      const s = startOfYear(refDate);
      const e = endOfYear(refDate);
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), label: format(refDate, 'yyyy') };
    }
  }
}

export function InsightsView() {
  const { state, activeAgents: agents, getClockRecord } = useApp();
  const [period, setPeriod] = useState<Period>('monthly');
  const now = new Date();
  const range = getDateRange(period, now);

  const data = useMemo(() => {
    const inRange = (date: string) => date >= range.start && date <= range.end;

    // Shifts in range
    const shiftsInRange = state.shifts.filter(s => inRange(s.date));

    // Time offs in range
    const timeOffsInRange = state.timeOffs.filter(t => inRange(t.date));

    // Per-agent stats
    const agentStats = agents.map(agent => {
      const agentShifts = shiftsInRange.filter(s => s.assignedAgentIds.includes(agent.id));
      const agentTimeOffs = timeOffsInRange.filter(t => t.userId === agent.id);
      const sickDays = agentTimeOffs.filter(t => t.category === 'sick').length;
      const ptoDays = agentTimeOffs.filter(t => t.category !== 'sick').length;

      // Calculate hours
      let totalMinutes = 0;
      for (const shift of agentShifts) {
        const record = getClockRecord(shift.id, agent.id);
        if (record?.clockIn && record?.clockOut) {
          const diff = new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime();
          totalMinutes += diff / 60000;
        } else {
          const [sh, sm] = shift.startTime.split(':').map(Number);
          const [eh, em] = shift.endTime.split(':').map(Number);
          let mins = (eh * 60 + em) - (sh * 60 + sm);
          if (mins < 0) mins += 1440;
          totalMinutes += mins;
        }
      }
      const hours = Math.round((totalMinutes / 60) * 10) / 10;

      return {
        agent,
        shifts: agentShifts.length,
        hours,
        timeOffs: agentTimeOffs.length,
        sickDays,
        ptoDays,
      };
    }).sort((a, b) => b.hours - a.hours);

    // Totals
    const totalShifts = shiftsInRange.length;
    const totalTimeOffs = timeOffsInRange.length;
    const totalHours = agentStats.reduce((sum, a) => sum + a.hours, 0);
    const avgHours = agents.length > 0 ? Math.round((totalHours / agents.length) * 10) / 10 : 0;
    const unfilledShifts = shiftsInRange.filter(s => s.assignedAgentIds.length < s.requiredAgents).length;
    const unfilledShiftDetails = shiftsInRange
      .filter(s => s.assignedAgentIds.length < s.requiredAgents)
      .map(s => ({ name: s.name, date: s.date, assigned: s.assignedAgentIds.length, required: s.requiredAgents, missing: s.requiredAgents - s.assignedAgentIds.length }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Time off by category
    const timeOffByCategory = TIME_OFF_CATEGORIES.map(cat => ({
      ...cat,
      count: timeOffsInRange.filter(t => (t.category || 'vacation') === cat.value).length,
    })).filter(c => c.count > 0);

    // Top workers
    const topWorker = agentStats[0];
    const leastWorker = agentStats.length > 1 ? agentStats[agentStats.length - 1] : null;

    return { agentStats, totalShifts, totalTimeOffs, totalHours, avgHours, unfilledShifts, unfilledShiftDetails, timeOffByCategory, topWorker, leastWorker };
  }, [state.shifts, state.timeOffs, agents, range.start, range.end]);

  const periods: { value: Period; label: string }[] = [
    { value: 'daily', label: 'Today' },
    { value: 'weekly', label: 'This Week' },
    { value: 'monthly', label: 'This Month' },
    { value: 'yearly', label: 'This Year' },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Insights</h2>
          <p className="text-sm text-gray-500">{range.label}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {periods.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Calendar className="w-3.5 h-3.5" />
            Total Shifts
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.totalShifts}</p>
          {data.unfilledShifts > 0 && (
            <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {data.unfilledShifts} unfilled
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Clock className="w-3.5 h-3.5" />
            Total Hours
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.totalHours}</p>
          <p className="text-[10px] text-gray-400 mt-1">Avg {data.avgHours}h per agent</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Users className="w-3.5 h-3.5" />
            Agents on Shift
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.agentStats.filter(a => a.shifts > 0).length}</p>
          <p className="text-[10px] text-gray-400 mt-1">of {agents.length} total</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Days Off
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.totalTimeOffs}</p>
          {data.timeOffByCategory.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {data.timeOffByCategory.map(c => (
                <span key={c.value} className={`text-[9px] font-medium px-1 py-0.5 rounded ${c.color}`}>{c.count} {c.label}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Unfilled Shifts Details */}
      {data.unfilledShiftDetails.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Unfilled Shifts ({data.unfilledShiftDetails.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.unfilledShiftDetails.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{s.name}</span>
                  <span className="text-xs text-gray-500">{s.date}</span>
                </div>
                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded">
                  {s.assigned}/{s.required} agents ({s.missing} missing)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highlights */}
      {(data.topWorker || data.leastWorker) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {data.topWorker && data.topWorker.hours > 0 && (
            <div className="bg-green-50 rounded-xl border border-green-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: data.topWorker.agent.color }}>
                {data.topWorker.agent.name[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-medium text-green-700">Most Hours</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{data.topWorker.agent.name}</p>
                <p className="text-xs text-gray-500">{data.topWorker.hours}h across {data.topWorker.shifts} shifts</p>
              </div>
            </div>
          )}
          {data.leastWorker && data.leastWorker.hours > 0 && data.leastWorker.hours < data.topWorker!.hours && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: data.leastWorker.agent.color }}>
                {data.leastWorker.agent.name[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">Fewest Hours</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{data.leastWorker.agent.name}</p>
                <p className="text-xs text-gray-500">{data.leastWorker.hours}h across {data.leastWorker.shifts} shifts</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Agent Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Agent Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Agent</th>
                <th className="text-right px-4 py-2.5">Shifts</th>
                <th className="text-right px-4 py-2.5">Hours</th>
                <th className="hidden sm:table-cell text-right px-4 py-2.5">PTO</th>
                <th className="hidden sm:table-cell text-right px-4 py-2.5">Sick</th>
                <th className="hidden md:table-cell px-4 py-2.5 w-40">Hours Distribution</th>
              </tr>
            </thead>
            <tbody>
              {data.agentStats.map(({ agent, shifts, hours, ptoDays, sickDays }) => {
                const maxHours = data.topWorker?.hours || 1;
                const pct = (hours / maxHours) * 100;
                return (
                  <tr key={agent.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0" style={{ backgroundColor: agent.color }}>
                          {agent.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                          {agent.label && <span className="text-[10px] text-indigo-600">{agent.label}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 text-sm text-gray-700">{shifts}</td>
                    <td className="text-right px-4 py-3 text-sm font-bold text-gray-900">{hours}h</td>
                    <td className="hidden sm:table-cell text-right px-4 py-3 text-sm text-gray-500">{ptoDays || '—'}</td>
                    <td className="hidden sm:table-cell text-right px-4 py-3 text-sm text-gray-500">{sickDays || '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.agentStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No data for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
