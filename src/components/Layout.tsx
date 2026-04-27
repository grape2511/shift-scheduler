import { useState, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { Calendar, Users, Bell, Clock, ChevronDown, Menu, X, LogOut, Globe, MapPin, BarChart3, CalendarCheck, Timer, Moon, Sun, Eye, Settings, Activity, History } from 'lucide-react';
import { NotificationPanel } from './NotificationPanel';
import { COUNTRIES } from '../utils/holidays';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const COMMON_TIMEZONES = [
  'auto',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Warsaw',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function formatTimezoneLabel(tz: string): string {
  if (tz === 'auto') return `Auto (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  return tz.replace(/_/g, ' ');
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { state, dispatch, getUnreadNotificationCount } = useApp();
  const { signOut } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showViewAs, setShowViewAs] = useState(false);
  const realAdminRef = useRef(state.currentUser.role === 'admin' ? state.currentUser : null);
  const isImpersonating = realAdminRef.current && state.currentUser.id !== realAdminRef.current.id;

  const handleViewAs = (userId: string) => {
    if (!realAdminRef.current) realAdminRef.current = state.currentUser;
    const user = state.users.find(u => u.id === userId);
    if (user) dispatch({ type: 'SET_CURRENT_USER', payload: user });
    setShowViewAs(false);
    setShowUserMenu(false);
  };

  const handleExitViewAs = () => {
    if (realAdminRef.current) {
      dispatch({ type: 'SET_CURRENT_USER', payload: realAdminRef.current });
    }
  };
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);
  const unreadCount = getUnreadNotificationCount();

  const isAdmin = state.currentUser.role === 'admin';

  const tabs = [
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    ...(state.currentUser.role === 'team-lead' ? [{ id: 'agents', label: 'Agents', icon: Users }] : []),
    ...(!isAdmin ? [{ id: 'clock', label: 'Clock', icon: Timer }] : []),
    ...(!isAdmin ? [{ id: 'my-shifts', label: 'My Shifts', icon: Clock }] : []),
    { id: 'days-off', label: 'Days Off', icon: CalendarCheck },
    ...(isAdmin ? [{ id: 'time-off-approval', label: 'Approvals', icon: CalendarCheck }] : []),
    ...(isAdmin ? [{ id: 'insights', label: 'Insights', icon: BarChart3 }] : []),
    ...(isAdmin ? [{ id: 'activity', label: 'Activity', icon: Activity }] : []),
    ...(isAdmin ? [{ id: 'clock-logs', label: 'Clock Logs', icon: History }] : []),
    ...(isAdmin ? [{ id: 'settings', label: 'Settings', icon: Settings }] : []),
  ];

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-100">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm">
          <Eye className="w-4 h-4" />
          <span>Viewing as <strong>{state.currentUser.name}</strong> ({state.currentUser.role})</span>
          <button
            onClick={handleExitViewAs}
            className="px-3 py-1 text-xs font-medium bg-white text-amber-700 rounded-lg hover:bg-amber-50"
          >
            Exit
          </button>
        </div>
      )}
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo + Nav */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-gray-900 text-lg">Shifts</span>
              </div>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50">
                      <NotificationPanel onClose={() => setShowNotifications(false)} onTabChange={onTabChange} />
                    </div>
                  </>
                )}
              </div>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                    style={{ backgroundColor: state.currentUser.color }}
                  >
                    {state.currentUser.name[0]}
                  </div>
                  <span className="text-sm font-medium text-gray-700 hidden sm:inline">
                    {state.currentUser.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium hidden sm:inline">
                    {state.currentUser.role}
                  </span>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{state.currentUser.name}</p>
                        <p className="text-xs text-gray-400">{state.currentUser.email}</p>
                      </div>
                      {/* View as (admin only) */}
                      {(realAdminRef.current || isAdmin) && !isImpersonating && (
                        <div className="px-3 py-2 border-b border-gray-100">
                          <button
                            onClick={() => setShowViewAs(!showViewAs)}
                            className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700"
                          >
                            <div className="flex items-center gap-1.5">
                              <Eye className="w-3.5 h-3.5" />
                              View as
                            </div>
                            <ChevronDown className={`w-3 h-3 transition-transform ${showViewAs ? 'rotate-180' : ''}`} />
                          </button>
                          {showViewAs && (
                            <div className="mt-2 -mx-3 max-h-48 overflow-y-auto border-t border-gray-100">
                              {state.users.filter(u => u.id !== state.currentUser.id).map(u => (
                                <button
                                  key={u.id}
                                  onClick={() => handleViewAs(u.id)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium" style={{ backgroundColor: u.color }}>
                                    {u.name[0]}
                                  </div>
                                  <span className="flex-1 text-left truncate">{u.name}</span>
                                  <span className="text-[10px] text-gray-400">{u.role}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Timezone selector */}
                      <div className="px-3 py-2 border-b border-gray-100">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
                          <Globe className="w-3.5 h-3.5" />
                          Timezone
                        </div>
                        <select
                          value={state.currentUser.timezone || 'auto'}
                          onChange={e => dispatch({
                            type: 'UPDATE_USER',
                            payload: { id: state.currentUser.id, updates: { timezone: e.target.value } },
                          })}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {COMMON_TIMEZONES.map(tz => (
                            <option key={tz} value={tz}>{formatTimezoneLabel(tz)}</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Local time: {new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: state.currentUser.timezone && state.currentUser.timezone !== 'auto'
                              ? state.currentUser.timezone
                              : undefined,
                          })}
                        </p>
                      </div>
                      {/* Country selector */}
                      <div className="px-3 py-2 border-b border-gray-100">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          Country
                        </div>
                        <select
                          value={state.currentUser.country || ''}
                          onChange={e => dispatch({
                            type: 'UPDATE_USER',
                            payload: { id: state.currentUser.id, updates: { country: e.target.value || undefined } },
                          })}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">No country set</option>
                          {COUNTRIES.map(c => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Sets your public holidays on the calendar
                        </p>
                      </div>
                      {/* Dark Mode Toggle */}
                      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                        <button
                          onClick={() => setDarkMode(!darkMode)}
                          className="w-full flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
                        >
                          <div className="flex items-center gap-2">
                            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                            {darkMode ? 'Light Mode' : 'Dark Mode'}
                          </div>
                          <div className={`w-8 h-4 rounded-full transition-colors relative ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${darkMode ? 'left-4' : 'left-0.5'}`} />
                          </div>
                        </button>
                      </div>
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-1"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-gray-100 px-4 py-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium ${
                  activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
