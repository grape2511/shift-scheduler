import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Clock, UserPlus, Trash2, Edit2, AlertTriangle, UserMinus } from 'lucide-react';
import type { Shift } from '../types';

interface ShiftCardProps {
  shift: Shift;
  compact?: boolean;
  onEdit?: (shift: Shift) => void;
}

export function ShiftCard({ shift, compact, onEdit }: ShiftCardProps) {
  const { state, dispatch, agents, getAgentById, hasConflict } = useApp();
  const [showAssign, setShowAssign] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const isAdmin = state.currentUser.role === 'admin';
  const isAgent = state.currentUser.role === 'agent';
  const isRecurring = !!shift.recurringGroupId;

  const assignedAgents = shift.assignedAgentIds
    .map(id => getAgentById(id))
    .filter(Boolean);

  const handleAssign = (agentId: string) => {
    dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: shift.id, agentId } });
    setShowAssign(false);
  };

  const handleUnassign = (agentId: string) => {
    dispatch({ type: 'UNASSIGN_AGENT', payload: { shiftId: shift.id, agentId } });
  };

  const handleDeleteThis = () => {
    dispatch({ type: 'DELETE_SHIFT', payload: shift.id });
    setShowDeleteMenu(false);
  };

  const handleDeleteAllRecurring = () => {
    dispatch({ type: 'DELETE_SHIFT_ALL_RECURRING', payload: shift.id });
    setShowDeleteMenu(false);
  };

  const handleDeleteFuture = () => {
    dispatch({ type: 'DELETE_SHIFT_FUTURE', payload: { shiftId: shift.id, fromDate: shift.date } });
    setShowDeleteMenu(false);
  };

  const handleDeletePast = () => {
    dispatch({ type: 'DELETE_SHIFT_PAST', payload: { shiftId: shift.id, toDate: shift.date } });
    setShowDeleteMenu(false);
  };

  const handleSelfJoin = () => {
    dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: shift.id, agentId: state.currentUser.id } });
  };

  const isAssignedToMe = shift.assignedAgentIds.includes(state.currentUser.id);

  const required = shift.requiredAgents || 1;
  const filled = assignedAgents.length;
  const isFull = filled >= required;

  if (compact) {
    return (
      <div
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition-opacity"
        style={{ backgroundColor: shift.color }}
        onClick={() => onEdit?.(shift)}
      >
        <div className="flex items-center justify-between">
          <span className="truncate">{shift.name}</span>
          <span className="opacity-80 ml-1">{shift.startTime}</span>
        </div>
        {/* Agent names */}
        {assignedAgents.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {assignedAgents.slice(0, 3).map(agent => (
              <div key={agent!.id} className="flex items-center gap-1 text-[10px] text-white/90">
                <div
                  className="w-3.5 h-3.5 rounded-full border border-white/40 flex items-center justify-center text-[7px] shrink-0"
                  style={{ backgroundColor: agent!.color }}
                >
                  {agent!.name[0]}
                </div>
                <span className="truncate">{agent!.name.split(' ')[0]}</span>
              </div>
            ))}
            {assignedAgents.length > 3 && (
              <span className="text-[10px] text-white/70">+{assignedAgents.length - 3} more</span>
            )}
          </div>
        )}
        {/* Vacancy indicator + Join */}
        <div className="mt-1 flex items-center justify-between">
          <span className={`text-[10px] font-semibold ${isFull ? 'text-white/90' : 'text-yellow-200'}`}>
            {filled}/{required} filled
          </span>
          {!isAssignedToMe && !isFull && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSelfJoin(); }}
              className="text-[10px] font-semibold bg-white/25 hover:bg-white/40 rounded px-1.5 py-0.5 transition-colors"
              title="Join this shift"
            >
              + Join
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: shift.color }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{shift.name}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              {shift.startTime} – {shift.endTime}
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
                    {agents.map(agent => {
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

          {!isAssignedToMe && !isFull && (
            <button
              onClick={handleSelfJoin}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Join Shift
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
