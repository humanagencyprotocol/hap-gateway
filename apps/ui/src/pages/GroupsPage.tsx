import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type SPGroup } from '../lib/sp-client';
import { DomainBadge } from '../components/DomainBadge';

interface GroupDetail {
  id: string;
  name: string;
  members: Array<{
    id: string;
    name: string;
    email: string;
    domains: string[];
    role: string;
  }>;
  inviteCode?: string;
}

export function GroupsPage() {
  const { groups, setActiveContext, activeGroup, refreshGroups } = useAuth();
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const selectedGroup = activeGroup || (groups.length > 0 ? groups[0] : null);

  useEffect(() => {
    if (!selectedGroup) return;
    spClient.getGroupById(selectedGroup.id)
      .then(raw => {
        // SP returns { group, members, isAdmin } — normalize it
        const g = (raw as any).group || raw;
        const rawMembers = (raw as any).members || g.members || [];
        const members = rawMembers.map((m: any) => ({
          id: m.userId || m.id || '',
          name: m.name || m.userId?.slice(0, 8) || 'Member',
          email: m.email || '',
          domains: m.domains || [],
          role: m.role || ((raw as any).isAdmin && m.userId === g.createdBy ? 'admin' : 'member'),
        }));
        setGroupDetail({ id: g.id, name: g.name, members, inviteCode: g.inviteCode });
        setInviteCode(g.inviteCode || '');
      })
      .catch(() => {});
  }, [selectedGroup?.id]);

  const handleGenerateInvite = async () => {
    if (!selectedGroup) return;
    setLoading(true);
    try {
      const result = await spClient.inviteToGroup(selectedGroup.id);
      setInviteCode(result.inviteCode || result.code || '');
      setSuccessMsg('Invite code generated!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate invite');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      await spClient.joinGroup(joinCode.trim());
      await refreshGroups();
      setSuccessMsg('Joined team!');
      setJoinCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join team');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setLoading(true);
    setError('');
    try {
      await spClient.createGroup(name);
      await refreshGroups();
      setSuccessMsg(`Created ${name}!`);
      setNewGroupName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteCode);
    setSuccessMsg('Copied to clipboard!');
    setTimeout(() => setSuccessMsg(''), 2000);
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Manage your team and role assignments.</p>
        </div>
        <button className="btn btn-primary" onClick={() => document.getElementById('create-group-section')?.scrollIntoView({ behavior: 'smooth' })}>
          Create Team
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Active Group */}
      {selectedGroup && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <div>
              <h3 className="card-title">{selectedGroup.name}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                {groupDetail?.members?.length || 0} members {selectedGroup.isAdmin && ' \u00B7 You are admin'}
              </p>
            </div>
            <span className="status-badge status-active">Active</span>
          </div>

          {/* Invite code */}
          {inviteCode ? (
            <div style={{ background: 'var(--accent-subtle)', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Invite code:</span>
              <code style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>{inviteCode}</code>
              <button className="btn btn-ghost btn-sm" onClick={copyInvite}>Copy</button>
            </div>
          ) : selectedGroup.isAdmin ? (
            <button className="btn btn-secondary btn-sm" onClick={handleGenerateInvite} disabled={loading} style={{ marginBottom: '1rem' }}>
              Generate Invite Code
            </button>
          ) : null}

          {/* Member list */}
          {groupDetail?.members?.map(member => (
            <div className="member-row" key={member.id}>
              <div className="member-avatar">
                {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="member-info">
                <div className="member-name">{member.name}</div>
                <div className="member-email">{member.email}</div>
              </div>
              <div className="member-domains">
                {member.domains.map(d => (
                  <DomainBadge key={d} domain={d} />
                ))}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{member.role}</span>
            </div>
          ))}
        </div>
      )}

      {/* Join Another Group */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h4 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Join Another Team</h4>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Enter an invite code from a team admin.
        </p>
        <div className="invite-input-row">
          <input
            className="form-input"
            placeholder="Paste invite code..."
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            style={{ fontFamily: "'SF Mono', Monaco, monospace", fontSize: '0.85rem' }}
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={handleJoin} disabled={loading}>Join</button>
        </div>
      </div>

      {/* Create Group */}
      <div className="card" id="create-group-section">
        <h4 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Create a New Team</h4>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Start a new team and invite members.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className="form-input"
            placeholder="Team name (e.g., Acme Corp)"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ flex: 1 }}
            disabled={loading}
          />
          <button className="btn btn-secondary" onClick={handleCreate} disabled={loading}>Create</button>
        </div>
      </div>
    </>
  );
}
