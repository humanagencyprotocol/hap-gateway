import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type PendingItem } from '../lib/sp-client';
import { ProfileBadge } from '../components/ProfileBadge';
import { StatusBadge } from '../components/StatusBadge';
import { DomainBadge } from '../components/DomainBadge';
import { EmptyState } from '../components/EmptyState';

// TODO: Add search/filter bar (see UX proposal)

export function AuditPage() {
  const { activeDomain } = useAuth();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeDomain) { setLoading(false); return; }
    spClient.getPending(activeDomain)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeDomain]);

  const getStatus = (item: PendingItem): 'active' | 'pending' | 'expired' => {
    if (item.remaining_seconds !== null && item.remaining_seconds <= 0) return 'expired';
    if (item.missing_domains.length > 0) return 'pending';
    return 'active';
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Agent Receipts</h1>
        <p className="page-subtitle">Authorization and attestation history.</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={'\u2630'}
          title="No audit events"
          text="Authorization and attestation events will appear here."
        />
      ) : (
        <div className="timeline">
          {items.map(item => {
            const status = getStatus(item);
            return (
              <div className={`timeline-event${status === 'expired' ? ' expired' : ''}`} key={item.frame_hash}>
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="auth-card-header">
                    <ProfileBadge profileId={item.profile_id} />
                    <span className="auth-card-path">{item.path}</span>
                    <StatusBadge status={status} />
                    <span className="auth-card-time">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    {item.required_domains.map(d => (
                      <DomainBadge
                        key={d}
                        domain={d}
                        attested={item.attested_domains.includes(d)}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: "'SF Mono', Monaco, monospace", wordBreak: 'break-all' }}>
                    {item.frame_hash}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
