import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient } from '../lib/sp-client';
import { computeFrameHashBrowser, hashGateContent } from '../lib/frame';
import { StepIndicator } from '../components/StepIndicator';
import { DomainBadge } from '../components/DomainBadge';
import type { AgentProfile, AgentFrameParams } from '@hap/core';

interface GateData {
  frame: AgentFrameParams;
  gateContent: { problem: string; objective: string; tradeoffs: string };
}

interface AuthData {
  profileId: string;
  path: string;
  groupId?: string;
  groupName?: string;
  domain: string;
}

export function AgentReviewPage() {
  const navigate = useNavigate();
  const { user, activeGroup, activeDomain } = useAuth();
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [gateData, setGateData] = useState<GateData | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ frameHash: string; status: string } | null>(null);

  useEffect(() => {
    const authStored = sessionStorage.getItem('agentAuth');
    const gateStored = sessionStorage.getItem('agentGate');
    if (!authStored || !gateStored) { navigate('/agent/new'); return; }

    const auth: AuthData = JSON.parse(authStored);
    const gate: GateData = JSON.parse(gateStored);
    setAuthData(auth);
    setGateData(gate);

    spClient.getProfile(auth.profileId)
      .then(p => setProfile(p))
      .catch(() => {});
  }, [navigate]);

  const handleCommit = async () => {
    if (!authData || !gateData || !profile || !user) return;
    setSubmitting(true);
    setError('');
    try {
      const domain = authData.domain || activeDomain;
      const frameHash = await computeFrameHashBrowser(gateData.frame, profile);

      const [problemHash, objectiveHash, tradeoffsHash, ecHash] = await Promise.all([
        hashGateContent(gateData.gateContent.problem),
        hashGateContent(gateData.gateContent.objective),
        hashGateContent(gateData.gateContent.tradeoffs),
        hashGateContent(JSON.stringify({
          profile: authData.profileId,
          path: authData.path,
          domain,
          group: authData.groupId,
        })),
      ]);

      // Push gate content to MCP server via control plane
      await fetch('/gate-content', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameHash,
          path: authData.path,
          gateContent: gateData.gateContent,
        }),
      });

      const result = await spClient.attest({
        profile_id: authData.profileId,
        path: authData.path,
        frame: gateData.frame,
        domain,
        did: user.did,
        gate_content_hashes: { problem: problemHash, objective: objectiveHash, tradeoffs: tradeoffsHash },
        execution_context_hash: ecHash,
        group_id: authData.groupId,
        ttl: 1800,
      });

      setSuccess({ frameHash: result.frame_hash, status: result.status });
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
        <div className="success-card-title">Attestation Committed</div>
        <div className="success-card-hash">{success.frameHash}</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Status: <strong>{success.status}</strong>
          {success.status === 'pending' && ' — waiting for other domain owners to attest'}
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const frame = gateData.frame;
  const boundsEntries = Object.entries(frame).filter(([k]) => k !== 'profile' && k !== 'path');

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
          <dd>{authData.profileId}</dd>
          <dt>Path</dt>
          <dd>{authData.path}</dd>
          <dt>Domain</dt>
          <dd>{authData.domain || activeDomain}</dd>
          {authData.groupName && (
            <>
              <dt>Group</dt>
              <dd>{authData.groupName}</dd>
            </>
          )}
          <dt>TTL</dt>
          <dd>30 minutes</dd>
          {boundsEntries.map(([k, v]) => (
            <span key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </span>
          ))}
        </dl>

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

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/agent/gate')}>Back</button>
          <button
            className="btn btn-primary btn-lg"
            style={{ flex: 1 }}
            onClick={handleCommit}
            disabled={submitting}
          >
            {submitting ? 'Signing...' : 'Commit \u2014 Sign Attestation'}
          </button>
        </div>

        {activeGroup && (
          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            This attestation may be pending until other required domain owners also attest.
          </div>
        )}
      </div>
    </>
  );
}
