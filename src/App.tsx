import { useState } from 'react';
import { AuthProvider, useAuth } from './store/AuthContext';
import { AppProvider, useApp } from './store/AppContext';
import { Layout } from './components/Layout';
import { ScheduleView } from './components/ScheduleView';
import { AgentsView } from './components/AgentsView';
import { MyShiftsView } from './components/MyShiftsView';
import { AuthPage } from './components/AuthPage';
import { SetNewPassword } from './components/SetNewPassword';
import { UserManagement } from './components/UserManagement';
import { InsightsView } from './components/InsightsView';
import { ShiftPrompt } from './components/ShiftPrompt';

function AppContent() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState('schedule');

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'schedule' && <ScheduleView />}
      {activeTab === 'agents' && (state.currentUser.role === 'admin' || state.currentUser.role === 'team-lead') && <AgentsView />}
      {activeTab === 'my-shifts' && <MyShiftsView />}
      {activeTab === 'insights' && state.currentUser.role === 'admin' && <InsightsView />}
      {activeTab === 'user-management' && state.currentUser.role === 'admin' && <UserManagement />}
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
