import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { AgentNewPage } from './pages/AgentNewPage';
import { GateWizardPage } from './pages/GateWizardPage';
import { AgentReviewPage } from './pages/AgentReviewPage';
import { DeployReviewPage } from './pages/DeployReviewPage';
import { GroupsPage } from './pages/GroupsPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsServicesPage } from './pages/SettingsServicesPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, groups, activeGroup, activeDomain } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // If user has no groups and no domain, show onboarding
  if (groups.length === 0 && !activeDomain) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/onboarding" element={user ? <OnboardingPage /> : <Navigate to="/login" replace />} />
      <Route element={
        <AuthGuard>
          <AppShell />
        </AuthGuard>
      }>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agent/new" element={<AgentNewPage />} />
        <Route path="/agent/gate" element={<GateWizardPage />} />
        <Route path="/agent/review" element={<AgentReviewPage />} />
        <Route path="/deploy" element={<DeployReviewPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/settings/services" element={<SettingsServicesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
