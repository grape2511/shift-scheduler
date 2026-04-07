import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { updateProfile } from '../lib/database';

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

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500">Configure notifications and integrations</p>
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
    </div>
  );
}
