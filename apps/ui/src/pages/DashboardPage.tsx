import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type PendingItem, type Proposal } from '../lib/sp-client';
import { SetupGuide } from '../components/SetupGuide';
import { useVisiblePolling } from '../hooks/useVisiblePolling';
import { useIntegrationStatus } from '../contexts/IntegrationStatusContext';

const EXPIRY_WARN_SECONDS = 30 * 60; // 30 minutes

function shortProfile(id: string): string {
  return id.replace(/@.*$/, '').split('/').pop() ?? id;
}

export function DashboardPage() {
  const { domain } = useAuth();
  const [auths, setAuths] = useState<PendingItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const { entries: integrationEntries, activeSessions, loading: integrationsLoading } = useIntegrationStatus();

  const refresh = useCallback(async () => {
    await Promise.all([
      spClient.getMyAttestations().then(setAuths).catch(() => {}),
      spClient.getProposals(domain || 'owner').then(setProposals).catch(() => {}),
      spClient.getCredential('ai-config').then(s => setAiConfigured(s.configured)).catch(() => {}),
    ]);
    setLoadedOnce(true);
  }, [domain]);

  // Poll non-integration data. Integration status comes from the shared
  // IntegrationStatusContext (single source of truth across Sidebar /
  // Dashboard / IntegrationsPage — no cross-view disagreement).
  useVisiblePolling(refresh, 15_000, domain);

  const loading = !loadedOnce || integrationsLoading;

  // Compute counts
  const active = auths.filter(a => a.remaining_seconds !== null && a.remaining_seconds > 0);
  const expired = auths.filter(a => a.remaining_seconds === null || a.remaining_seconds <= 0);
  const soonExpiring = active.filter(a => a.remaining_seconds !== null && a.remaining_seconds <= EXPIRY_WARN_SECONDS);
  const pendingProposals = proposals.filter(p => p.status === 'pending');
  const runningIntegrations = integrationEntries.filter(e => e.state === 'running');
  const startingIntegrations = integrationEntries.filter(e => e.state === 'starting');
  const attentionIntegrations = integrationEntries.filter(
    e => e.state === 'not-running' || e.state === 'error',
  );
  const todayReceipts = 0; // Could fetch but keep it simple

  // Attention items
  const attentionItems: { label: string; detail: string; to: string; color: string }[] = [];

  for (const p of pendingProposals) {
    attentionItems.push({
      label: 'Approval pending',
      detail: `${p.tool} awaiting your approval`,
      to: '/proposals',
      color: 'var(--warning)',
    });
  }

  for (const a of soonExpiring) {
    const mins = Math.ceil((a.remaining_seconds ?? 0) / 60);
    attentionItems.push({
      label: 'Expiring soon',
      detail: `${a.title ?? shortProfile(a.profile_id)} — ${mins} min remaining`,
      to: '/authorizations',
      color: 'var(--warning)',
    });
  }

  for (const a of expired) {
    attentionItems.push({
      label: 'Expired',
      detail: a.title ?? shortProfile(a.profile_id),
      to: '/authorizations',
      color: 'var(--danger)',
    });
  }

  for (const e of attentionIntegrations) {
    attentionItems.push({
      label: e.state === 'error' ? 'Integration error' : 'Integration stopped',
      detail: e.state === 'error' && e.integration?.error
        ? `${e.manifest.name}: ${e.integration.error}`
        : `${e.manifest.name} is not running`,
      to: '/integrations',
      color: 'var(--danger)',
    });
  }
  for (const e of startingIntegrations) {
    attentionItems.push({
      label: 'Integration starting',
      detail: `${e.manifest.name} is coming up…`,
      to: '/integrations',
      color: 'var(--warning)',
    });
  }

  if (!aiConfigured) {
    attentionItems.push({
      label: 'AI Assistant',
      detail: 'Not configured — needed for gate advisory',
      to: '/settings',
      color: 'var(--text-tertiary)',
    });
  }

  if (loading) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      {/* Setup guide */}
      <SetupGuide
        aiConfigured={aiConfigured}
        hasRunningIntegration={runningIntegrations.length > 0}
        hasActiveAuth={active.length > 0}
        hasAgentConnected={activeSessions > 0}
        mcpEndpoint={`http://localhost:${window.location.port === '3400' ? '3430' : '7430'}`}
      />

      {/* Status bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Link to="/authorizations" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: active.length > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
              {active.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active</div>
          </div>
        </Link>
        <Link to="/proposals" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: pendingProposals.length > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
              {pendingProposals.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pending Approvals</div>
          </div>
        </Link>
        <Link to="/authorizations" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: expired.length > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
              {expired.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expired</div>
          </div>
        </Link>
        <Link to="/integrations" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: runningIntegrations.length > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
              {runningIntegrations.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Integrations Running</div>
          </div>
        </Link>
      </div>

      {/* Attention required */}
      {attentionItems.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {attentionItems.map((item, i) => (
            <Link key={i} to={item.to} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  borderRadius: '50%',
                  background: item.color,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{'\u203A'}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>All clear. Nothing needs your attention.</div>
        </div>
      )}
    </>
  );
}
