import { useState, useEffect, useCallback } from 'react';
import { spClient, type PendingItem, type GateContentEntry } from '../lib/sp-client';
import { ProfileBadge } from '../components/ProfileBadge';
import { StatusBadge } from '../components/StatusBadge';
import { DomainBadge } from '../components/DomainBadge';
import { TTLBadge } from '../components/TTLBadge';
import { EmptyState } from '../components/EmptyState';
import { ExtendAuthModal } from '../components/ExtendAuthModal';

type StatusFilter = 'all' | 'active' | 'pending' | 'expired' | 'revoked';
type Status = 'active' | 'pending' | 'expired' | 'revoked';

function getStatus(item: PendingItem, revokedSet: Set<string>): Status {
  if (revokedSet.has(item.frame_hash)) return 'revoked';
  if (item.remaining_seconds === null || item.remaining_seconds <= 0) return 'expired';
  if (item.missing_domains.length > 0) return 'pending';
  return 'active';
}

function sortItems(items: PendingItem[], revokedSet: Set<string>): PendingItem[] {
  return [...items].sort((a, b) => {
    const sa = getStatus(a, revokedSet);
    const sb = getStatus(b, revokedSet);
    const order: Record<Status, number> = { active: 0, pending: 1, expired: 2, revoked: 3 };
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    // Active: ascending by remaining TTL
    if (sa === 'active' && sb === 'active') {
      return (a.remaining_seconds ?? 0) - (b.remaining_seconds ?? 0);
    }
    // Expired: most recent first
    if (sa === 'expired' && sb === 'expired') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return 0;
  });
}

export function AuthorizationsPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [gateCache, setGateCache] = useState<Record<string, GateContentEntry | null>>({});
  const [gateLoading, setGateLoading] = useState<string | null>(null);
  const [extendItem, setExtendItem] = useState<PendingItem | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [revokedSet, setRevokedSet] = useState<Set<string>>(new Set());
  const [revokingHash, setRevokingHash] = useState<string | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    spClient.getMyAttestations()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Auto-refresh countdown every 30s
  useEffect(() => {
    const interval = setInterval(fetchItems, 30000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  const handleExpand = async (item: PendingItem) => {
    if (expandedHash === item.frame_hash) {
      setExpandedHash(null);
      return;
    }
    setExpandedHash(item.frame_hash);

    // Lazy load gate content on first expand
    if (!(item.path in gateCache)) {
      setGateLoading(item.frame_hash);
      try {
        const entry = await spClient.getGateContent(item.path);
        setGateCache(prev => ({ ...prev, [item.path]: entry }));
      } catch {
        setGateCache(prev => ({ ...prev, [item.path]: null }));
      } finally {
        setGateLoading(null);
      }
    }
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2000);
    });
  };

  const handleRevoke = async (frameHash: string) => {
    if (!confirm('Revoke this authorization? The agent will no longer be able to execute actions under this attestation.')) return;
    setRevokingHash(frameHash);
    try {
      await spClient.revokeAttestation(frameHash);
      setRevokedSet(prev => new Set(prev).add(frameHash));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke authorization');
    } finally {
      setRevokingHash(null);
    }
  };

  const counts = {
    all: items.length,
    active: items.filter(i => getStatus(i, revokedSet) === 'active').length,
    pending: items.filter(i => getStatus(i, revokedSet) === 'pending').length,
    expired: items.filter(i => getStatus(i, revokedSet) === 'expired').length,
    revoked: items.filter(i => getStatus(i, revokedSet) === 'revoked').length,
  };

  const filtered = sortItems(
    items.filter(i => activeFilter === 'all' || getStatus(i, revokedSet) === activeFilter),
    revokedSet,
  );

  // Track which paths have been seen to only show Extend on most recent per path
  const seenPaths = new Set<string>();

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Authorizations</h1>
        <p className="page-subtitle">Manage active, pending, and expired agent authorizations.</p>
      </div>

      {/* Filter tabs */}
      <div className="nav-tabs">
        {(['all', 'active', 'pending', 'expired', 'revoked'] as const).map(tab => (
          <button
            key={tab}
            className={`nav-tab${activeFilter === tab ? ' active' : ''}`}
            onClick={() => setActiveFilter(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({counts[tab]})
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={'\u2630'}
          title="No authorizations"
          text={activeFilter === 'all'
            ? 'Authorization events will appear here after you authorize an agent.'
            : `No ${activeFilter} authorizations found.`}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(item => {
            const status = getStatus(item, revokedSet);
            const isExpanded = expandedHash === item.frame_hash;
            const gateEntry = gateCache[item.path];
            const isFirstForPath = !seenPaths.has(item.path);
            seenPaths.add(item.path);
            const showExtend = isFirstForPath && (status === 'expired' || isExpanded);
            const boundsEntries = Object.entries(item.frame)
              .filter(([k]) => k !== 'profile' && k !== 'path');

            return (
              <div className="card" key={item.frame_hash} style={{ marginBottom: 0 }}>
                {/* Collapsed view */}
                <div className="auth-card-header">
                  <ProfileBadge profileId={item.profile_id} />
                  <span className="auth-card-path">{item.path}</span>
                  <StatusBadge status={status} />
                  {status === 'active' && item.earliest_expiry && (
                    <TTLBadge expiresAt={new Date(item.earliest_expiry).getTime() / 1000} />
                  )}
                  {status === 'expired' && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {item.required_domains.map(d => (
                    <DomainBadge key={d} domain={d} attested={item.attested_domains.includes(d)} />
                  ))}
                </div>

                {boundsEntries.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    {boundsEntries.map(([k, v]) => `${k}=${v}`).join(' \u00B7 ')}
                  </div>
                )}

                {/* Action row */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleExpand(item)}
                  >
                    {isExpanded ? '\u25B2 Collapse' : '\u25BC Details'}
                  </button>
                  {showExtend && !isExpanded && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setExtendItem(item)}
                    >
                      \u21BB Extend
                    </button>
                  )}
                  {(status === 'active' || status === 'pending') && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRevoke(item.frame_hash)}
                      disabled={revokingHash === item.frame_hash}
                    >
                      {revokingHash === item.frame_hash ? 'Revoking\u2026' : 'Revoke'}
                    </button>
                  )}
                </div>

                {/* Expanded view */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
                    {boundsEntries.length > 0 && (
                      <>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                          Bounds
                        </div>
                        <dl className="review-grid">
                          {boundsEntries.map(([k, v]) => (
                            <span key={k} style={{ display: 'contents' }}>
                              <dt>{k}</dt>
                              <dd>{String(v)}</dd>
                            </span>
                          ))}
                        </dl>
                      </>
                    )}

                    {gateEntry?.context && Object.keys(gateEntry.context).length > 0 && (
                      <>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '1rem', marginBottom: '0.25rem' }}>
                          Context
                        </div>
                        <dl className="review-grid">
                          {Object.entries(gateEntry.context).map(([k, v]) => (
                            <span key={k} style={{ display: 'contents' }}>
                              <dt>{k}</dt>
                              <dd>{String(v)}</dd>
                            </span>
                          ))}
                        </dl>
                      </>
                    )}

                    {/* Gate content (lazy loaded) */}
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '1rem', marginBottom: '0.25rem' }}>
                      Gates
                    </div>
                    {gateLoading === item.frame_hash ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Loading gate content...</p>
                    ) : gateEntry ? (
                      <div className="gate-content-block">
                        <div className="gate-content-item">
                          <div className="gate-content-label">Problem</div>
                          <div className="gate-content-text">{gateEntry.gateContent.problem}</div>
                        </div>
                        <div className="gate-content-item">
                          <div className="gate-content-label">Objective</div>
                          <div className="gate-content-text">{gateEntry.gateContent.objective}</div>
                        </div>
                        <div className="gate-content-item">
                          <div className="gate-content-label">Tradeoffs</div>
                          <div className="gate-content-text">{gateEntry.gateContent.tradeoffs}</div>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Gate content not available.</p>
                    )}

                    {/* Metadata */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '1rem' }}>
                      Created: {new Date(item.created_at).toLocaleString()}
                      {item.earliest_expiry && ` \u00B7 Expires: ${new Date(item.earliest_expiry).toLocaleString()}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: "'SF Mono', Monaco, monospace", wordBreak: 'break-all' }}>
                        {item.frame_hash}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.7rem', padding: '0.125rem 0.375rem' }}
                        onClick={() => handleCopyHash(item.frame_hash)}
                      >
                        {copiedHash === item.frame_hash ? 'copied' : 'copy'}
                      </button>
                    </div>

                    {/* Expanded action row */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setExpandedHash(null)}
                      >
                        \u25B2 Collapse
                      </button>
                      {showExtend && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setExtendItem(item)}
                        >
                          \u21BB Extend
                        </button>
                      )}
                      {(status === 'active' || status === 'pending') && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRevoke(item.frame_hash)}
                          disabled={revokingHash === item.frame_hash}
                        >
                          {revokingHash === item.frame_hash ? 'Revoking\u2026' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Extend Modal */}
      {extendItem && (
        <ExtendAuthModal
          item={extendItem}
          onClose={() => setExtendItem(null)}
          onSuccess={() => {
            setExtendItem(null);
            fetchItems();
          }}
        />
      )}
    </>
  );
}
