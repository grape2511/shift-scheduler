import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatDate } from '../utils/dates';
import { getTaskAssignments } from '../utils/tasks';
import { subDays, subMonths, subYears, format, parseISO } from 'date-fns';
import { Download, FileText, Filter } from 'lucide-react';

type RangeKey = '7d' | '1m' | '1y' | 'all';

const RANGES: { key: RangeKey; label: string; cutoff: (today: Date) => Date | null }[] = [
  { key: '7d', label: 'Last 7 days', cutoff: t => subDays(t, 7) },
  { key: '1m', label: 'Last month', cutoff: t => subMonths(t, 1) },
  { key: '1y', label: 'Last year', cutoff: t => subYears(t, 1) },
  { key: 'all', label: 'All time', cutoff: () => null },
];

interface ReportRow {
  agentId: string;
  agentName: string;
  agentColor: string;
  shiftId: string;
  shiftName: string;
  shiftDate: string;
  timezone: string;
  scheduledStart: string;
  scheduledEnd: string;
  task: string;
  clockInIso: string | null;
  clockOutIso: string | null;
  hours: number | null;
  status: 'Worked' | 'No clock-out' | 'In progress' | 'No clock-in';
}

// Format an ISO instant as "YYYY-MM-DD HH:MM" in the shift's own timezone.
function fmtClock(iso: string | null, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA → YYYY-MM-DD
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  return `${date} ${time}`;
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  // Prepend a BOM so Excel opens UTF-8 (accented names) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PREVIEW_LIMIT = 200;

export function ReportsView() {
  const { state, getShiftTasks } = useApp();
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [range, setRange] = useState<RangeKey>('1m');

  const agents = useMemo(
    () => state.users
      .filter(u => u.role === 'agent' || u.role === 'team-lead')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [state.users]
  );

  const rows = useMemo<ReportRow[]>(() => {
    const today = new Date();
    const todayStr = formatDate(today);
    const cutoffDate = RANGES.find(r => r.key === range)!.cutoff(today);
    const cutoffStr = cutoffDate ? formatDate(cutoffDate) : null;

    const out: ReportRow[] = [];
    for (const shift of state.shifts) {
      // Only shifts that have happened (past or today) carry clock data.
      if (shift.date > todayStr) continue;
      if (cutoffStr && shift.date < cutoffStr) continue;

      const stored = getShiftTasks(shift.id);
      const computed = stored && stored.size > 0 ? null : getTaskAssignments(shift.date, shift.assignedAgentIds);

      for (const agentId of [...new Set(shift.assignedAgentIds)]) {
        if (agentFilter !== 'all' && agentId !== agentFilter) continue;
        const agent = state.users.find(u => u.id === agentId);
        if (!agent) continue;

        const record = state.clockRecords.find(r => r.shiftId === shift.id && r.userId === agentId);
        const clockInIso = record?.clockIn || null;
        const clockOutIso = record?.clockOut || null;

        let hours: number | null = null;
        let status: ReportRow['status'];
        if (!clockInIso) {
          status = 'No clock-in';
        } else if (!clockOutIso) {
          status = shift.date === todayStr ? 'In progress' : 'No clock-out';
        } else {
          hours = Math.round(((new Date(clockOutIso).getTime() - new Date(clockInIso).getTime()) / 3_600_000) * 100) / 100;
          status = 'Worked';
        }

        const task = (stored?.get(agentId) ?? computed?.get(agentId) ?? '') as string;

        out.push({
          agentId,
          agentName: agent.name,
          agentColor: agent.color,
          shiftId: shift.id,
          shiftName: shift.name,
          shiftDate: shift.date,
          timezone: shift.timezone,
          scheduledStart: shift.startTime,
          scheduledEnd: shift.endTime,
          task,
          clockInIso,
          clockOutIso,
          hours,
          status,
        });
      }
    }
    out.sort((a, b) => (a.shiftDate < b.shiftDate ? 1 : a.shiftDate > b.shiftDate ? -1 : a.agentName.localeCompare(b.agentName)));
    return out;
  }, [state.shifts, state.clockRecords, state.users, agentFilter, range, getShiftTasks]);

  const totalHours = useMemo(() => rows.reduce((s, r) => s + (r.hours || 0), 0), [rows]);

  const handleDownload = () => {
    const allAgents = agentFilter === 'all';
    const header = [
      ...(allAgents ? ['Agent'] : []),
      'Date', 'Shift', 'Scheduled Start', 'Scheduled End', 'Timezone', 'Task', 'Clocked In', 'Clocked Out', 'Hours Worked', 'Status',
    ];
    const body = rows.map(r => [
      ...(allAgents ? [r.agentName] : []),
      r.shiftDate,
      r.shiftName,
      r.scheduledStart,
      r.scheduledEnd,
      r.timezone,
      r.task,
      fmtClock(r.clockInIso, r.timezone),
      fmtClock(r.clockOutIso, r.timezone),
      r.hours ?? '',
      r.status,
    ]);
    const who = allAgents ? 'all-agents' : (agents.find(a => a.id === agentFilter)?.name.replace(/\s+/g, '-').toLowerCase() || 'agent');
    downloadCsv(`shift-report_${who}_${range}.csv`, [header, ...body]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Per-agent shift history — assigned shifts, task, and actual clock-in / clock-out times. Download as CSV.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Agent</label>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Time range</label>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  range === r.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={rows.length === 0}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-300">
        <span className="px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <strong className="text-gray-900 dark:text-gray-100">{rows.length}</strong> shift{rows.length === 1 ? '' : 's'}
        </span>
        <span className="px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <strong className="text-gray-900 dark:text-gray-100">{Math.round(totalHours * 10) / 10}</strong> hours worked
        </span>
      </div>

      {/* Preview table */}
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Filter className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No shifts in this range.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  {agentFilter === 'all' && <th className="px-4 py-2.5 text-left font-medium">Agent</th>}
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">Shift</th>
                  <th className="px-4 py-2.5 text-left font-medium">Task</th>
                  <th className="px-4 py-2.5 text-left font-medium">Clocked in</th>
                  <th className="px-4 py-2.5 text-left font-medium">Clocked out</th>
                  <th className="px-4 py-2.5 text-right font-medium">Hours</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.slice(0, PREVIEW_LIMIT).map(r => (
                  <tr key={`${r.shiftId}:${r.agentId}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    {agentFilter === 'all' && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium" style={{ backgroundColor: r.agentColor }}>
                            {r.agentName[0]}
                          </div>
                          <span className="text-gray-900 dark:text-gray-100">{r.agentName}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{format(parseISO(r.shiftDate), 'EEE, MMM d, yyyy')}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{r.shiftName}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{r.task || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtClock(r.clockInIso, r.timezone) || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtClock(r.clockOutIso, r.timezone) || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{r.hours ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {rows.length > PREVIEW_LIMIT
              ? `Showing first ${PREVIEW_LIMIT} of ${rows.length} rows — download the CSV for the full report.`
              : `${rows.length} row${rows.length === 1 ? '' : 's'} · clock times shown in each shift's timezone.`}
          </div>
        </div>
      )}
    </div>
  );
}
