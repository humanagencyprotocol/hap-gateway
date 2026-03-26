import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type Proposal } from '../lib/sp-client';

export function ProposalReviewPage() {
  const { domain } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const fetchProposals = useCallback(async () => {
    try {
      const items = await spClient.getProposals(domain);
      setProposals(items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    fetchProposals();
    const interval = setInterval(fetchProposals, 10_000);
    return () => clearInterval(interval);
  }, [fetchProposals]);

  const handleResolve = async (id: string, action: 'commit' | 'reject') => {
    setResolving(id);
    setMessage('');
    try {
      const domain = domain || 'owner';
      const result = await spClient.resolveProposal(id, action, domain);
      if (action === 'commit') {
        setMessage(`Proposal committed. Status: ${result.status}`);
      } else {
        setMessage('Proposal rejected.');
      }
      await fetchProposals();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setResolving(null);
    }
  };

  const shortProfile = (id: string) => {
    const withoutVersion = id.replace(/@.*$/, '');
    return withoutVersion.split('/').pop() ?? id;
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Proposals</h1>
        <p className="page-subtitle">
          Agent actions awaiting your commitment. Review and commit or reject each action.
        </p>
      </div>

      {message && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{message}</div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      ) : proposals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>No pending proposals</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            When an agent calls a tool with deferred commitment, proposals appear here for your review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {proposals.map(p => {
            const isResolving = resolving === p.id;
            const remainingMs = p.expiresAt * 1000 - Date.now();
            const remainingMin = Math.max(0, Math.ceil(remainingMs / 60_000));
            const committed = Object.keys(p.committedBy);
            const remaining = p.pendingDomains.filter(d => !(d in p.committedBy));

            return (
              <div className="card" key={p.id}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span className="profile-badge">{shortProfile(p.profileId)}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.path}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {remainingMin} min remaining
                  </span>
                </div>

                {/* Tool + Args */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                    Tool
                  </div>
                  <code style={{ fontSize: '0.85rem' }}>{p.tool}</code>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                    Arguments
                  </div>
                  <pre style={{
                    fontSize: '0.8rem',
                    background: 'var(--bg-main)',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border)',
                    overflow: 'auto',
                    maxHeight: '12rem',
                  }}>
                    {JSON.stringify(p.toolArgs, null, 2)}
                  </pre>
                </div>

                {/* Execution Context */}
                {Object.keys(p.executionContext).length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                      Execution Context
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {Object.entries(p.executionContext).map(([k, v]) => `${k}=${v}`).join(' · ')}
                    </div>
                  </div>
                )}

                {/* Domain status */}
                {p.pendingDomains.length > 1 && (
                  <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--success)' }}>
                      Committed: {committed.length > 0 ? committed.join(', ') : 'none'}
                    </span>
                    {' · '}
                    <span style={{ color: 'var(--warning)' }}>
                      Remaining: {remaining.join(', ')}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleResolve(p.id, 'commit')}
                    disabled={isResolving}
                  >
                    {isResolving ? 'Committing...' : 'Commit'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleResolve(p.id, 'reject')}
                    disabled={isResolving}
                  >
                    Reject
                  </button>
                </div>

                {/* Proposal ID */}
                <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                  Proposal: {p.id}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
