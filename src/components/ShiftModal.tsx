import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { X, UserPlus, Check, Trash2, ChevronDown, ArrowRightLeft } from 'lucide-react';
import { SHIFT_COLORS, getNextColor } from '../utils/colors';
import type { Shift } from '../types';

interface ShiftModalProps {
  onClose: () => void;
  editShift?: Shift | null;
  defaultDate?: string;
}

const TIMEZONES = [
  'Europe/Amsterdam',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'UTC',
];

const PRESET_SHIFTS = [
  { name: 'EU Shift', startTime: '08:00', endTime: '16:00', color: '#3b82f6' },
  { name: 'USA Shift', startTime: '16:00', endTime: '00:00', color: '#6366f1' },
  { name: 'Mid Shift', startTime: '00:00', endTime: '08:00', color: '#8b5cf6' },
];

export function ShiftModal({ onClose, editShift, defaultDate }: ShiftModalProps) {
  const { state, dispatch, agents } = useApp();
  const [name, setName] = useState(editShift?.name || '');
  const [date, setDate] = useState(editShift?.date || defaultDate || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(editShift?.startTime || '09:00');
  const [endTime, setEndTime] = useState(editShift?.endTime || '17:00');
  const [timezone, setTimezone] = useState(editShift?.timezone || 'Europe/Amsterdam');
  const [recurring, setRecurring] = useState<Shift['recurring']>(() => {
    if (editShift?.recurring) return editShift.recurring;
    // Detect weekend rotation from group data if recurring field wasn't saved properly
    if (editShift?.recurringGroupId) {
      const groupShifts = state.shifts.filter(s => s.recurringGroupId === editShift.recurringGroupId);
      const days = groupShifts.map(s => new Date(s.date + 'T12:00:00').getDay());
      const onlyWeekends = days.every(d => d === 0 || d === 6);
      if (onlyWeekends && groupShifts.length > 4) return 'weekend-rotation';
    }
    return 'none';
  });
  const [color, setColor] = useState(editShift?.color || '');
  const [requiredAgents, setRequiredAgents] = useState(editShift?.requiredAgents || 1);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(editShift?.assignedAgentIds || []);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  // Initialize groups from existing rotation when editing
  const [groupA, setGroupA] = useState<string[]>(() => {
    if (!editShift?.recurringGroupId) return [];
    const groupShifts = state.shifts
      .filter(s => s.recurringGroupId === editShift.recurringGroupId)
      .sort((a, b) => a.date.localeCompare(b.date));
    // Group A = agents on the first Saturday
    const firstSat = groupShifts.find(s => new Date(s.date + 'T12:00:00').getDay() === 6);
    if (firstSat) return [...firstSat.assignedAgentIds];
    return [];
  });
  const [groupB, setGroupB] = useState<string[]>(() => {
    if (!editShift?.recurringGroupId) return [];
    const groupShifts = state.shifts
      .filter(s => s.recurringGroupId === editShift.recurringGroupId)
      .sort((a, b) => a.date.localeCompare(b.date));
    // Group B = agents on the first Sunday
    const firstSun = groupShifts.find(s => new Date(s.date + 'T12:00:00').getDay() === 0);
    if (firstSun) return [...firstSun.assignedAgentIds];
    return [];
  });

  const shiftLabels = ['USA Shift', 'EU Shift', 'Mid Shift'];
  const rotationAgents = agents.filter(a => {
    const agentLabels = a.labels || (a.label ? [a.label] : []);
    return agentLabels.some(l => shiftLabels.includes(l));
  });
  const isRecurring = !!editShift?.recurringGroupId;
  const isAdmin = state.currentUser.role === 'admin';
  const isAssignedToMe = editShift?.assignedAgentIds.includes(state.currentUser.id) ?? false;

  useEffect(() => {
    if (!editShift && !color) {
      const usedColors = state.shifts.map(s => s.color);
      setColor(getNextColor(usedColors, SHIFT_COLORS));
    }
  }, []);

  const getUpdatedShift = (): Shift => ({
    ...editShift!,
    name, date, startTime, endTime, timezone, color, recurring, requiredAgents, assignedAgentIds: selectedAgentIds,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editShift) {
      if (isRecurring) {
        setShowSaveOptions(true);
        return;
      }
      dispatch({ type: 'UPDATE_SHIFT', payload: getUpdatedShift() });
    } else if (recurring === 'weekend-rotation' && (groupA.length > 0 || groupB.length > 0)) {
      dispatch({
        type: 'ADD_WEEKEND_ROTATION',
        payload: {
          shift: {
            id: uuid(),
            name,
            date,
            startTime,
            endTime,
            timezone,
            assignedAgentIds: [],
            recurring: 'weekend-rotation',
            requiredAgents,
            color,
          },
          groupA,
          groupB,
        },
      });
    } else {
      dispatch({
        type: 'ADD_SHIFT',
        payload: {
          id: uuid(),
          name,
          date,
          startTime,
          endTime,
          timezone,
          assignedAgentIds: selectedAgentIds,
          recurring,
          requiredAgents,
          color,
        },
      });
    }
    onClose();
  };

  const handleSaveThis = () => {
    dispatch({ type: 'UPDATE_SHIFT', payload: getUpdatedShift() });
    onClose();
  };

  const handleSaveFuture = () => {
    dispatch({ type: 'UPDATE_SHIFT_FUTURE', payload: getUpdatedShift() });
    onClose();
  };

  const handleSaveAll = () => {
    dispatch({ type: 'UPDATE_SHIFT_ALL_RECURRING', payload: getUpdatedShift() });
    onClose();
  };

  const applyPreset = (preset: typeof PRESET_SHIFTS[0]) => {
    setName(preset.name);
    setStartTime(preset.startTime);
    setEndTime(preset.endTime);
    setColor(preset.color);
  };

  const handleDeleteThis = () => {
    if (!editShift) return;
    dispatch({ type: 'DELETE_SHIFT', payload: editShift.id });
    onClose();
  };

  const handleDeleteAllRecurring = () => {
    if (!editShift) return;
    dispatch({ type: 'DELETE_SHIFT_ALL_RECURRING', payload: editShift.id });
    onClose();
  };

  const handleDeleteFuture = () => {
    if (!editShift) return;
    dispatch({ type: 'DELETE_SHIFT_FUTURE', payload: { shiftId: editShift.id, fromDate: editShift.date } });
    onClose();
  };

  const handleDeletePast = () => {
    if (!editShift) return;
    dispatch({ type: 'DELETE_SHIFT_PAST', payload: { shiftId: editShift.id, toDate: editShift.date } });
    onClose();
  };

  const handleSelfJoin = () => {
    if (!editShift) return;
    dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: editShift.id, agentId: state.currentUser.id } });
    onClose();
  };

  const handleSelfLeave = () => {
    if (!editShift) return;
    dispatch({ type: 'UNASSIGN_AGENT', payload: { shiftId: editShift.id, agentId: state.currentUser.id } });
    onClose();
  };

  // Agent read-only view
  if (!isAdmin && editShift) {
    return (
      <AgentShiftView
        shift={editShift}
        onClose={onClose}
        isAssignedToMe={isAssignedToMe}
        onJoin={handleSelfJoin}
        onLeave={handleSelfLeave}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {editShift ? 'Edit Shift' : 'Create Shift'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quick Presets */}
          {!editShift && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Quick Presets</label>
              <div className="flex gap-2">
                {PRESET_SHIFTS.map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Shift Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. EU Morning"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>

          {/* Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Timezone</label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Recurring */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Recurring</label>
            <div className="flex gap-1.5 flex-wrap">
              {([
                { value: 'none', label: 'One-time' },
                { value: 'daily', label: 'Daily (7d)' },
                { value: 'weekly', label: 'Weekly (4w)' },
                { value: 'weekdays', label: 'Weekdays' },
                { value: 'weekends', label: 'Weekends' },
                { value: 'weekend-rotation', label: 'Weekend Rotation' },
                { value: 'forever-daily', label: 'Daily Forever' },
                { value: 'forever-weekly', label: 'Weekly Forever' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurring(opt.value)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    recurring === opt.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {recurring === 'daily' && (
              <p className="text-xs text-gray-400 mt-1">Creates shifts for the next 7 days</p>
            )}
            {recurring === 'weekly' && (
              <p className="text-xs text-gray-400 mt-1">Creates shifts for the next 4 weeks</p>
            )}
            {recurring === 'forever-daily' && (
              <p className="text-xs text-gray-400 mt-1">Creates daily shifts for the next 365 days</p>
            )}
            {recurring === 'weekdays' && (
              <p className="text-xs text-gray-400 mt-1">Creates shifts on Mon–Fri for the next year</p>
            )}
            {recurring === 'weekends' && (
              <p className="text-xs text-gray-400 mt-1">Creates shifts on Sat–Sun for the next year</p>
            )}
            {recurring === 'forever-weekly' && (
              <p className="text-xs text-gray-400 mt-1">Creates weekly shifts for the next 52 weeks</p>
            )}
            {recurring === 'weekend-rotation' && (
              <p className="text-xs text-gray-400 mt-1">Each agent alternates Sat/Sun every week for 26 weeks</p>
            )}
          </div>

          {/* Weekend Rotation Groups */}
          {recurring === 'weekend-rotation' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Assign agents to two groups that alternate Sat ↔ Sun
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Group A */}
                <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50">
                  <p className="text-xs font-semibold text-blue-700 mb-2">Group A — Sat week 1, Sun week 2</p>
                  <div className="space-y-1.5">
                    {rotationAgents.map(agent => {
                      const inA = groupA.includes(agent.id);
                      const inB = groupB.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          disabled={inB}
                          onClick={() => !inB && setGroupA(prev => inA ? prev.filter(id => id !== agent.id) : [...prev, agent.id])}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-sm transition-colors ${
                            inA ? 'border-blue-400 bg-blue-100 text-blue-800' :
                            inB ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed' :
                            'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            inA ? 'bg-blue-600 border-blue-600' : inB ? 'bg-gray-200 border-gray-200' : 'border-gray-300'
                          }`}>
                            {inA && <Check className="w-3 h-3 text-white" />}
                            {inB && <Check className="w-3 h-3 text-gray-400" />}
                          </div>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0" style={{ backgroundColor: inB ? '#d1d5db' : agent.color }}>
                            {agent.name[0]}
                          </div>
                          <span className="flex-1 truncate">{agent.name.split(' ')[0]}</span>
                          {(agent.labels || (agent.label ? [agent.label] : [])).map(l => (
                            <span key={l} className={`text-[8px] px-1 py-0.5 rounded-full ${inB ? 'bg-gray-100 text-gray-300' : 'bg-blue-200/50 text-blue-700'}`}>{l}</span>
                          ))}
                          {inB && <span className="text-[9px] text-gray-400 shrink-0">in B</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Group B */}
                <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/50">
                  <p className="text-xs font-semibold text-purple-700 mb-2">Group B — Sun week 1, Sat week 2</p>
                  <div className="space-y-1.5">
                    {rotationAgents.map(agent => {
                      const inA = groupA.includes(agent.id);
                      const inB = groupB.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          disabled={inA}
                          onClick={() => !inA && setGroupB(prev => inB ? prev.filter(id => id !== agent.id) : [...prev, agent.id])}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-sm transition-colors ${
                            inB ? 'border-purple-400 bg-purple-100 text-purple-800' :
                            inA ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed' :
                            'border-gray-200 bg-white text-gray-700 hover:border-purple-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            inB ? 'bg-purple-600 border-purple-600' : inA ? 'bg-gray-200 border-gray-200' : 'border-gray-300'
                          }`}>
                            {inB && <Check className="w-3 h-3 text-white" />}
                            {inA && <Check className="w-3 h-3 text-gray-400" />}
                          </div>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0" style={{ backgroundColor: inA ? '#d1d5db' : agent.color }}>
                            {agent.name[0]}
                          </div>
                          <span className="flex-1 truncate">{agent.name.split(' ')[0]}</span>
                          {(agent.labels || (agent.label ? [agent.label] : [])).map(l => (
                            <span key={l} className={`text-[8px] px-1 py-0.5 rounded-full ${inA ? 'bg-gray-100 text-gray-300' : 'bg-purple-200/50 text-purple-700'}`}>{l}</span>
                          ))}
                          {inA && <span className="text-[9px] text-gray-400 shrink-0">in A</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Preview */}
              {(groupA.length > 0 || groupB.length > 0) && (
                <div className="mt-3 bg-gray-50 rounded-lg border border-gray-200 p-3">
                  <p className="text-[10px] font-medium text-gray-500 mb-1.5">Preview (first 4 weeks):</p>
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <span className="font-medium text-gray-400"></span>
                    <span className="font-medium text-gray-500 text-center">Saturday</span>
                    <span className="font-medium text-gray-500 text-center">Sunday</span>
                    {[0, 1, 2, 3].map(week => {
                      const satGroup = week % 2 === 0 ? groupA : groupB;
                      const sunGroup = week % 2 === 0 ? groupB : groupA;
                      return (
                        <div key={week} className="contents">
                          <span className="font-medium text-gray-500 py-0.5">Week {week + 1}</span>
                          <span className="text-blue-600 text-center py-0.5">{satGroup.map(id => agents.find(a => a.id === id)?.name?.split(' ')[0]).join(', ') || '—'}</span>
                          <span className="text-purple-600 text-center py-0.5">{sunGroup.map(id => agents.find(a => a.id === id)?.name?.split(' ')[0]).join(', ') || '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Required Agents */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Required Agents</label>
            <input
              type="number"
              min={1}
              max={50}
              value={requiredAgents}
              onChange={e => setRequiredAgents(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">How many agents are needed for this shift</p>
          </div>

          {/* Assign Agents (hidden for weekend rotation) */}
          {recurring !== 'weekend-rotation' && <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              <span className="flex items-center gap-1">
                <UserPlus className="w-3.5 h-3.5" />
                Assign Teammates
              </span>
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {agents.map(agent => {
                const isSelected = selectedAgentIds.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() =>
                      setSelectedAgentIds(prev =>
                        isSelected
                          ? prev.filter(id => id !== agent.id)
                          : [...prev, agent.id]
                      )
                    }
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-150 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.name[0]}
                    </div>
                    <span className="text-sm text-gray-700 flex-1">{agent.name}</span>
                    {(agent.labels || (agent.label ? [agent.label] : [])).map(l => (
                      <span key={l} className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded-full">{l}</span>
                    ))}
                    {isSelected && (
                      <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    )}
                  </button>
                );
              })}
              {agents.length === 0 && (
                <p className="text-xs text-gray-400 italic py-2">No agents added yet</p>
              )}
            </div>
            {selectedAgentIds.length > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                {selectedAgentIds.length} teammate{selectedAgentIds.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>}

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {SHIFT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Delete Options (edit mode only) */}
          {editShift && (
            <div className="relative pt-2">
              {isRecurring ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDeleteOptions(!showDeleteOptions)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Shift
                    <ChevronDown className={`w-4 h-4 transition-transform ${showDeleteOptions ? 'rotate-180' : ''}`} />
                  </button>
                  {showDeleteOptions && (
                    <div className="mt-2 bg-red-50 rounded-lg border border-red-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={handleDeleteThis}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Delete this shift only
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteFuture}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-700 hover:bg-red-100 transition-colors border-t border-red-200"
                      >
                        Delete this & all future recurrences
                      </button>
                      <button
                        type="button"
                        onClick={handleDeletePast}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-700 hover:bg-red-100 transition-colors border-t border-red-200"
                      >
                        Delete this & all past recurrences
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAllRecurring}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-800 font-semibold hover:bg-red-100 transition-colors border-t border-red-200"
                      >
                        Delete all recurrences
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteThis}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Shift
                </button>
              )}
            </div>
          )}

          {/* Save Scope Options (recurring edit) */}
          {showSaveOptions && isRecurring && (
            <div className="bg-indigo-50 rounded-lg border border-indigo-200 overflow-hidden">
              <p className="px-4 py-2 text-xs font-medium text-indigo-700 border-b border-indigo-200">Apply changes to:</p>
              <button
                type="button"
                onClick={handleSaveThis}
                className="w-full text-left px-4 py-2.5 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                This shift only
              </button>
              <button
                type="button"
                onClick={handleSaveFuture}
                className="w-full text-left px-4 py-2.5 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors border-t border-indigo-200"
              >
                This & all future recurrences
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                className="w-full text-left px-4 py-2.5 text-sm text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors border-t border-indigo-200"
              >
                All recurrences
              </button>
              <button
                type="button"
                onClick={() => setShowSaveOptions(false)}
                className="w-full text-left px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-100 transition-colors border-t border-indigo-200"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Submit */}
          {!showSaveOptions && (
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {editShift ? 'Save Changes' : 'Create Shift'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function AgentShiftView({
  shift,
  onClose,
  isAssignedToMe,
  onJoin,
  onLeave,
}: {
  shift: Shift;
  onClose: () => void;
  isAssignedToMe: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const { state, dispatch, agents, getSwapRequestsForShift, getShiftsForAgent } = useApp();
  const [showSwap, setShowSwap] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState('');
  const [swapTargetShiftId, setSwapTargetShiftId] = useState('');
  const [swapReason, setSwapReason] = useState('');

  const assignedAgentsList = shift.assignedAgentIds
    .map(id => state.users.find(u => u.id === id))
    .filter(Boolean);
  const req = shift.requiredAgents || 1;
  const filledCount = assignedAgentsList.length;
  const full = filledCount >= req;

  const pendingSwaps = getSwapRequestsForShift(shift.id);
  const alreadyRequestedSwap = pendingSwaps.some(r => r.fromAgentId === state.currentUser.id);

  // Other agents who have shifts (potential swap targets)
  const swapCandidates = agents.filter(a => a.id !== state.currentUser.id);

  // Shifts belonging to the selected target agent
  const targetAgentShifts = swapTargetId
    ? getShiftsForAgent(swapTargetId).filter(s => s.date >= new Date().toISOString().split('T')[0])
    : [];

  const handleSwapRequest = () => {
    if (!swapTargetId || !swapTargetShiftId) return;
    dispatch({
      type: 'CREATE_SWAP_REQUEST',
      payload: {
        id: uuid(),
        fromShiftId: shift.id,
        toShiftId: swapTargetShiftId,
        fromAgentId: state.currentUser.id,
        toAgentId: swapTargetId,
        reason: swapReason || undefined,
        status: 'pending',
        timestamp: new Date().toISOString(),
      },
    });
    setShowSwap(false);
    setSwapTargetId('');
    setSwapTargetShiftId('');
    setSwapReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Shift Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Shift info */}
          <div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: shift.color }} />
              <h3 className="text-lg font-semibold text-gray-900">{shift.name}</h3>
            </div>
            <p className="text-sm text-gray-500 mt-1">{shift.date}</p>
            <p className="text-sm text-gray-500">{shift.startTime} – {shift.endTime} ({shift.timezone.split('/').pop()})</p>
          </div>

          {/* Vacancy */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${full ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            {filledCount}/{req} filled
          </div>

          {/* Assigned agents */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Assigned Teammates</label>
            {assignedAgentsList.length > 0 ? (
              <div className="space-y-1.5">
                {assignedAgentsList.map(agent => (
                  <div key={agent!.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: agent!.color }}
                    >
                      {agent!.name[0]}
                    </div>
                    <span className="text-sm text-gray-700">{agent!.name}</span>
                    {agent!.id === state.currentUser.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium ml-auto">You</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No agents assigned yet</p>
            )}
          </div>

          {/* Swap section */}
          {isAssignedToMe && !showSwap && !alreadyRequestedSwap && (
            <button
              type="button"
              onClick={() => setShowSwap(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors border border-orange-200"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Swap Shift with Teammate
            </button>
          )}

          {alreadyRequestedSwap && (
            <div className="px-4 py-2.5 text-sm text-orange-600 bg-orange-50 rounded-lg border border-orange-200 text-center">
              Swap request pending...
            </div>
          )}

          {showSwap && (
            <div className="bg-orange-50 rounded-lg border border-orange-200 p-4 space-y-3">
              <h4 className="text-sm font-medium text-orange-800">Request Shift Swap</h4>
              <p className="text-xs text-orange-600">Pick a teammate and which of their shifts you want in return. They'll get both shifts shown so they know exactly what's being traded.</p>

              {/* You're giving */}
              <div className="bg-white rounded-lg border border-orange-200 p-3">
                <label className="block text-[10px] font-semibold text-orange-400 uppercase mb-1">You give up</label>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: shift.color }} />
                  <span className="text-sm font-medium text-gray-800">{shift.name}</span>
                  <span className="text-xs text-gray-500">{shift.date} · {shift.startTime}–{shift.endTime}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-orange-700 mb-1">Swap with</label>
                <select
                  value={swapTargetId}
                  onChange={e => { setSwapTargetId(e.target.value); setSwapTargetShiftId(''); }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                >
                  <option value="">Select a teammate...</option>
                  {swapCandidates.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </div>

              {swapTargetId && (
                <div>
                  <label className="block text-xs font-medium text-orange-700 mb-1">Their shift you want in return</label>
                  {targetAgentShifts.length > 0 ? (
                    <select
                      value={swapTargetShiftId}
                      onChange={e => setSwapTargetShiftId(e.target.value)}
                      className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                    >
                      <option value="">Select a shift...</option>
                      {targetAgentShifts.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.date} · {s.startTime}–{s.endTime}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-orange-600 italic">This teammate has no upcoming shifts to swap.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-orange-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={swapReason}
                  onChange={e => setSwapReason(e.target.value)}
                  placeholder="e.g. Doctor appointment, family event"
                  className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowSwap(false); setSwapTargetId(''); setSwapTargetShiftId(''); }}
                  className="flex-1 px-3 py-2 text-sm text-orange-700 hover:bg-orange-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSwapRequest}
                  disabled={!swapTargetId || !swapTargetShiftId}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Request
                </button>
              </div>
            </div>
          )}

          {/* Join / Leave */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
            {isAssignedToMe ? (
              <button
                type="button"
                onClick={onLeave}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                Leave Shift
              </button>
            ) : (
              <button
                type="button"
                onClick={onJoin}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Join Shift
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
