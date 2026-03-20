import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type ProfileSummary } from '../lib/sp-client';
import { StepIndicator } from '../components/StepIndicator';
import { GroupSelector } from '../components/GroupSelector';
import { SelectionCard } from '../components/SelectionCard';
import { DomainBadge } from '../components/DomainBadge';
import { profileDisplayName } from '../lib/profile-display';

export function AgentNewPage() {
  const navigate = useNavigate();
  const { activeGroup, activeDomain } = useAuth();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    spClient.listProfiles()
      .then(setProfiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeProfile = profiles.find(p => p.id === selectedProfile);
  const paths = activeProfile?.paths || [];

  useEffect(() => {
    if (paths.length === 1) setSelectedPath(paths[0]);
  }, [selectedProfile, paths.length]);

  const handleContinue = () => {
    if (!selectedProfile || !selectedPath) return;
    // Store in sessionStorage for gate wizard
    sessionStorage.setItem('agentAuth', JSON.stringify({
      profileId: selectedProfile,
      path: selectedPath,
      groupId: activeGroup?.id,
      groupName: activeGroup?.name,
      domain: activeDomain,
    }));
    navigate('/agent/gate');
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">New Agent Authorization</h1>
        <p className="page-subtitle">Select what your agent is allowed to do, define the bounds, then attest.</p>
      </div>

      <GroupSelector />

      <StepIndicator currentStep={1} />

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Choose Profile &amp; Path</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          A profile defines the type of agent action. A path specifies which domains must attest.
          Only profiles matching your domain are shown.
        </p>

        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Loading profiles...</p>
        ) : profiles.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>No profiles available for your domain.</p>
        ) : (
          <div className="selection-grid">
            {profiles.map(p => (
              <SelectionCard
                key={p.id}
                selected={selectedProfile === p.id}
                onClick={() => { setSelectedProfile(p.id); setSelectedPath(''); }}
              >
                <div className="selection-card-title">{profileDisplayName(p.id, p.name)}</div>
                <div className="selection-card-subtitle">{p.description}</div>
                <div className="selection-card-id">{p.id}</div>
                <div className="selection-card-meta">
                  {p.paths.map(path => (
                    <DomainBadge key={path} domain={path} />
                  ))}
                </div>
              </SelectionCard>
            ))}
          </div>
        )}

        {selectedProfile && paths.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <label className="form-label">Execution Path</label>
            <select
              className="form-select"
              value={selectedPath}
              onChange={e => setSelectedPath(e.target.value)}
              style={{ maxWidth: '20rem' }}
            >
              <option value="">Select a path...</option>
              {paths.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div className="form-hint">Determines which domain owners need to attest.</div>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleContinue}
            disabled={!selectedProfile || !selectedPath}
          >
            Continue to Bounds
          </button>
        </div>
      </div>
    </>
  );
}
