import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Plus, Trash2, Mail, MapPin, Clock, Globe, Calendar, Check, ChevronDown, X, LayoutGrid, List, Search } from 'lucide-react';
import { COUNTRIES, getCountryName } from '../utils/holidays';
import { updateProfile } from '../lib/database';
import { v4 as uuid } from 'uuid';
import { format, parseISO } from 'date-fns';

const TARGET_HOURS = 208;

export function AgentsView() {
  const { state, agents, addAgent, dispatch, getMonthlyHours, getPtoBalance } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [showHolidayDropdown, setShowHolidayDropdown] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('NL');
  const [addingTimeOffFor, setAddingTimeOffFor] = useState<string | null>(null);
  const [timeOffDate, setTimeOffDate] = useState('');
  const [timeOffReason, setTimeOffReason] = useState('');
  const [expandedPto, setExpandedPto] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddTimeOffForAgent = (agentId: string) => {
    if (!timeOffDate) return;
    dispatch({
      type: 'ADD_TIME_OFF',
      payload: { id: uuid(), userId: agentId, date: timeOffDate, reason: timeOffReason || undefined },
    });
    setTimeOffDate('');
    setTimeOffReason('');
    setAddingTimeOffFor(null);
  };

  const getAgentTimeOffs = (agentId: string) =>
    state.timeOffs.filter(t => t.userId === agentId).sort((a, b) => b.date.localeCompare(a.date));

  const toggleHolidayCountry = (code: string) => {
    const current = state.currentUser.enabledHolidayCountries || [];
    const updated = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code];
    dispatch({
      type: 'UPDATE_USER',
      payload: { id: state.currentUser.id, updates: { enabledHolidayCountries: updated } },
    });
    updateProfile(state.currentUser.id, { enabledHolidayCountries: updated });
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
    const country = newCountry || undefined;
    dispatch({ type: 'UPDATE_USER', payload: { id: agentId, updates: { country } } });
    updateProfile(agentId, { country: newCountry || null } as any);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
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

      {/* Search and View Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-900">Calendar Public Holidays</h3>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowHolidayDropdown(!showHolidayDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {(state.currentUser.enabledHolidayCountries || []).length} selected
              <ChevronDown className={`w-3 h-3 transition-transform ${showHolidayDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showHolidayDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowHolidayDropdown(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 max-h-64 overflow-y-auto">
                  {COUNTRIES.map(c => {
                    const isEnabled = (state.currentUser.enabledHolidayCountries || []).includes(c.code);
                    return (
                      <button
                        key={c.code}
                        onClick={() => toggleHolidayCountry(c.code)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                          isEnabled ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isEnabled ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                        }`}>
                          {isEnabled && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        {(state.currentUser.enabledHolidayCountries || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(state.currentUser.enabledHolidayCountries || []).map(code => (
              <span key={code} className="px-2 py-1 text-[10px] font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg">
                {COUNTRIES.find(c => c.code === code)?.name || code}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Slack Integration */}
      <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522v6.312zm-2.522 10.124a2.528 2.528 0 0 1 2.522 2.52A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.527 2.527 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522h-6.313z"/></svg>
          <h3 className="text-sm font-semibold text-gray-900">Slack Notifications</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Get notified in Slack when shifts are created, updated, or cancelled.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={state.currentUser.slackWebhookUrl || ''}
            onChange={e => {
              const url = e.target.value;
              dispatch({ type: 'UPDATE_USER', payload: { id: state.currentUser.id, updates: { slackWebhookUrl: url || undefined } } });
              updateProfile(state.currentUser.id, { slackWebhookUrl: url || undefined });
            }}
            placeholder="https://hooks.slack.com/services/..."
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={async () => {
              const url = state.currentUser.slackWebhookUrl;
              if (!url) return alert('Enter a webhook URL first');
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
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
          >
            Test
          </button>
        </div>
        {state.currentUser.slackWebhookUrl && (
          <p className="text-[10px] text-green-600 mt-2">Slack notifications are active</p>
        )}
      </div>

      {/* Agents */}
      {(() => {
        const filteredAgents = agents.filter(a =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.email.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (viewMode === 'list') {
          return (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wider">
                <span>Agent</span>
                <span>Country</span>
                <span>Hours</span>
                <span>PTO</span>
                <span>Sick</span>
                <span></span>
              </div>
              {filteredAgents.map(agent => {
                const now = new Date();
                const hours = getMonthlyHours(agent.id, now.getFullYear(), now.getMonth());
                const { remaining, total, used, sickRemaining, sickTotal } = getPtoBalance(agent.id);
                const isOvertime = hours > TARGET_HOURS;
                const isOverPto = used > total;
                return (
                  <div key={agent.id} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0" style={{ backgroundColor: agent.color }}>
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Mail className="w-3 h-3" />
                          <span className="truncate">{agent.email}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 w-24 text-center">{agent.country ? getCountryName(agent.country) : '—'}</span>
                    <span className={`text-sm font-bold w-16 text-right ${isOvertime ? 'text-red-600' : 'text-gray-700'}`}>{hours}/{TARGET_HOURS}h</span>
                    <span className={`text-sm font-bold w-16 text-right ${isOverPto ? 'text-red-600' : remaining <= 3 ? 'text-amber-600' : 'text-gray-700'}`}>{remaining}/{total}</span>
                    <span className={`text-sm font-bold w-12 text-right ${sickRemaining <= 1 ? 'text-red-600' : 'text-gray-500'}`}>{sickRemaining}/{sickTotal}</span>
                    <button
                      onClick={() => dispatch({ type: 'REMOVE_USER', payload: agent.id })}
                      className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {filteredAgents.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">No agents match your search</div>
              )}
            </div>
          );
        }

        return (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredAgents.map(agent => (
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
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 truncate">{agent.name}</h3>
                  {agent.label && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full shrink-0">
                      {agent.label}
                    </span>
                  )}
                </div>
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
            {/* Label */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={agent.label || ''}
                onChange={e => {
                  const val = e.target.value;
                  dispatch({ type: 'UPDATE_USER', payload: { id: agent.id, updates: { label: val || undefined } } });
                  updateProfile(agent.id, { label: val || undefined });
                }}
                placeholder="Add label..."
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-300"
              />
            </div>
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
            {/* PTO Balance */}
            <div className="mt-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setExpandedPto(expandedPto === agent.id ? null : agent.id)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Days off</span>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const { remaining, total, used, sickRemaining, sickTotal } = getPtoBalance(agent.id);
                    const isOver = used > total;
                    const isSickOver = sickRemaining <= 1;
                    return (
                      <>
                        <span className={`text-xs font-bold ${isOver ? 'text-red-600' : remaining <= 3 ? 'text-amber-600' : 'text-gray-700'}`}>
                          PTO {remaining}/{total}
                        </span>
                        <span className={`text-xs font-bold ${isSickOver ? 'text-red-600' : 'text-gray-500'}`}>
                          Sick {sickRemaining}/{sickTotal}
                        </span>
                      </>
                    );
                  })()}
                  <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${expandedPto === agent.id ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {(() => {
                const { used, total, sickUsed, sickTotal } = getPtoBalance(agent.id);
                const ptoPct = Math.min((used / total) * 100, 100);
                const sickPct = Math.min((sickUsed / sickTotal) * 100, 100);
                return (
                  <div className="mt-1.5 flex gap-1">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${used > total ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${ptoPct}%` }} />
                    </div>
                    <div className="w-8 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${sickUsed > sickTotal ? 'bg-red-500' : 'bg-red-400'}`} style={{ width: `${sickPct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {expandedPto === agent.id && (
                <div className="mt-3 space-y-3">
                  {/* Allowance setting */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400">PTO:</span>
                    <input
                      type="number"
                      min={0}
                      value={agent.ptoAllowance ?? 21}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        dispatch({ type: 'UPDATE_USER', payload: { id: agent.id, updates: { ptoAllowance: val } } });
                        updateProfile(agent.id, { ptoAllowance: val });
                      }}
                      className="w-12 px-1 py-0.5 text-xs text-center border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-gray-400">Sick:</span>
                    <input
                      type="number"
                      min={0}
                      value={agent.sickDaysAllowance ?? 7}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        dispatch({ type: 'UPDATE_USER', payload: { id: agent.id, updates: { sickDaysAllowance: val } } });
                        updateProfile(agent.id, { sickDaysAllowance: val });
                      }}
                      className="w-12 px-1 py-0.5 text-xs text-center border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-gray-400">days/year</span>
                  </div>

                  {/* Add day off */}
                  {addingTimeOffFor === agent.id ? (
                    <div className="bg-amber-50 rounded-lg border border-amber-200 p-2.5 space-y-2">
                      <input
                        type="date"
                        value={timeOffDate}
                        onChange={e => setTimeOffDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <input
                        type="text"
                        value={timeOffReason}
                        onChange={e => setTimeOffReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setAddingTimeOffFor(null); setTimeOffDate(''); setTimeOffReason(''); }}
                          className="flex-1 px-2 py-1 text-xs text-gray-600 hover:bg-amber-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddTimeOffForAgent(agent.id)}
                          disabled={!timeOffDate}
                          className="flex-1 px-2 py-1 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTimeOffFor(agent.id)}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add Day Off
                    </button>
                  )}

                  {/* Existing time off entries */}
                  {(() => {
                    const timeOffs = getAgentTimeOffs(agent.id);
                    if (timeOffs.length === 0) return null;
                    return (
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-400 font-medium">Time off entries:</span>
                        {timeOffs.map(to => (
                          <div key={to.id} className="flex items-center justify-between px-2 py-1 bg-amber-50 rounded-lg text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-amber-800">{format(parseISO(to.date), 'MMM d, yyyy')}</span>
                              {to.reason && <span className="text-amber-600">– {to.reason}</span>}
                            </div>
                            <button
                              onClick={() => dispatch({ type: 'REMOVE_TIME_OFF', payload: to.id })}
                              className="p-0.5 text-amber-400 hover:text-red-500 rounded transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        ))}
        {filteredAgents.length === 0 && (
          <div className="col-span-full px-4 py-8 text-center text-sm text-gray-400">No agents match your search</div>
        )}
      </div>);
      })()}
    </div>
  );
}
