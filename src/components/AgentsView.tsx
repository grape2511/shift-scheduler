import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Plus, Trash2, Mail, MapPin, Clock, Globe } from 'lucide-react';
import { COUNTRIES, getCountryName } from '../utils/holidays';

const TARGET_HOURS = 40;

export function AgentsView() {
  const { state, agents, addAgent, dispatch, getMonthlyHours, getEnabledHolidayCountries } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('NL');

  const enabledCountries = getEnabledHolidayCountries();

  const toggleHolidayCountry = (code: string) => {
    const current = state.currentUser.enabledHolidayCountries || [];
    const updated = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code];
    dispatch({
      type: 'UPDATE_USER',
      payload: { id: state.currentUser.id, updates: { enabledHolidayCountries: updated } },
    });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addAgent(name.trim(), email.trim(), country);
    setName('');
    setEmail('');
    setCountry('NL');
    setShowAdd(false);
  };

  const handleRemove = (id: string) => {
    dispatch({ type: 'REMOVE_USER', payload: id });
  };

  const handleCountryChange = (agentId: string, newCountry: string) => {
    dispatch({ type: 'UPDATE_USER', payload: { id: agentId, updates: { country: newCountry } } });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Agents</h2>
          <p className="text-sm text-gray-500">{agents.length} team members</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Agent
        </button>
      </div>

      {/* Add Agent Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {/* Public Holidays Management */}
      <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-gray-900">Calendar Public Holidays</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Select which countries' public holidays to show on the shared calendar.
        </p>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map(c => {
            const isEnabled = (state.currentUser.enabledHolidayCountries || []).includes(c.code);
            return (
              <button
                key={c.code}
                onClick={() => toggleHolidayCountry(c.code)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  isEnabled
                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-purple-200 hover:text-purple-600'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map(agent => (
          <div
            key={agent.id}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0"
                style={{ backgroundColor: agent.color }}
              >
                {agent.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate">{agent.name}</h3>
                {agent.email && (
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{agent.email}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemove(agent.id)}
                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <select
                value={agent.country || ''}
                onChange={e => handleCountryChange(agent.id, e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No country set</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
            {agent.country && (
              <p className="text-[10px] text-gray-400 mt-1 ml-6">
                Public holidays from {getCountryName(agent.country)} calendar
              </p>
            )}
            {/* Monthly Hours */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>This month</span>
                </div>
                {(() => {
                  const now = new Date();
                  const hours = getMonthlyHours(agent.id, now.getFullYear(), now.getMonth());
                  const isOvertime = hours > TARGET_HOURS;
                  return (
                    <span className={`text-sm font-bold ${isOvertime ? 'text-red-600' : 'text-gray-700'}`}>
                      {hours}/{TARGET_HOURS}h
                    </span>
                  );
                })()}
              </div>
              {(() => {
                const now = new Date();
                const hours = getMonthlyHours(agent.id, now.getFullYear(), now.getMonth());
                const pct = Math.min((hours / TARGET_HOURS) * 100, 100);
                const isOvertime = hours > TARGET_HOURS;
                return (
                  <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOvertime ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
