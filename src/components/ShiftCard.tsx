import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Clock, UserPlus, Trash2, Edit2, AlertTriangle, UserMinus, LogIn, LogOut, MessageSquare, Check, X } from 'lucide-react';
import { convertTime, getUserTimezone, isShiftActiveNow } from '../utils/timezone';
import { useNow } from '../hooks/useNow';
import { v4 as uuid } from 'uuid';
import { updateShift as dbUpdateShift, deleteShift as dbDeleteShift, deleteShifts as dbDeleteShifts } from '../lib/database';
import { getTaskAssignments, TASK_STYLES } from '../utils/tasks';
import { confirmClockOut } from '../utils/clock';
import { useSelfLeave } from '../hooks/useSelfLeave';
import type { Shift } from '../types';

interface ShiftCardProps {
  shift: Shift;
  compact?: boolean;
  onEdit?: (shift: Shift) => void;
}

// Labels used to tag an agent's team; redundant on a shift card, so we hide
// them here and surface only the meaningful per-agent tags (e.g. "Trainee").
const TEAM_LABELS = new Set(['EU Shift', 'USA Shift', 'Mid Shift', 'Devs Team']);
function agentTags(agent: { labels?: string[]; label?: string } | undefined): string[] {
  if (!agent) return [];
  return (agent.labels || (agent.label ? [agent.label] : [])).filter(l => !TEAM_LABELS.has(l));
}

export function ShiftCard({ shift, compact, onEdit }: ShiftCardProps) {
  const { state, dispatch, activeAgents: agents, getAgentById, hasConflict, getClockRecord } = useApp();
  const attemptSelfLeave = useSelfLeave();
  const [showAssign, setShowAssign] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(shift.notes || '');
  const isAdmin = state.currentUser.role === 'admin';
  const isAgent = state.currentUser.role === 'agent';
  const isRecurring = !!shift.recurringGroupId;

  const assignedAgents = [...new Set(shift.assignedAgentIds)]
    .map(id => getAgentById(id))
    .filter(Boolean);

  const taskAssignments = getTaskAssignments(shift.date, shift.assignedAgentIds);

  const handleAssign = (agentId: string) => {
    dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: shift.id, agentId } });
    setShowAssign(false);
  };

  const handleUnassign = (agentId: string) => {
    const isSelf = agentId === state.currentUser.id && !isAdmin;

    // Self-leave runs through the shared guard (headcount + weekly minimum,
    // steering to the Swap feature) and notifies the admin on an allowed leave.
    if (isSelf) {
      attemptSelfLeave(shift);
      return;
    }

    // Admin removing another agent — no weekly guard.
    dispatch({ type: 'UNASSIGN_AGENT', payload: { shiftId: shift.id, agentId } });
  };

  const handleDeleteThis = () => {
    dbDeleteShift(shift.id);
    dispatch({ type: 'DELETE_SHIFT', payload: shift.id });
    setShowDeleteMenu(false);
  };

  const handleDeleteAllRecurring = () => {
    if (shift.recurringGroupId) {
      const ids = state.shifts
        .filter(s => s.recurringGroupId === shift.recurringGroupId)
        .map(s => s.id);
      if (ids.length) dbDeleteShifts(ids);
    } else {
      dbDeleteShift(shift.id);
    }
    dispatch({ type: 'DELETE_SHIFT_ALL_RECURRING', payload: shift.id });
    setShowDeleteMenu(false);
  };

  const handleDeleteFuture = () => {
    if (shift.recurringGroupId) {
      const ids = state.shifts
        .filter(s => s.recurringGroupId === shift.recurringGroupId && s.date >= shift.date)
        .map(s => s.id);
      if (ids.length) dbDeleteShifts(ids);
    }
    dispatch({ type: 'DELETE_SHIFT_FUTURE', payload: { shiftId: shift.id, fromDate: shift.date } });
    setShowDeleteMenu(false);
  };

  const handleDeletePast = () => {
    if (shift.recurringGroupId) {
      const ids = state.shifts
        .filter(s => s.recurringGroupId === shift.recurringGroupId && s.date <= shift.date)
        .map(s => s.id);
      if (ids.length) dbDeleteShifts(ids);
    }
    dispatch({ type: 'DELETE_SHIFT_PAST', payload: { shiftId: shift.id, toDate: shift.date } });
    setShowDeleteMenu(false);
  };

  const handleSelfJoin = () => {
    dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: shift.id, agentId: state.currentUser.id } });
  };

  const handleSaveNote = () => {
    const trimmed = noteText.trim();
    const updated = { ...shift, notes: trimmed || undefined };
    dispatch({ type: 'UPDATE_SHIFT', payload: updated });
    dbUpdateShift(updated);
    setEditingNote(false);
  };

  const handleCancelNote = () => {
    setNoteText(shift.notes || '');
    setEditingNote(false);
  };

  const isAssignedToMe = shift.assignedAgentIds.includes(state.currentUser.id);
  const myClockRecord = isAssignedToMe ? getClockRecord(shift.id, state.currentUser.id) : undefined;

  const handleClockIn = () => {
    dispatch({
      type: 'CLOCK_IN',
      payload: {
        id: uuid(),
        shiftId: shift.id,
        userId: state.currentUser.id,
        clockIn: new Date().toISOString(),
        clockOut: null,
      },
    });
  };

  const handleClockOut = () => {
    if (!confirmClockOut(myClockRecord)) return;
    dispatch({
      type: 'CLOCK_OUT',
      payload: {
        shiftId: shift.id,
        userId: state.currentUser.id,
        clockOut: new Date().toISOString(),
      },
    });
  };

  const userTimezone = getUserTimezone(state.currentUser.timezone, state.currentUser.country);

  const formatClockTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: userTimezone });
  };

  // Convert shift times to user's local timezone for display
  const formatShiftTime = (time: string) => {
    return convertTime(time, shift.timezone, userTimezone);
  };

  const required = shift.requiredAgents || 1;
  const filled = assignedAgents.length;

  const now = useNow();
  const isActiveNow = isShiftActiveNow(shift.date, shift.startTime, shift.endTime, shift.timezone, now);

  if (compact) {
    return (
      <div
        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition-all ${
          isActiveNow
            ? 'ring-4 ring-offset-2 ring-offset-white shadow-2xl animate-pulse-glow scale-[1.04] relative z-10'
            : ''
        }`}
        style={{ backgroundColor: shift.color, ...(isActiveNow ? { '--tw-ring-color': shift.color } as React.CSSProperties : {}) }}
        onClick={() => onEdit?.(shift)}
        title={isActiveNow ? 'Currently active shift' : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="truncate flex items-center gap-1">
            {isActiveNow && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-white rounded-full px-1.5 py-[1px] mr-1 shadow-sm"
                style={{ color: shift.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Live
              </span>
            )}
            {shift.name}{shift.notes && <MessageSquare className="w-2.5 h-2.5 opacity-70" />}
          </span>
          <span className="opacity-80 ml-1">{formatShiftTime(shift.startTime)}</span>
        </div>
        {shift.notes && (
          <div className="mt-0.5 text-[9px] text-white/75 italic truncate">{shift.notes}</div>
        )}
        {/* Agent names */}
        {assignedAgents.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {assignedAgents.map(agent => {
              const task = taskAssignments.get(agent!.id);
              const style = task ? TASK_STYLES[task] : null;
              return (
                <div key={agent!.id} className="flex items-center gap-1 text-[10px] text-white/90">
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-white/40 flex items-center justify-center text-[7px] shrink-0"
                    style={{ backgroundColor: agent!.color }}
                  >
                    {agent!.name[0]}
                  </div>
                  <span className="truncate">{agent!.name.split(' ')[0]}</span>
                  {agentTags(agent).map(l => (
                    <span
                      key={l}
                      className="shrink-0 px-1 py-px rounded-full bg-amber-400 text-white text-[7px] font-bold uppercase tracking-wide leading-none"
                      title={l}
                    >
                      {l}
                    </span>
                  ))}
                  {style && (
                    <span
                      className={`relative group/task ml-auto p-0.5 rounded ${style.bg} shrink-0 inline-flex items-center justify-center`}
                      aria-label={style.tooltip}
                    >
                      <img
                        src={style.iconUrl}
                        alt={task!}
                        className="w-3 h-3 object-contain"
                        draggable={false}
                      />
                      <span
                        className="pointer-events-none invisible opacity-0 group-hover/task:visible group-hover/task:opacity-100 transition-opacity absolute z-50 bottom-full right-0 mb-1 px-2 py-1 text-[10px] font-medium text-white bg-gray-900 rounded shadow-lg whitespace-nowrap"
                        role="tooltip"
                      >
                        {style.tooltip}
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Vacancy indicator + Join */}
        <div className="mt-1 flex items-center justify-between">
          <span className={`text-[10px] font-semibold ${filled > required ? 'text-green-200' : filled >= required ? 'text-white/90' : 'text-yellow-200'}`}>
            {filled}/{required} filled
          </span>
          {!isAdmin && (isAssignedToMe ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleUnassign(state.currentUser.id); }}
              className="text-[10px] font-semibold bg-white/25 hover:bg-red-400/50 rounded px-1.5 py-0.5 transition-colors"
              title="Leave this shift"
            >
              Leave
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleSelfJoin(); }}
              className="text-[10px] font-semibold bg-white/25 hover:bg-white/40 rounded px-1.5 py-0.5 transition-colors"
              title="Join this shift"
            >
              + Join
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all ${
        isActiveNow
          ? 'ring-4 ring-offset-2 ring-offset-white shadow-2xl animate-pulse-glow scale-[1.02] relative z-10'
          : ''
      }`}
      style={isActiveNow ? ({ '--tw-ring-color': shift.color } as React.CSSProperties) : undefined}
    >
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: shift.color }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              {shift.name}
              {isActiveNow && (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-white rounded-full px-2.5 py-1 shadow-md"
                  style={{ backgroundColor: shift.color }}
                  title="Currently active shift"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                  Live now
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              {formatShiftTime(shift.startTime)} – {formatShiftTime(shift.endTime)}
              {userTimezone && userTimezone !== shift.timezone && (
                <span className="text-xs text-indigo-400 ml-1">(your time)</span>
              )}
              <span className="text-xs text-gray-400 ml-1">({shift.timezone.split('/').pop()})</span>
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={() => onEdit(shift)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => isRecurring ? setShowDeleteMenu(!showDeleteMenu) : handleDeleteThis()}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {showDeleteMenu && isRecurring && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDeleteMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 w-56">
                      <button
                        onClick={handleDeleteThis}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Delete this shift only
                      </button>
                      <button
                        onClick={handleDeleteFuture}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Delete this & all future
                      </button>
                      <button
                        onClick={handleDeletePast}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Delete this & all past
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={handleDeleteAllRecurring}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                      >
                        Delete all recurrences
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Assigned Agents */}
        <div className="mt-3">
          {assignedAgents.length > 0 ? (
            <div className="space-y-1.5">
              {assignedAgents.map(agent => {
                const conflict = hasConflict(agent!.id, shift.date);
                const task = taskAssignments.get(agent!.id);
                const style = task ? TASK_STYLES[task] : null;
                return (
                  <div
                    key={agent!.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${
                      conflict ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
                        style={{ backgroundColor: agent!.color }}
                      >
                        {agent!.name[0]}
                      </div>
                      <span className="text-sm text-gray-700">{agent!.name}</span>
                      {agentTags(agent).map(l => (
                        <span
                          key={l}
                          className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-semibold"
                          title={`${agent!.name.split(' ')[0]} is a trainee — keep them supported on shift`}
                        >
                          {l}
                        </span>
                      ))}
                      {style && (
                        <span
                          className={`relative group/task inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${style.bg} text-gray-700 cursor-help`}
                          aria-label={style.tooltip}
                        >
                          <img
                            src={style.iconUrl}
                            alt={task!}
                            className="w-3.5 h-3.5 object-contain"
                            draggable={false}
                          />
                          {task}
                          <span
                            className="pointer-events-none invisible opacity-0 group-hover/task:visible group-hover/task:opacity-100 transition-opacity absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[11px] font-medium text-white bg-gray-900 rounded shadow-lg whitespace-nowrap"
                            role="tooltip"
                          >
                            {style.tooltip}
                          </span>
                        </span>
                      )}
                      {conflict && (
                        <span title="Has time off this day"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></span>
                      )}
                    </div>
                    {(isAdmin || (isAgent && agent!.id === state.currentUser.id)) && (
                      <button
                        onClick={() => handleUnassign(agent!.id)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                        title={isAgent ? 'Leave shift' : 'Remove agent'}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No agents assigned</p>
          )}
        </div>

        {/* Notes */}
        {(shift.notes || isAdmin || isAssignedToMe) && (
          <div className="mt-3">
            {editingNote ? (
              <div className="space-y-1.5">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="e.g. Momen 9-12, Olivia 12-4"
                  className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={handleCancelNote}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleSaveNote}
                    className="p-1 text-indigo-500 hover:text-indigo-700 rounded transition-colors"
                    title="Save note"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-1.5">
                {shift.notes ? (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 italic whitespace-pre-wrap">{shift.notes}</p>
                  </div>
                ) : null}
                {(isAdmin || isAssignedToMe) && (
                  <button
                    onClick={() => { setNoteText(shift.notes || ''); setEditingNote(true); }}
                    className="shrink-0 p-1 text-gray-300 hover:text-gray-500 rounded transition-colors"
                    title={shift.notes ? 'Edit note' : 'Add note'}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          {isAdmin && (
            <div className="relative flex-1">
              <button
                onClick={() => setShowAssign(!showAssign)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Manage Agents
              </button>

              {showAssign && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAssign(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 max-h-48 overflow-y-auto">
                    {agents
                      .filter(agent => {
                        // Hide admins from shift assignment
                        if (agent.role === 'admin') return false;
                        return true;
                      })
                      .map(agent => {
                      const isAssigned = shift.assignedAgentIds.includes(agent.id);
                      const conflict = hasConflict(agent.id, shift.date);
                      return (
                        <button
                          key={agent.id}
                          onClick={() => isAssigned ? handleUnassign(agent.id) : handleAssign(agent.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            isAssigned ? 'bg-indigo-50 hover:bg-red-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium ${
                              isAssigned ? 'ring-2 ring-indigo-400 ring-offset-1' : ''
                            }`}
                            style={{ backgroundColor: agent.color }}
                          >
                            {agent.name[0]}
                          </div>
                          <span className={`flex-1 text-left ${isAssigned ? 'text-indigo-700 font-medium' : 'text-gray-700'}`}>
                            {agent.name}
                          </span>
                          {conflict && (
                            <span title="Unavailable"><AlertTriangle className="w-3 h-3 text-amber-500" /></span>
                          )}
                          {isAssigned && (
                            <span className="text-[10px] text-indigo-500 font-medium">Assigned</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {!isAdmin && isAssignedToMe && (
            <button
              onClick={() => handleUnassign(state.currentUser.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <UserMinus className="w-3.5 h-3.5" />
              Leave Shift
            </button>
          )}
          {!isAdmin && !isAssignedToMe && (
            <button
              onClick={handleSelfJoin}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Join Shift
            </button>
          )}
        </div>

        {/* Clock In/Out for assigned agent */}
        {isAssignedToMe && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            {!myClockRecord ? (
              <button
                onClick={handleClockIn}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Clock In
              </button>
            ) : !myClockRecord.clockOut ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Clocked in at {formatClockTime(myClockRecord.clockIn!)}
                </div>
                <button
                  onClick={handleClockOut}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Clock Out
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Clocked: {formatClockTime(myClockRecord.clockIn!)} – {formatClockTime(myClockRecord.clockOut)}</span>
                <span className="font-medium text-gray-700">
                  {(() => {
                    const diff = new Date(myClockRecord.clockOut).getTime() - new Date(myClockRecord.clockIn!).getTime();
                    const hrs = Math.floor(diff / 3600000);
                    const mins = Math.round((diff % 3600000) / 60000);
                    return `${hrs}h ${mins}m`;
                  })()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
