import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type ProfileSummary } from '../lib/sp-client';
import { profileDisplayName } from '../lib/profile-display';

export function AgentNewPage() {
  const navigate = useNavigate();
  const { group, groupId, domain } = useAuth();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamProfiles, setTeamProfiles] = useState<Record<string, Record<string, string[]>>>({});

  useEffect(() => {
    Promise.all([
      spClient.listProfiles().catch(() => []),
      groupId ? spClient.getTeamProfileConfig(groupId).catch(() => ({})) : Promise.resolve({}),
    ]).then(([profileList, teamConfig]) => {
      setProfiles(profileList);
      setTeamProfiles(teamConfig as Record<string, Record<string, string[]>>);
    }).finally(() => setLoading(false));
  }, [groupId]);

  const isTeamManaged = (profileId: string): boolean => {
    return profileId in teamProfiles && Object.keys(teamProfiles[profileId]).length > 0;
  };

  const handleCreate = (profileId: string) => {
    const isTeam = isTeamManaged(profileId);
    sessionStorage.setItem('agentAuth', JSON.stringify({
      profileId,
      groupId: isTeam ? groupId : null,
      groupName: isTeam ? group?.name : null,
      domain,
    }));
    navigate('/agent/gate');
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Authorize</h1>
        <p className="page-subtitle">What should your agent be able to do? Set limits, express your intent, then authorize.</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Loading...</p>
      ) : profiles.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>No profiles available.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {profiles.map(p => {
            const isTeam = isTeamManaged(p.id);

            return (
              <div className="card" key={p.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.125rem' }}>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    {profileDisplayName(p.id, p.name)}
                  </h3>
                  {isTeam ? (
                    <span style={{
                      fontSize: '0.6rem', padding: '0.1rem 0.35rem', borderRadius: '0.2rem',
                      background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 600,
                    }}>Team</span>
                  ) : (
                    <span style={{
                      fontSize: '0.6rem', padding: '0.1rem 0.35rem', borderRadius: '0.2rem',
                      background: 'var(--bg-main)', color: 'var(--text-tertiary)', fontWeight: 600,
                      border: '1px solid var(--border)',
                    }}>Personal</span>
                  )}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
                  {p.description}
                </p>

                <button className="btn btn-primary btn-sm" onClick={() => handleCreate(p.id)}>
                  Authorize
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
