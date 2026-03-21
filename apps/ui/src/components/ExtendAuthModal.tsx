import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type PendingItem, type GateContentEntry } from '../lib/sp-client';
import { computeBoundsHashBrowser, computeContextHashBrowser, hashGateContent } from '../lib/frame';
import { profileDisplayName } from '../lib/profile-display';
import type { AgentProfile } from '@hap/core';

const TTL_OPTIONS = [
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '2h', seconds: 7200 },
  { label: '4h', seconds: 14400 },
  { label: '8h', seconds: 28800 },
  { label: '24h', seconds: 86400 },
];

interface Props {
  item: PendingItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function ExtendAuthModal({ item, onClose, onSuccess }: Props) {
  const { user, activeDomain } = useAuth();
  const [selectedTTL, setSelectedTTL] = useState(1800);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const boundsEntries = Object.entries(item.frame)
    .filter(([k]) => k !== 'profile' && k !== 'path');

  const handleExtend = async () => {
    if (!user) return;
    setSubmitting(true);
    setError('');

    try {
      // 1. Fetch gate content from MCP
      const gateEntry: GateContentEntry | null = await spClient.getGateContent(item.path);
      if (!gateEntry) {
        throw new Error('Gate content not found locally. The MCP server may have restarted. Please re-authorize through the full wizard instead.');
      }

      // 2. Fetch profile schema
      const profile: AgentProfile = await spClient.getProfile(item.profile_id);

      // 3. Recompute hashes
      const bounds = item.frame;
      const context = gateEntry.context ?? {};
      const domain = item.attested_domains[0] || activeDomain || 'owner';

      const boundsHash = await computeBoundsHashBrowser(bounds, profile);
      const contextHash = await computeContextHashBrowser(context, profile);

      const [problemHash, objectiveHash, tradeoffsHash, ecHash] = await Promise.all([
        hashGateContent(gateEntry.gateContent.problem),
        hashGateContent(gateEntry.gateContent.objective),
        hashGateContent(gateEntry.gateContent.tradeoffs),
        hashGateContent(JSON.stringify({
          profile: item.profile_id,
          path: item.path,
          domain,
        })),
      ]);

      // 4. Re-attest with new TTL
      const result = await spClient.attest({
        profile_id: item.profile_id,
        path: item.path,
        bounds,
        bounds_hash: boundsHash,
        context_hash: contextHash,
        domain,
        did: user.did,
        gate_content_hashes: { problem: problemHash, objective: objectiveHash, tradeoffs: tradeoffsHash },
        execution_context_hash: ecHash,
        ttl: selectedTTL,
      });

      // 5. Push gate content to MCP
      await spClient.pushGateContent({
        boundsHash: result.bounds_hash ?? boundsHash,
        contextHash,
        context,
        path: item.path,
        gateContent: gateEntry.gateContent,
      });

      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extension failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Extend Authorization</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
              {profileDisplayName(item.profile_id)} / {item.path}
            </div>
            {boundsEntries.length > 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                {boundsEntries.map(([k, v]) => `${k}=${v}`).join(' \u00B7 ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Duration
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {TTL_OPTIONS.map(opt => (
                <button
                  key={opt.seconds}
                  className={`btn ${selectedTTL === opt.seconds ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedTTL(opt.seconds)}
                  style={{ minWidth: '3.5rem' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
            Same bounds, context, and gate content will be re-attested with a new TTL.
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handleExtend} disabled={submitting}>
            {submitting ? 'Extending...' : 'Extend'}
          </button>
        </div>
      </div>
    </div>
  );
}
