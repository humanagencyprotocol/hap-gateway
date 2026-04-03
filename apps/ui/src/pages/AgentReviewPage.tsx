import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient } from '../lib/sp-client';
import { computeBoundsHashBrowser, computeContextHashBrowser, hashGateContent } from '../lib/frame';
import { StepIndicator } from '../components/StepIndicator';
import { DomainBadge } from '../components/DomainBadge';
import { profileDisplayName } from '../lib/profile-display';
import type { AgentProfile, AgentBoundsParams, AgentContextParams, AgentFrameParams } from '@hap/core';

interface GateData {
  bounds: AgentBoundsParams;
  context: AgentContextParams;
  gateContent: { problem: string; objective: string; tradeoffs: string };
  // Keep frame for backward compat with existing session storage
  frame?: AgentFrameParams;
}

interface AuthData {
  profileId: string;
  groupId?: string;
  groupName?: string;
  domain: string;
}

export function AgentReviewPage() {
  const navigate = useNavigate();
  const { user, mode, domain: authDomain } = useAuth();
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [gateData, setGateData] = useState<GateData | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [commitMode, setCommitMode] = useState<'immediate' | 'per-action'>('immediate');
  const [ttlSeconds, setTtlSeconds] = useState(1800);
  const [ttlMax, setTtlMax] = useState(86400);
  const [customTtl, setCustomTtl] = useState('');
  const [customTtlUnit, setCustomTtlUnit] = useState<'hours' | 'days'>('hours');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ frameHash: string; status: string; commitment: string } | null>(null);

  useEffect(() => {
    const authStored = sessionStorage.getItem('agentAuth');
    const gateStored = sessionStorage.getItem('agentGate');
    if (!authStored || !gateStored) { navigate('/agent/new'); return; }

    const auth: AuthData = JSON.parse(authStored);
    const gate = JSON.parse(gateStored);

    // Normalize stored gate data: support both v0.3 (frame) and v0.4 (bounds/context)
    const normalizedGate: GateData = {
      bounds: gate.bounds ?? gate.frame ?? {},
      context: gate.context ?? {},
      gateContent: gate.gateContent,
      frame: gate.frame,
    };

    setAuthData(auth);
    setGateData(normalizedGate);

    // Set TTL from profile config
    if (gate.ttlConfig) {
      setTtlSeconds(gate.ttlConfig.default ?? 1800);
      setTtlMax(gate.ttlConfig.max ?? 86400);
    }

    spClient.getProfile(auth.profileId)
      .then(p => setProfile(p))
      .catch(() => {});
  }, [navigate]);

  const handleCommit = async () => {
    if (!authData || !gateData || !profile || !user) return;
    setSubmitting(true);
    setError('');
    try {
      // Personal mode (no group): use "owner" as domain. Group mode: use assigned domain.
      const domain = authData.domain || authDomain;

      const boundsHash = await computeBoundsHashBrowser(gateData.bounds, profile);
      const contextHash = await computeContextHashBrowser(gateData.context, profile);

      const [problemHash, objectiveHash, tradeoffsHash, ecHash] = await Promise.all([
        hashGateContent(gateData.gateContent.problem),
        hashGateContent(gateData.gateContent.objective),
        hashGateContent(gateData.gateContent.tradeoffs),
        hashGateContent(JSON.stringify({
          profile: authData.profileId,
          domain,
          group: authData.groupId,
        })),
      ]);

      // Attest (creates the attestation on SP)
      const result = await spClient.attest({
        profile_id: authData.profileId,
        bounds: gateData.bounds,
        bounds_hash: boundsHash,
        context_hash: contextHash,
        domain,
        did: user.did,
        gate_content_hashes: { problem: problemHash, objective: objectiveHash, tradeoffs: tradeoffsHash },
        execution_context_hash: ecHash,
        group_id: authData.groupId,
        ttl: ttlSeconds,
        defer_commitment: commitMode === 'per-action',
      });

      // Push gate content + context to MCP server (after attestation exists on SP)
      await spClient.pushGateContent({
        boundsHash: result.bounds_hash ?? boundsHash,
        contextHash,
        context: gateData.context,
        gateContent: gateData.gateContent,
      });

      setSuccess({
        frameHash: result.bounds_hash ?? result.frame_hash ?? boundsHash,
        status: result.status,
        commitment: commitMode === 'per-action' ? 'per-action' : 'immediate',
      });
      sessionStorage.removeItem('agentAuth');
      sessionStorage.removeItem('agentGate');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Attestation failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!authData || !gateData) {
    return <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>;
  }

  if (success) {
    return (
      <div className="success-card">
        <div className="success-card-title">Authorization Created</div>
        <div className="success-card-hash">{success.frameHash}</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Status: <strong>{success.status}</strong>
          {success.status === 'pending' && ' — waiting for other domain owners to attest'}
          {success.commitment === 'per-action' && (
            <div style={{ marginTop: '0.5rem' }}>
              Commitment: <strong>Review Mode</strong> — you will review and commit to each agent action individually.
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const boundsEntries = Object.entries(gateData.bounds).filter(([k]) => k !== 'profile' && k !== 'path');
  const contextEntries = Object.entries(gateData.context);

  return (
    <>
      <StepIndicator currentStep={6} />

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Review &amp; Commit</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Review your authorization details before signing.
        </p>

        {error && <div className="error-message">{error}</div>}

        <dl className="review-grid">
          <dt>Profile</dt>
          <dd>
            {profileDisplayName(authData.profileId)}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>{authData.profileId}</div>
          </dd>
          <dt>Domain</dt>
          <dd>{authData.domain || authDomain}</dd>
          {authData.groupName && (
            <>
              <dt>Group</dt>
              <dd>{authData.groupName}</dd>
            </>
          )}
          <dt>TTL</dt>
          <dd>30 minutes</dd>
        </dl>

        {boundsEntries.length > 0 && (
          <>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '1rem', marginBottom: '0.25rem' }}>
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

        {contextEntries.length > 0 && (
          <>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '1rem', marginBottom: '0.25rem' }}>
              Context
            </div>
            <dl className="review-grid">
              {contextEntries.map(([k, v]) => (
                <span key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </span>
              ))}
            </dl>
          </>
        )}

        <div className="gate-content-block">
          <div className="gate-content-item">
            <div className="gate-content-label">Problem</div>
            <div className="gate-content-text">{gateData.gateContent.problem}</div>
          </div>
          <div className="gate-content-item">
            <div className="gate-content-label">Objective</div>
            <div className="gate-content-text">{gateData.gateContent.objective}</div>
          </div>
          <div className="gate-content-item">
            <div className="gate-content-label">Tradeoffs</div>
            <div className="gate-content-text">{gateData.gateContent.tradeoffs}</div>
          </div>
        </div>

        {/* Commitment mode selection */}
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '1rem', marginBottom: '0.5rem' }}>
          Commitment
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setCommitMode('immediate')}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: commitMode === 'immediate' ? '2px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: commitMode === 'immediate' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Automatic</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Agent acts freely within your limits.
            </div>
          </button>
          <button
            onClick={() => setCommitMode('per-action')}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: commitMode === 'per-action' ? '2px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: commitMode === 'per-action' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Review Each Action</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              You review and approve each action before it executes.
            </div>
          </button>
        </div>

        {/* Duration selector */}
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
          Duration
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
          {[
            { label: '1 hour', seconds: 3600 },
            { label: '24 hours', seconds: 86400 },
            { label: '7 days', seconds: 604800 },
            { label: '30 days', seconds: 2592000 },
            { label: '1 year', seconds: 31536000 },
          ].filter(p => p.seconds <= ttlMax).map(preset => (
            <button
              key={preset.seconds}
              onClick={() => { setTtlSeconds(preset.seconds); setCustomTtl(''); }}
              style={{
                padding: '0.5rem 0.85rem',
                border: ttlSeconds === preset.seconds ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: '0.375rem',
                background: ttlSeconds === preset.seconds ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit',
                color: 'var(--text-primary)',
              }}
            >
              {preset.label}
            </button>
          ))}
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
            <input
              type="number"
              className="form-input"
              style={{ width: '5rem', padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
              placeholder="Custom"
              value={customTtl}
              onChange={e => {
                setCustomTtl(e.target.value);
                const num = parseInt(e.target.value, 10);
                if (num > 0) {
                  const secs = customTtlUnit === 'days' ? num * 86400 : num * 3600;
                  setTtlSeconds(Math.min(secs, ttlMax));
                }
              }}
            />
            <select
              className="form-input"
              style={{ padding: '0.45rem 0.5rem', fontSize: '0.85rem' }}
              value={customTtlUnit}
              onChange={e => {
                setCustomTtlUnit(e.target.value as 'hours' | 'days');
                const num = parseInt(customTtl, 10);
                if (num > 0) {
                  const secs = e.target.value === 'days' ? num * 86400 : num * 3600;
                  setTtlSeconds(Math.min(secs, ttlMax));
                }
              }}
            >
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
          {ttlSeconds > ttlMax && (
            <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
              Maximum: {ttlMax >= 86400 ? `${Math.floor(ttlMax / 86400)} days` : `${Math.floor(ttlMax / 3600)} hours`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/agent/gate')}>Back</button>
          <button
            className="btn btn-primary btn-lg"
            style={{ flex: 1 }}
            onClick={handleCommit}
            disabled={submitting}
          >
            {submitting ? 'Signing...' : commitMode === 'immediate' ? 'Authorize' : 'Authorize (Review Mode)'}
          </button>
        </div>

        {mode === 'team' && (
          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            This attestation may be pending until other required domain owners also attest.
          </div>
        )}
      </div>
    </>
  );
}
