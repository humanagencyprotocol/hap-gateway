import { useState, useMemo, useCallback } from 'react';
import { spClient, type ExecutionReceipt } from '../lib/sp-client';
import { profileDisplayName } from '../lib/profile-display';
import { ProfileBadge } from '../components/ProfileBadge';
import { EmptyState } from '../components/EmptyState';
import { useVisiblePolling } from '../hooks/useVisiblePolling';

type TimeRange = '1d' | '7d' | '30d' | 'all';

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function isWithinTimeRange(receipt: ExecutionReceipt, range: TimeRange): boolean {
  if (range === 'all') return true;
  const days = range === '1d' ? 1 : range === '7d' ? 7 : 30;
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  return receipt.timestamp >= cutoff;
}

function matchesSearch(receipt: ExecutionReceipt, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    receipt.profileId.toLowerCase().includes(q) ||
    profileDisplayName(receipt.profileId).toLowerCase().includes(q) ||
    receipt.path.toLowerCase().includes(q) ||
    receipt.action.toLowerCase().includes(q) ||
    receipt.attestationHash.toLowerCase().includes(q) ||
    receipt.id.toLowerCase().includes(q) ||
    JSON.stringify(receipt.executionContext).toLowerCase().includes(q)
  );
}

export function AuditPage() {
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & filter state
  const [search, setSearch] = useState('');
  const [profileFilters, setProfileFilters] = useState<Set<string>>(new Set());
  const [actionFilters, setActionFilters] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchReceipts = useCallback(() => {
    setLoading(true);
    spClient.getMyReceipts({ limit: 200 })
      .then(setReceipts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useVisiblePolling(fetchReceipts, 120_000);

  // Derive available profiles and actions from data
  const availableProfiles = useMemo(() => {
    const set = new Set<string>();
    for (const r of receipts) set.add(profileDisplayName(r.profileId));
    return [...set].sort();
  }, [receipts]);

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    for (const r of receipts) set.add(r.action);
    return [...set].sort();
  }, [receipts]);

  // Apply all filters
  const filtered = useMemo(() => {
    return receipts.filter(r => {
      if (!matchesSearch(r, search)) return false;
      if (profileFilters.size > 0 && !profileFilters.has(profileDisplayName(r.profileId))) return false;
      if (actionFilters.size > 0 && !actionFilters.has(r.action)) return false;
      if (!isWithinTimeRange(r, timeRange)) return false;
      return true;
    });
  }, [receipts, search, profileFilters, actionFilters, timeRange]);

  const hasActiveFilters = profileFilters.size > 0 || actionFilters.size > 0 || timeRange !== 'all';

  function toggleProfile(p: string) {
    setProfileFilters(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  function toggleAction(a: string) {
    setActionFilters(prev => {
      const next = new Set(prev);
      next.has(a) ? next.delete(a) : next.add(a);
      return next;
    });
  }

  function clearAllFilters() {
    setProfileFilters(new Set());
    setActionFilters(new Set());
    setTimeRange('all');
    setSearch('');
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Receipts</h1>
        <p className="page-subtitle">Execution history for agent actions.</p>
      </div>

      {/* Search + Filter toggle row */}
      <div className="search-filter-bar">
        <div className="search-input-wrap">
          <span className="search-icon">&#x2315;</span>
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search by profile, action, path, or hash\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>
              &times;
            </button>
          )}
        </div>
        <button
          className={`btn btn-sm btn-secondary${filtersOpen ? ' active' : ''}`}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Filters{hasActiveFilters ? ` (${profileFilters.size + actionFilters.size + (timeRange !== 'all' ? 1 : 0)})` : ''}
        </button>
      </div>

      {/* Expandable filter panel */}
      {filtersOpen && (
        <div className="filter-panel">
          {/* Profile */}
          {availableProfiles.length > 1 && (
            <div className="filter-section">
              <div className="filter-label">Profile</div>
              <div className="filter-chips">
                {availableProfiles.map(p => (
                  <button
                    key={p}
                    className={`filter-chip${profileFilters.has(p) ? ' selected' : ''}`}
                    onClick={() => toggleProfile(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action */}
          {availableActions.length > 1 && (
            <div className="filter-section">
              <div className="filter-label">Action</div>
              <div className="filter-chips">
                {availableActions.map(a => (
                  <button
                    key={a}
                    className={`filter-chip${actionFilters.has(a) ? ' selected' : ''}`}
                    onClick={() => toggleAction(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time range */}
          <div className="filter-section">
            <div className="filter-label">Time range</div>
            <div className="filter-chips">
              {([['1d', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={`filter-chip${timeRange === value ? ' selected' : ''}`}
                  onClick={() => setTimeRange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="active-filters">
          {[...profileFilters].map(p => (
            <span key={p} className="active-chip" onClick={() => toggleProfile(p)}>
              {p} <span className="chip-remove">&times;</span>
            </span>
          ))}
          {[...actionFilters].map(a => (
            <span key={a} className="active-chip" onClick={() => toggleAction(a)}>
              {a} <span className="chip-remove">&times;</span>
            </span>
          ))}
          {timeRange !== 'all' && (
            <span className="active-chip" onClick={() => setTimeRange('all')}>
              {timeRange === '1d' ? 'Today' : timeRange === '7d' ? '7 days' : '30 days'} <span className="chip-remove">&times;</span>
            </span>
          )}
          <button className="clear-filters" onClick={clearAllFilters}>
            Clear all
          </button>
        </div>
      )}

      {loading && receipts.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={'\u2315'}
          title={receipts.length === 0 ? 'No receipts yet' : 'No matching receipts'}
          text={receipts.length === 0
            ? 'Execution receipts will appear here after an agent uses an authorized tool.'
            : 'Try adjusting your search or filters.'}
        />
      ) : (
        <>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
            {filtered.length === receipts.length
              ? `${receipts.length} receipt${receipts.length !== 1 ? 's' : ''}`
              : `${filtered.length} of ${receipts.length} receipts`}
          </div>
          <div className="timeline">
            {filtered.map(receipt => (
              <div className="timeline-event" key={receipt.id}>
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="auth-card-header">
                    <ProfileBadge profileId={receipt.profileId} />
                    <span className="auth-card-path">{receipt.path}</span>
                    <span className="receipt-action">{receipt.action}</span>
                    <span className="auth-card-time">
                      {formatDate(receipt.timestamp)}
                    </span>
                  </div>

                  {/* Execution context */}
                  {Object.keys(receipt.executionContext).length > 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.375rem' }}>
                      {Object.entries(receipt.executionContext)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' \u00B7 ')}
                    </div>
                  )}

                  {/* Cumulative state */}
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    <span>Daily: {receipt.cumulativeState.daily.count} calls, ${receipt.cumulativeState.daily.amount}</span>
                    <span>Monthly: {receipt.cumulativeState.monthly.count} calls, ${receipt.cumulativeState.monthly.amount}</span>
                  </div>

                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: "'SF Mono', Monaco, monospace", wordBreak: 'break-all', marginTop: '0.375rem' }}>
                    {receipt.attestationHash}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
