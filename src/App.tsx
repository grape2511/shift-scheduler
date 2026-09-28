import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './store/AuthContext';
import { AppProvider, useApp } from './store/AppContext';
import { Layout } from './components/Layout';
import { ScheduleView } from './components/ScheduleView';
import { AgentsView } from './components/AgentsView';
import { MyShiftsView } from './components/MyShiftsView';
import { AuthPage } from './components/AuthPage';
import { SetNewPassword } from './components/SetNewPassword';
import { InsightsView } from './components/InsightsView';
import { TimeOffApproval } from './components/TimeOffApproval';
import { ShiftPrompt } from './components/ShiftPrompt';
import { ClockTab } from './components/ClockTab';
import { DaysOffTab } from './components/DaysOffTab';
import { SettingsView } from './components/SettingsView';
import { ActivityView } from './components/ActivityView';
import { ClockLogsView } from './components/ClockLogsView';
import { MyClockLog } from './components/MyClockLog';
import { pathForTab, currentTab } from './routes';

// Tabs only an admin may open; agent-only tabs are gated the other way. A
// deep-link to a tab the current role can't see falls back to the schedule so
// the page is never blank.
const ADMIN_ONLY_TABS = new Set(['time-off-approval', 'insights', 'activity', 'clock-logs', 'settings']);

function AppContent() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState(currentTab);
  const isAdmin = state.currentUser.role === 'admin';
  const effectiveTab =
    (ADMIN_ONLY_TABS.has(activeTab) && !isAdmin) || (activeTab === 'my-clock-log' && isAdmin)
      ? 'schedule'
      : activeTab;

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    const path = pathForTab(tab);
    // Only push a new history entry when the URL actually changes, so repeated
    // clicks on the same tab don't stack duplicate back-button steps.
    if (path !== window.location.pathname) {
      window.history.pushState(null, '', path);
    }
  }, []);

  // Keep the active tab in sync with the browser URL for back/forward and for
  // links opened in the same tab.
  useEffect(() => {
    const onPopState = () => setActiveTab(currentTab());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <Layout activeTab={effectiveTab} onTabChange={handleTabChange}>
      {effectiveTab === 'schedule' && <ScheduleView />}
      {effectiveTab === 'agents' && (state.currentUser.role === 'admin' || state.currentUser.role === 'team-lead') && <AgentsView />}
      {effectiveTab === 'clock' && <ClockTab />}
      {effectiveTab === 'my-shifts' && <MyShiftsView />}
      {effectiveTab === 'my-clock-log' && state.currentUser.role !== 'admin' && <MyClockLog />}
      {effectiveTab === 'days-off' && <DaysOffTab />}
      {effectiveTab === 'time-off-approval' && state.currentUser.role === 'admin' && <TimeOffApproval />}
      {effectiveTab === 'insights' && state.currentUser.role === 'admin' && <InsightsView />}
      {effectiveTab === 'activity' && state.currentUser.role === 'admin' && <ActivityView />}
      {effectiveTab === 'clock-logs' && state.currentUser.role === 'admin' && <ClockLogsView />}
      {effectiveTab === 'settings' && state.currentUser.role === 'admin' && <SettingsView />}
    </Layout>
  );
}

function AuthenticatedApp() {
  const { session, profile, loading, isPasswordRecovery } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return <SetNewPassword />;
  }

  // No session = not logged in
  if (!session) {
    return <AuthPage />;
  }

  // Session exists but profile still loading
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <AppProvider currentUser={profile}>
      <AppContent />
      <ShiftPrompt />
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
