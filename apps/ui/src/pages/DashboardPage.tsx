import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type PendingItem } from '../lib/sp-client';
import { QuickActionCard } from '../components/QuickActionCard';
import { ProfileBadge } from '../components/ProfileBadge';
import { StatusBadge } from '../components/StatusBadge';
import { DomainBadge } from '../components/DomainBadge';
import { TTLBadge } from '../components/TTLBadge';
import { EmptyState } from '../components/EmptyState';

export function DashboardPage() {
  const { activeDomain } = useAuth();
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeDomain) { setLoading(false); return; }
    spClient.getPending(activeDomain)
      .then(setPendingItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeDomain]);

  const activeItems = pendingItems.filter(p => p.remaining_seconds !== null && p.remaining_seconds > 0);
  const pendingReview = pendingItems.filter(p => p.missing_domains.length > 0);
  const isEmpty = activeItems.length === 0 && pendingReview.length === 0;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Your active authorizations and pending reviews.</p>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <QuickActionCard
          to="/agent/new"
          icon={'\u25C8'}
          title="New Agent Authorization"
          description="Grant bounded authority to an AI agent"
        />
        <QuickActionCard
          to="/deploy"
          icon={'\u21B7'}
          title="Review a Deploy"
          description="Attest a pull request through the gate flow"
        />
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : isEmpty ? (
        /* Empty State (Screen 10) */
        <div className="card">
          <EmptyState
            icon={'\u25C8'}
            title="No active authorizations"
            text="Get started by creating your first agent authorization or reviewing a deploy."
          >
            <Link to="/agent/new" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
              New Agent Authorization
            </Link>
          </EmptyState>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: '2rem', paddingTop: '2rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.875rem' }}>
              Getting started
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {['Select a profile that matches the agent action', 'Set bounds to constrain what the agent can do', 'Answer the three gate questions: Problem, Objective, Tradeoffs', 'Commit to create a cryptographic attestation'].map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.625rem', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.95rem' }}>{i + 1}.</span>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Active Agent Authorizations */}
          <div className="dashboard-section">
            <div className="section-header">
              <h3 className="section-title">Active Agent Authorizations</h3>
              <span className="section-count">{activeItems.length} active</span>
            </div>

            {activeItems.length === 0 ? (
              <EmptyState title="No active authorizations" text="Create one to get started." />
            ) : (
              activeItems.map(item => (
                <div className="auth-card" key={item.frame_hash}>
                  <div className="auth-card-header">
                    <ProfileBadge profileId={item.profile_id} />
                    <span className="auth-card-path">{item.path}</span>
                    <StatusBadge status={item.missing_domains.length > 0 ? 'pending' : 'active'} />
                    {item.earliest_expiry && (
                      <TTLBadge expiresAt={new Date(item.earliest_expiry).getTime() / 1000} />
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    {item.attested_domains.map(d => (
                      <DomainBadge key={d} domain={d} attested />
                    ))}
                    {item.missing_domains.map(d => (
                      <DomainBadge key={d} domain={d} attested={false} />
                    ))}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    {Object.entries(item.frame)
                      .filter(([k]) => k !== 'profile' && k !== 'path')
                      .map(([k, v]) => `${k} = ${v}`)
                      .join(' \u00B7 ')}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pending Reviews */}
          {pendingReview.length > 0 && (
            <div className="dashboard-section">
              <div className="section-header">
                <h3 className="section-title">Pending Reviews</h3>
                <span className="section-count">{pendingReview.length} awaiting attestation</span>
              </div>
              {pendingReview.map(item => (
                <div className="auth-card" key={item.frame_hash}>
                  <div className="auth-card-header">
                    <ProfileBadge profileId={item.profile_id} />
                    <span className="auth-card-path">{item.path}</span>
                    <StatusBadge status="pending" label="Needs review" />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {item.required_domains.map(d => (
                      <DomainBadge
                        key={d}
                        domain={d}
                        attested={item.attested_domains.includes(d)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent Attestations link */}
          <div className="dashboard-section">
            <div className="section-header">
              <h3 className="section-title">Recent Attestations</h3>
              <Link to="/audit" className="btn btn-ghost btn-sm">View all</Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
