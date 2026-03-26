import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopNav } from '../components/TopNav';
import { useAuth } from '../contexts/AuthContext';
import { spClient } from '../lib/sp-client';

/**
 * Onboarding — only shown in team mode when user hasn't joined a group yet.
 * Personal mode skips onboarding entirely (AuthGuard sends to dashboard).
 */
export function OnboardingPage() {
  const { setActiveContext } = useAuth();
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await spClient.joinGroup(inviteCode.trim());
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
        <div style={{ maxWidth: '30rem', margin: '3rem auto', padding: '0 1rem' }}>

          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Join Your Team</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Join an existing team or create a new one to share authority across domains.
            </p>
          </div>

          {error && <div className="error-message">{error}</div>}

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
