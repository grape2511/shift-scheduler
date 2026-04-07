import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { updateProfile } from '../lib/database';
import { Mail } from 'lucide-react';
import type { Role } from '../types';

const SLACK_NOTIFICATION_OPTIONS = [
  { key: 'slackNotifySwaps', label: 'Approved swaps', description: 'When both agents confirm a shift swap' },
  { key: 'slackNotifyTimeOff', label: 'Day-off requests', description: 'When an agent requests time off' },
  { key: 'slackNotifyTimeOffApproval', label: 'Day-off approvals / rejections', description: 'When time off is approved or rejected' },
  { key: 'slackNotifyWeeklyCoverage', label: 'Weekly coverage alert', description: 'Once per day, if any agent has fewer than 5 shifts this week' },
] as const;

type SlackNotifKey = typeof SLACK_NOTIFICATION_OPTIONS[number]['key'];

function getSlackPrefs(user: any): Record<SlackNotifKey, boolean> {
  const prefs = user.slackNotifications || {};
  return {
    slackNotifySwaps: prefs.slackNotifySwaps ?? true,
    slackNotifyTimeOff: prefs.slackNotifyTimeOff ?? true,
    slackNotifyTimeOffApproval: prefs.slackNotifyTimeOffApproval ?? true,
    slackNotifyWeeklyCoverage: prefs.slackNotifyWeeklyCoverage ?? true,
  };
}

export { getSlackPrefs };
export type { SlackNotifKey };

const ROLES: { value: Role; label: string; description: string; color: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Full access to all settings, users, and schedules', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'team-lead', label: 'Team Lead', description: 'Can manage schedules and view team data', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'agent', label: 'Agent', description: 'Can view schedules, clock in/out, and request swaps', color: 'text-gray-700 bg-gray-50 border-gray-200' },
];

export function SettingsView() {
  const { state, dispatch } = useApp();
  const [testing, setTesting] = useState(false);
  const prefs = getSlackPrefs(state.currentUser);

  const updateWebhookUrl = (url: string) => {
    dispatch({ type: 'UPDATE_USER', payload: { id: state.currentUser.id, updates: { slackWebhookUrl: url || undefined } } });
    updateProfile(state.currentUser.id, { slackWebhookUrl: url || undefined });
  };

  const togglePref = (key: SlackNotifKey) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    dispatch({ type: 'UPDATE_USER', payload: { id: state.currentUser.id, updates: { slackNotifications: updated } } });
    updateProfile(state.currentUser.id, { slackNotifications: updated } as any);
  };

  const handleTest = async () => {
    const url = state.currentUser.slackWebhookUrl;
    if (!url) return alert('Enter a webhook URL first');
    setTesting(true);
    try {
      const res = await fetch('/api/slack-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: url, payload: { text: '✅ Shift Scheduler connected! You will receive notifications for shift changes.' } }),
      });
      if (res.ok) alert('Test message sent to Slack!');
      else alert('Failed to send. Check your webhook URL.');
    } catch {
      alert('Failed to send. Check your webhook URL.');
    }
    setTesting(false);
  };

  const handleRoleChange = (userId: string, newRole: Role) => {
    dispatch({ type: 'UPDATE_USER', payload: { id: userId, updates: { role: newRole } } });
    updateProfile(userId, { role: newRole });
  };

  const sortedUsers = [...state.users].sort((a, b) => {
    const roleOrder = { admin: 0, 'team-lead': 1, agent: 2 };
    return (roleOrder[a.role] || 2) - (roleOrder[b.role] || 2);
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500">Configure notifications, integrations, and user roles</p>
      </div>

      {/* Slack Integration */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <svg className="w-5 h-5 text-purple-500" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522v6.312zm-2.522 10.124a2.528 2.528 0 0 1 2.522 2.52A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.527 2.527 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522h-6.313z"/></svg>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Slack Notifications</h3>
            <p className="text-xs text-gray-500">Get notified in Slack when events happen</p>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <label className="block text-xs font-medium text-gray-700 mb-2">Webhook URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={state.currentUser.slackWebhookUrl || ''}
              onChange={e => updateWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shrink-0 disabled:opacity-50"
            >
              {testing ? 'Sending...' : 'Test'}
            </button>
          </div>
          {state.currentUser.slackWebhookUrl && (
            <p className="text-[10px] text-green-600 mt-2">Slack notifications are active</p>
          )}
        </div>

        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-gray-700 mb-3">Notify me when...</label>
          <div className="space-y-3">
            {SLACK_NOTIFICATION_OPTIONS.map(opt => (
              <label key={opt.key} className="flex items-start gap-3 cursor-pointer group">
                <div className="pt-0.5">
                  <div
                    onClick={() => togglePref(opt.key)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${prefs[opt.key] ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefs[opt.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* User Management */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">User Management</h3>
          <p className="text-xs text-gray-500 mt-0.5">{state.users.length} users — manage roles and permissions</p>
        </div>

        {/* Role legend */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex flex-wrap gap-3">
            {ROLES.map(r => (
              <div key={r.value} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${r.color}`}>{r.label}</span>
                <span className="text-[10px] text-gray-500">{r.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Users list */}
        {sortedUsers.map(user => {
          const isCurrentUser = user.id === state.currentUser.id;
          return (
            <div
              key={user.id}
              className={`flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0 ${isCurrentUser ? 'bg-indigo-50/30' : ''} ${user.active === false ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    {isCurrentUser && <span className="text-[10px] text-indigo-500 font-medium">(you)</span>}
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${ROLES.find(r => r.value === user.role)?.color || ''}`}>
                      {ROLES.find(r => r.value === user.role)?.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!isCurrentUser && (
                  <div
                    onClick={() => {
                      const newActive = user.active === false ? true : false;
                      dispatch({ type: 'UPDATE_USER', payload: { id: user.id, updates: { active: newActive } } });
                      updateProfile(user.id, { active: newActive } as any);
                    }}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 ${user.active !== false ? 'bg-green-500' : 'bg-gray-300'}`}
                    title={user.active !== false ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${user.active !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                )}
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
