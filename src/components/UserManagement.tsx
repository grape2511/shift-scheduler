import { useApp } from '../store/AppContext';
import { Mail } from 'lucide-react';
import type { Role } from '../types';

const ROLES: { value: Role; label: string; description: string; color: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Full access to all settings, users, and schedules', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'team-lead', label: 'Team Lead', description: 'Can manage schedules and view team data', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'agent', label: 'Agent', description: 'Can view schedules, clock in/out, and request swaps', color: 'text-gray-700 bg-gray-50 border-gray-200' },
];

function getRoleBadge(role: Role) {
  const r = ROLES.find(r => r.value === role) || ROLES[2];
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${r.color}`}>
      {r.label}
    </span>
  );
}

export function UserManagement() {
  const { state, dispatch } = useApp();

  const handleRoleChange = (userId: string, newRole: Role) => {
    dispatch({
      type: 'UPDATE_USER',
      payload: { id: userId, updates: { role: newRole } },
    });
  };

  const sortedUsers = [...state.users].sort((a, b) => {
    const roleOrder = { admin: 0, 'team-lead': 1, agent: 2 };
    return (roleOrder[a.role] || 2) - (roleOrder[b.role] || 2);
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500">{state.users.length} users</p>
        </div>
      </div>

      {/* Role legend */}
      <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Roles</h3>
        <div className="space-y-2">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-start gap-3">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${r.color} shrink-0 mt-0.5`}>
                {r.label}
              </span>
              <span className="text-xs text-gray-500">{r.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Users list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wider">
          <span>User</span>
          <span>Current Role</span>
          <span>Change Role</span>
        </div>
        {sortedUsers.map(user => {
          const isCurrentUser = user.id === state.currentUser.id;
          return (
            <div
              key={user.id}
              className={`grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3 border-b border-gray-50 last:border-0 ${
                isCurrentUser ? 'bg-indigo-50/30' : ''
              }`}
            >
              {/* User info */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    {isCurrentUser && (
                      <span className="text-[10px] text-indigo-500 font-medium">(you)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
              </div>

              {/* Current role badge */}
              <div>
                {getRoleBadge(user.role)}
              </div>

              {/* Role selector */}
              <div>
                {isCurrentUser ? (
                  <span className="text-[10px] text-gray-400">Can't change own role</span>
                ) : (
                  <select
                    value={user.role}
                    onChange={e => handleRoleChange(user.id, e.target.value as Role)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
