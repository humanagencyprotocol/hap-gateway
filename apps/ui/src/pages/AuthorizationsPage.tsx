import { useState, useEffect, useCallback } from 'react';
import { spClient, type PendingItem, type GateContentEntry } from '../lib/sp-client';
import { profileDisplayName } from '../lib/profile-display';
import { AuthorizePicker } from '../components/AuthorizePicker';
import { useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { DomainBadge } from '../components/DomainBadge';
import { TTLBadge } from '../components/TTLBadge';
import { EmptyState } from '../components/EmptyState';
import { ExtendAuthModal } from '../components/ExtendAuthModal';

type StatusFilter = 'active' | 'pending' | 'expired' | 'revoked';
type Status = 'active' | 'pending' | 'expired' | 'revoked';

function getStatus(item: PendingItem, revokedSet: Set<string>): Status {
  if (revokedSet.has(item.frame_hash)) return 'revoked';
  if (item.sp_status === 'revoked') return 'revoked';
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
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('active');
  const [profileFilter, setProfileFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<'auto' | 'review' | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showPicker, setShowPicker] = useState(() => searchParams.get('new') === '1');
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
    active: items.filter(i => getStatus(i, revokedSet) === 'active').length,
    pending: items.filter(i => getStatus(i, revokedSet) === 'pending').length,
    expired: items.filter(i => getStatus(i, revokedSet) === 'expired').length,
    revoked: items.filter(i => getStatus(i, revokedSet) === 'revoked').length,
  };

  // Profile summary: one entry per distinct profile, with count (under current
  // status filter) and whether any authorization is in review mode.
  const profileSummary = (() => {
    const map = new Map<string, { count: number; review: boolean }>();
    for (const item of items) {
      if (getStatus(item, revokedSet) !== activeFilter) continue;
      const entry = map.get(item.profile_id) ?? { count: 0, review: false };
      entry.count += 1;
      if (item.deferred_commitment_domains.length > 0) entry.review = true;
      map.set(item.profile_id, entry);
    }
    return Array.from(map.entries())
      .map(([profileId, meta]) => ({ profileId, ...meta }))
      .sort((a, b) => profileDisplayName(a.profileId).localeCompare(profileDisplayName(b.profileId)));
  })();

  const filtered = sortItems(
    items.filter(i => {
      if (getStatus(i, revokedSet) !== activeFilter) return false;
      if (profileFilter !== null && i.profile_id !== profileFilter) return false;
      if (modeFilter !== null) {
        const isReview = i.deferred_commitment_domains.length > 0;
        if (modeFilter === 'review' && !isReview) return false;
        if (modeFilter === 'auto' && isReview) return false;
      }
      return true;
    }),
    revokedSet,
  );

  // Track which paths have been seen to only show Extend on most recent per path
  const seenPaths = new Set<string>();

  return (
    <>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}
      >
        <div>
          <h1 className="page-title">Authorizations</h1>
          <p className="page-subtitle">Active, pending, and expired agent authorizations.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowPicker(true)}>
          + New authorization
        </button>
      </div>

      {showPicker && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowPicker(false);
            if (searchParams.get('new')) {
              searchParams.delete('new');
              setSearchParams(searchParams, { replace: true });
            }
          }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '960px', width: '90vw' }}
          >
            <div className="modal-header">
              <h2 className="modal-title">New authorization</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowPicker(false);
                  if (searchParams.get('new')) {
                    searchParams.delete('new');
                    setSearchParams(searchParams, { replace: true });
                  }
                }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', marginTop: 0, marginBottom: '1rem' }}>
                What should your agent be able to do? Pick a profile, set limits, then authorize.
              </p>
              <AuthorizePicker onDismiss={() => setShowPicker(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="nav-tabs">
        {(['active', 'pending', 'expired', 'revoked'] as const).map(tab => (
          <button
            key={tab}
            className={`nav-tab${activeFilter === tab ? ' active' : ''}`}
            onClick={() => { setActiveFilter(tab); setProfileFilter(null); setModeFilter(null); }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({counts[tab]})
          </button>
        ))}
      </div>

      {/* Secondary filter row: profile buttons, a | separator, then mode (auto/review).
          All toggles are independent and combine. Clicking a selected button clears it. */}
      {profileSummary.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginTop: '-0.25rem',
            marginBottom: '1rem',
          }}
        >
          {profileSummary.map(p => {
            const selected = profileFilter === p.profileId;
            return (
              <button
                key={p.profileId}
                className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setProfileFilter(selected ? null : p.profileId)}
              >
                {profileDisplayName(p.profileId)}
              </button>
            );
          })}

          <span
            aria-hidden="true"
            style={{
              color: 'var(--border)',
              fontSize: '1.1rem',
              padding: '0 0.25rem',
              userSelect: 'none',
            }}
          >
            |
          </span>

          {(['auto', 'review'] as const).map(mode => {
            const selected = modeFilter === mode;
            return (
              <button
                key={mode}
                className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setModeFilter(selected ? null : mode)}
              >
                {mode === 'auto' ? 'Auto' : 'Review'}
              </button>
            );
          })}
        </div>
      )}

      {loading && items.length === 0 ? (
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
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: 'var(--text-primary)',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {profileDisplayName(item.profile_id)}
                  </span>
                  {item.title && (
                    <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {item.title}
                    </span>
                  )}
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

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center' }}>
                  {item.required_domains.map(d => (
                    <DomainBadge key={d} domain={d} attested={item.attested_domains.includes(d)} />
                  ))}
                  {item.deferred_commitment_domains.length > 0 && (
                    <span style={{
                      fontSize: '0.65rem',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '0.25rem',
                      background: 'var(--accent-subtle)',
                      color: 'var(--accent)',
                      fontWeight: 600,
                    }}>
                      Review Mode
                    </span>
                  )}
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
                      Intent
                    </div>
                    {gateLoading === item.frame_hash ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Loading gate content...</p>
                    ) : gateEntry ? (
                      <div className="gate-content-block">
                        <div className="gate-content-item">
                          <div className="gate-content-text">{gateEntry.gateContent.intent}</div>
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
