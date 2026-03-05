import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopNav } from '../components/TopNav';
import { useAuth } from '../contexts/AuthContext';
import { spClient } from '../lib/sp-client';

export function OnboardingPage() {
  const { setActiveContext, refreshGroups } = useAuth();
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSingleDomain = () => {
    // Skip group selection — go straight to dashboard
    navigate('/');
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await spClient.joinGroup(inviteCode.trim());
      await refreshGroups();
      setActiveContext(result, result.myDomains[0] || '');
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await spClient.createGroup(groupName.trim());
      await refreshGroups();
      setActiveContext(result, result.myDomains[0] || '');
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TopNav />
      <div className="main-content no-sidebar" style={{ marginTop: 'var(--nav-height)' }}>
        <div style={{ maxWidth: '36rem', margin: '3rem auto', padding: '0 1rem' }}>

          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>How do you want to work?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '30rem', margin: '0 auto', lineHeight: 1.6 }}>
              HAP supports both solo and team workflows. Choose the mode that fits your use case.
            </p>
          </div>

          {error && <div className="error-message">{error}</div>}

          {/* Two paths */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
            <div className="selection-card" onClick={handleSingleDomain} style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{'\u25C8'}</div>
              <div className="selection-card-title" style={{ marginBottom: '0.375rem' }}>Single Domain</div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                You are the sole decision owner. Create attestations for profiles that require only one domain.
              </p>
              <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 500 }}>No group needed</span>
            </div>

            <div className="selection-card selected" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{'\u25C9'}</div>
              <div className="selection-card-title" style={{ marginBottom: '0.375rem' }}>Team (Group)</div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                Share authority across domains. Critical actions need sign-off from multiple domain owners (e.g. finance + compliance).
              </p>
              <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 500 }}>Recommended for production</span>
            </div>
          </div>

          {/* Join group */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Join an existing group</h4>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Ask your team admin for an invite code.
            </p>
            <div className="invite-input-row">
              <input
                className="form-input"
                placeholder="Paste invite code..."
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                style={{ fontFamily: "'SF Mono', Monaco, monospace", fontSize: '0.85rem' }}
                disabled={loading}
              />
              <button className="btn btn-primary" onClick={handleJoin} disabled={loading}>Join</button>
            </div>
          </div>

          {/* Create group */}
          <div className="card">
            <h4 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Create a new group</h4>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Start a new team and invite members. Assign domains after creation.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="form-input"
                placeholder="Group name (e.g., Acme Corp)"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                style={{ flex: 1 }}
                disabled={loading}
              />
              <button className="btn btn-secondary" onClick={handleCreate} disabled={loading}>Create</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
