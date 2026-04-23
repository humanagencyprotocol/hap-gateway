import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type Proposal, type ExecutionReceipt } from '../lib/sp-client';
import { aggregateThread, type ThreadItem } from '../lib/thread-aggregator';
import { ActionCard } from '../components/ActionCard';
import { profileDisplayName } from '../lib/profile-display';
import { useVisiblePolling } from '../hooks/useVisiblePolling';

type StatusFilter = 'pending' | 'all';

export function ProposalReviewPage() {
  const { domain } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [profileFilter, setProfileFilter] = useState<string | null>(null);
  const [includeAutonomous, setIncludeAutonomous] = useState(false);

  const fetchThread = useCallback(async () => {
    try {
      const { proposals: ps, receipts: rs } = await spClient.getThread({
        domain,
        status: statusFilter,
        sinceDays: 7,
      });
      setProposals(ps);
      setReceipts(rs);
    } catch {
      // ignore — background refresh, keep previous state
    } finally {
      setLoading(false);
    }
  }, [domain, statusFilter]);

  useVisiblePolling(fetchThread, 30_000, `${domain}:${statusFilter}`);

  const handleResolve = async (id: string, action: 'commit' | 'reject') => {
    setResolving(id);
    setMessage('');
    try {
      const resolveDomain = domain || 'owner';
      const result = await spClient.resolveProposal(id, action, resolveDomain);
      setMessage(action === 'commit' ? `Action approved. Status: ${result.status}` : 'Action rejected.');
      await fetchThread();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setResolving(null);
    }
  };

  // Profile chips: union of profile IDs present in either list, sorted.
  const profileIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of proposals) set.add(p.profileId);
    for (const r of receipts) set.add(r.profileId);
    return Array.from(set).sort();
  }, [proposals, receipts]);

  const items: ThreadItem[] = useMemo(
    () => aggregateThread(proposals, receipts, {
      status: statusFilter,
      profile: profileFilter ?? undefined,
      includeAutonomous,
    }),
    [proposals, receipts, statusFilter, profileFilter, includeAutonomous],
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Pending Approvals</h1>
        <p className="page-subtitle">
          Agent actions awaiting your approval, plus recent activity from the last 7 days.
        </p>
      </div>

      {message && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{message}</div>
      )}

      {/* Filter chips */}
      <div className="filter-chips" style={{ marginBottom: '1rem' }}>
        <button
          className={`filter-chip ${statusFilter === 'pending' ? 'selected' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          Pending
        </button>
        <button
          className={`filter-chip ${statusFilter === 'all' ? 'selected' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All
        </button>

        {profileIds.length > 0 && (
          <span style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 0.25rem' }} />
        )}

        {profileIds.map((pid) => (
          <button
            key={pid}
            className={`filter-chip ${profileFilter === pid ? 'selected' : ''}`}
            onClick={() => setProfileFilter(profileFilter === pid ? null : pid)}
          >
            {profileDisplayName(pid)}
          </button>
        ))}

        {statusFilter === 'all' && (
          <>
            <span style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 0.25rem' }} />
            <button
              className={`filter-chip ${includeAutonomous ? 'selected' : ''}`}
              onClick={() => setIncludeAutonomous(!includeAutonomous)}
              title="Include actions executed without human review (automatic commitment mode)"
            >
              {includeAutonomous ? '✓ ' : ''}Autonomous actions
            </button>
          </>
        )}
      </div>

      {loading && items.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
            {statusFilter === 'pending' ? 'No actions awaiting your approval.' : 'Nothing here yet.'}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            {statusFilter === 'pending'
              ? 'Your agents are operating within their authorizations. Switch to All to see recent activity.'
              : 'When an agent calls a gated tool, activity will appear here.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item) => (
            <ActionCard
              key={item.id}
              item={item}
              onApprove={(id) => handleResolve(id, 'commit')}
              onReject={(id) => handleResolve(id, 'reject')}
              resolving={resolving === item.id}
            />
          ))}
        </div>
      )}
    </>
  );
}
