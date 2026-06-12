import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Plus, Mail, MapPin, Clock, Globe, Calendar, Check, ChevronDown, X, LayoutGrid, List, Search } from 'lucide-react';
import { COUNTRIES, getCountryName } from '../utils/holidays';
import { TIME_OFF_CATEGORIES, type User } from '../types';
import { DeactivateAgentModal } from './DeactivateAgentModal';
import { updateProfile } from '../lib/database';
import * as db from '../lib/database';
import { v4 as uuid } from 'uuid';
import { format, parseISO, addDays } from 'date-fns';

const TARGET_HOURS = 208;

export function AgentsView() {
  const { state, agents, addAgent, dispatch, getMonthlyHours, getPtoBalance, setAgentActive } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [showHolidayDropdown, setShowHolidayDropdown] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('NL');
  const [addingTimeOffFor, setAddingTimeOffFor] = useState<string | null>(null);
  const [timeOffDate, setTimeOffDate] = useState('');
  const [timeOffEndDate, setTimeOffEndDate] = useState('');
  const [timeOffMode, setTimeOffMode] = useState<'single' | 'period'>('single');
  const [timeOffReason, setTimeOffReason] = useState('');
  const [timeOffCategory, setTimeOffCategory] = useState<import('../types').TimeOffCategory>('vacation');
  const [timeOffHalfDay, setTimeOffHalfDay] = useState(false);
  const [expandedPto, setExpandedPto] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [labelDropdownFor, setLabelDropdownFor] = useState<string | null>(null);
  const [newLabelInput, setNewLabelInput] = useState('');

  // Collect all unique labels across all agents
  const allLabels = Array.from(new Set(
    agents.flatMap(a => a.labels || []).concat(agents.map(a => a.label).filter(Boolean) as string[])
  )).sort();

  const toggleLabel = (agentId: string, label: string) => {
    const agent = agents.find(a => a.id === agentId);
    const current = agent?.labels || [];
    const updated = current.includes(label) ? current.filter(l => l !== label) : [...current, label];
    dispatch({ type: 'UPDATE_USER', payload: { id: agentId, updates: { labels: updated } } });
    updateProfile(agentId, { labels: updated });
  };

  const addNewLabel = (agentId: string) => {
    if (!newLabelInput.trim()) return;
    const agent = agents.find(a => a.id === agentId);
    const current = agent?.labels || [];
    if (!current.includes(newLabelInput.trim())) {
      const updated = [...current, newLabelInput.trim()];
      dispatch({ type: 'UPDATE_USER', payload: { id: agentId, updates: { labels: updated } } });
      updateProfile(agentId, { labels: updated });
    }
    setNewLabelInput('');
  };

  const getDatesInRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    let current = parseISO(start);
    const endDate = parseISO(end);
    while (current <= endDate) {
      dates.push(format(current, 'yyyy-MM-dd'));
      current = addDays(current, 1);
    }
    return dates;
  };

  const handleAddTimeOffForAgent = (agentId: string) => {
    if (!timeOffDate) return;
    if (timeOffMode === 'period' && !timeOffEndDate) return;

    const allDates = timeOffMode === 'period' ? getDatesInRange(timeOffDate, timeOffEndDate) : [timeOffDate];
    // PTO is counted in business days — skip weekends
    const dates = timeOffMode === 'period' ? allDates.filter(d => {
      const day = new Date(d + 'T12:00:00').getDay();
      return day !== 0 && day !== 6;
    }) : allDates;

    for (const date of dates) {
      const record = {
        id: uuid(),
        userId: agentId,
        date,
        reason: timeOffReason || undefined,
        status: 'approved' as const,
        category: timeOffCategory,
        halfDay: timeOffHalfDay,
      };
      dispatch({ type: 'ADD_TIME_OFF', payload: record });
      db.insertTimeOff(record);
    }
    setTimeOffDate('');
    setTimeOffEndDate('');
    setTimeOffMode('single');
    setTimeOffReason('');
    setTimeOffCategory('vacation');
    setTimeOffHalfDay(false);
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

      {/* Agents */}
      {(() => {
        const q = searchQuery.toLowerCase();
        const filteredAgents = agents.filter(a =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          (a.labels || []).some(l => l.toLowerCase().includes(q))
        );

        if (viewMode === 'list') {
          return (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wider">
                <span>Agent</span>
                <span className="hidden sm:block">Country</span>
                <span>Hours</span>
                <span className="hidden sm:block">PTO</span>
                <span className="hidden sm:block">Sick</span>
                <span></span>
              </div>
              {filteredAgents.map(agent => {
                const now = new Date();
                const hours = getMonthlyHours(agent.id, now.getFullYear(), now.getMonth());
                const { remaining, total, used, sickRemaining, sickTotal } = getPtoBalance(agent.id);
                const isOvertime = hours > TARGET_HOURS;
                const isOverPto = used > total;
                return (
                  <div key={agent.id} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
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
                    <span className="hidden sm:block text-xs text-gray-500 w-24 text-center">{agent.country ? getCountryName(agent.country) : '—'}</span>
                    <span className={`text-sm font-bold w-16 text-right ${isOvertime ? 'text-red-600' : 'text-gray-700'}`}>{hours}/{TARGET_HOURS}h</span>
                    <span className={`hidden sm:block text-sm font-bold w-16 text-right ${isOverPto ? 'text-red-600' : remaining <= 3 ? 'text-amber-600' : 'text-gray-700'}`}>{remaining}/{total}</span>
                    <span className={`hidden sm:block text-sm font-bold w-12 text-right ${sickRemaining <= 1 ? 'text-red-600' : 'text-gray-500'}`}>{sickRemaining}/{sickTotal}</span>
                    <div
                      onClick={() => {
                        const newActive = agent.active === false ? true : false;
                        if (!newActive) {
                          setDeactivateTarget(agent);
                        } else {
                          setAgentActive(agent.id, true);
                        }
                      }}
                      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 ${agent.active !== false ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={agent.active !== false ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${agent.active !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
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
                <div className="flex items-center gap-1 flex-wrap">
                  <h3 className="font-medium text-gray-900 truncate">{agent.name}</h3>
                  {(agent.labels || (agent.label ? [agent.label] : [])).map(l => (
                    <span key={l} className="px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full shrink-0">
                      {l}
                    </span>
                  ))}
                </div>
                {agent.email && (
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{agent.email}</span>
                  </div>
                )}
              </div>
              <div
                onClick={() => {
                  const newActive = agent.active === false ? true : false;
                  if (!newActive) {
                    setDeactivateTarget(agent);
                  } else {
                    setAgentActive(agent.id, true);
                  }
                }}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 ${agent.active !== false ? 'bg-green-500' : 'bg-gray-300'}`}
                title={agent.active !== false ? 'Active — click to deactivate' : 'Inactive — click to activate'}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${agent.active !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
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
            {/* Labels */}
            <div className="mt-2 relative">
              <div className="flex items-center gap-1 flex-wrap">
                {(agent.labels || (agent.label ? [agent.label] : [])).map(l => (
                  <span key={l} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full">
                    {l}
                    <button onClick={() => toggleLabel(agent.id, l)} className="text-indigo-400 hover:text-red-500">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setLabelDropdownFor(labelDropdownFor === agent.id ? null : agent.id)}
                  className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 border border-dashed border-gray-300 rounded-full hover:border-indigo-300 hover:text-indigo-500 transition-colors"
                >
                  + Label
                </button>
              </div>
              {labelDropdownFor === agent.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setLabelDropdownFor(null)} />
                  <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 max-h-48 overflow-y-auto">
                    {allLabels.map(l => {
                      const hasIt = (agent.labels || (agent.label ? [agent.label] : [])).includes(l);
                      return (
                        <button
                          key={l}
                          onClick={() => toggleLabel(agent.id, l)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${hasIt ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${hasIt ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                            {hasIt && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          {l}
                        </button>
                      );
                    })}
                    <div className="border-t border-gray-100 px-2 py-1.5 flex gap-1">
                      <input
                        type="text"
                        value={newLabelInput}
                        onChange={e => setNewLabelInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewLabel(agent.id); } }}
                        placeholder="New label..."
                        className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={() => addNewLabel(agent.id)}
                        className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              )}
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
                  <PtoEditor
                    agentId={agent.id}
                    ptoAllowance={agent.ptoAllowance ?? 21}
                    sickDaysAllowance={agent.sickDaysAllowance ?? 7}
                    holidaysDeductPto={agent.holidaysDeductPto ?? true}
                    dispatch={dispatch}
                  />

                  {/* Add day off */}
                  <button
                    onClick={() => setAddingTimeOffFor(agent.id)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Day Off
                  </button>

                  {/* Existing time off entries */}
                  {(() => {
                    const timeOffs = getAgentTimeOffs(agent.id);
                    if (timeOffs.length === 0) return null;
                    return (
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-400 font-medium">Time off entries:</span>
                        {timeOffs.map(to => {
                          const catInfo = TIME_OFF_CATEGORIES.find(c => c.value === (to.category || 'vacation')) || TIME_OFF_CATEGORIES[0];
                          return (
                          <div key={to.id} className="flex items-center justify-between px-2 py-1.5 bg-amber-50 rounded-lg text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-amber-800">{format(parseISO(to.date), 'MMM d, yyyy')}</span>
                              <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${catInfo.color}`}>{catInfo.label}</span>
                              {to.halfDay && <span className="px-1.5 py-0.5 text-[9px] font-medium rounded text-indigo-700 bg-indigo-50">Half Day</span>}
                              {to.reason && <span className="text-amber-500">– {to.reason}</span>}
                            </div>
                            <button
                              onClick={() => {
                                dispatch({ type: 'REMOVE_TIME_OFF', payload: to.id });
                                db.deleteTimeOff(to.id);
                              }}
                              className="p-0.5 text-amber-400 hover:text-red-500 rounded transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          );
                        })}
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

      {/* Add Day Off Modal */}
      {addingTimeOffFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setAddingTimeOffFor(null); setTimeOffDate(''); setTimeOffEndDate(''); setTimeOffMode('single'); setTimeOffReason(''); setTimeOffCategory('vacation'); setTimeOffHalfDay(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Day Off</h3>
              <span className="text-sm text-gray-500">
                {agents.find(a => a.id === addingTimeOffFor)?.name}
              </span>
            </div>

            {/* Mode + Full/Half Day toggles */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => { setTimeOffMode('single'); setTimeOffEndDate(''); }} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${timeOffMode === 'single' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Single Day</button>
                <button onClick={() => { setTimeOffMode('period'); setTimeOffHalfDay(false); }} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${timeOffMode === 'period' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Period</button>
              </div>
              {timeOffMode === 'single' && (
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button onClick={() => setTimeOffHalfDay(false)} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${!timeOffHalfDay ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Full Day</button>
                  <button onClick={() => setTimeOffHalfDay(true)} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${timeOffHalfDay ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Half Day</button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{timeOffMode === 'period' ? 'Start Date' : 'Date'}</label>
                <input type="date" value={timeOffDate} onChange={e => setTimeOffDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoFocus />
              </div>
              {timeOffMode === 'period' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                  <input type="date" value={timeOffEndDate} onChange={e => setTimeOffEndDate(e.target.value)} min={timeOffDate} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
                <select value={timeOffCategory} onChange={e => setTimeOffCategory(e.target.value as any)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {TIME_OFF_CATEGORIES.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
                <input type="text" value={timeOffReason} onChange={e => setTimeOffReason(e.target.value)} placeholder="Additional details" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {timeOffMode === 'period' && timeOffDate && timeOffEndDate && timeOffEndDate >= timeOffDate && (() => {
              const allDays = getDatesInRange(timeOffDate, timeOffEndDate);
              const workDays = allDays.filter(d => {
                const day = new Date(d + 'T12:00:00').getDay();
                return day !== 0 && day !== 6;
              });
              const skipped = allDays.length - workDays.length;
              return (
                <p className="text-xs text-gray-500 mt-2">
                  {workDays.length} working day(s) will be added{skipped > 0 ? ` (${skipped} weekend day${skipped > 1 ? 's' : ''} excluded)` : ''}
                </p>
              );
            })()}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setAddingTimeOffFor(null); setTimeOffDate(''); setTimeOffEndDate(''); setTimeOffMode('single'); setTimeOffReason(''); setTimeOffCategory('vacation'); setTimeOffHalfDay(false); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddTimeOffForAgent(addingTimeOffFor)}
                disabled={!timeOffDate || (timeOffMode === 'period' && !timeOffEndDate)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateTarget && (
        <DeactivateAgentModal agent={deactivateTarget} onClose={() => setDeactivateTarget(null)} />
      )}
    </div>
  );
}

function PtoEditor({ agentId, ptoAllowance, sickDaysAllowance, holidaysDeductPto, dispatch }: {
  agentId: string;
  ptoAllowance: number;
  sickDaysAllowance: number;
  holidaysDeductPto: boolean;
  dispatch: React.Dispatch<any>;
}) {
  const [pto, setPto] = useState(ptoAllowance);
  const [sick, setSick] = useState(sickDaysAllowance);
  const [holidayDeduct, setHolidayDeduct] = useState(holidaysDeductPto);
  const changed = pto !== ptoAllowance || sick !== sickDaysAllowance || holidayDeduct !== holidaysDeductPto;

  const handleSave = () => {
    dispatch({ type: 'UPDATE_USER', payload: { id: agentId, updates: { ptoAllowance: pto, sickDaysAllowance: sick, holidaysDeductPto: holidayDeduct } } });
    updateProfile(agentId, { ptoAllowance: pto, sickDaysAllowance: sick, holidaysDeductPto: holidayDeduct });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-gray-400">PTO:</span>
      <input
        type="number"
        min={0}
        value={pto}
        onChange={e => setPto(parseInt(e.target.value) || 0)}
        className="w-12 px-1 py-0.5 text-xs text-center border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <span className="text-[10px] text-gray-400">Sick:</span>
      <input
        type="number"
        min={0}
        value={sick}
        onChange={e => setSick(parseInt(e.target.value) || 0)}
        className="w-12 px-1 py-0.5 text-xs text-center border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {changed ? (
        <button
          onClick={handleSave}
          className="px-2 py-0.5 text-[10px] font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
        >
          Save
        </button>
      ) : (
        <span className="text-[10px] text-gray-400">days/year</span>
      )}
      <div className="w-full flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-gray-400">Holidays deduct PTO</span>
        <button
          onClick={() => { setHolidayDeduct(!holidayDeduct); }}
          className={`w-8 h-4 rounded-full transition-colors relative ${holidayDeduct ? 'bg-indigo-600' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${holidayDeduct ? 'left-4' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  );
}
