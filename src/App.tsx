import { useState } from 'react';
import { AuthProvider, useAuth } from './store/AuthContext';
import { AppProvider, useApp } from './store/AppContext';
import { Layout } from './components/Layout';
import { ScheduleView } from './components/ScheduleView';
import { AgentsView } from './components/AgentsView';
import { MyShiftsView } from './components/MyShiftsView';
import { AuthPage } from './components/AuthPage';
import { SetNewPassword } from './components/SetNewPassword';

function AppContent() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState('schedule');

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'schedule' && <ScheduleView />}
      {activeTab === 'agents' && state.currentUser.role === 'admin' && <AgentsView />}
      {activeTab === 'my-shifts' && <MyShiftsView />}
    </Layout>
  );
}

function AuthenticatedApp() {
  const { profile, loading, isPasswordRecovery } = useAuth();

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

  if (!profile) {
    return <AuthPage />;
  }

  return (
    <AppProvider currentUser={profile}>
      <AppContent />
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
