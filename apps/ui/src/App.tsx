import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { GateWizardPage } from './pages/GateWizardPage';
import { AgentReviewPage } from './pages/AgentReviewPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { GroupsPage } from './pages/GroupsPage';
import { AuthorizationsPage } from './pages/AuthorizationsPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsServicesPage } from './pages/SettingsServicesPage';
import { ProposalReviewPage } from './pages/ProposalReviewPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, mode, domain } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // Personal mode: always has domain='owner', skip onboarding
  // Team mode: show onboarding if no domain set (no group joined yet)
  if (mode === 'team' && !domain) return <Navigate to="/onboarding" replace />;
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
        <Route path="/agent/new" element={<Navigate to="/authorizations?new=1" replace />} />
        <Route path="/agent/gate" element={<GateWizardPage />} />
        <Route path="/agent/review" element={<AgentReviewPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/authorizations" element={<AuthorizationsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/proposals" element={<ProposalReviewPage />} />
        <Route path="/settings" element={<SettingsServicesPage />} />
        {/* Redirect old routes */}
        <Route path="/settings/services" element={<Navigate to="/settings" replace />} />
        <Route path="/deploy" element={<Navigate to="/integrations" replace />} />
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
