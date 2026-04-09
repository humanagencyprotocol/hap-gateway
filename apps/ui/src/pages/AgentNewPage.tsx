import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type ProfileSummary, type IntegrationManifest, type McpIntegrationStatus } from '../lib/sp-client';
import { profileDisplayName } from '../lib/profile-display';

export function AgentNewPage() {
  const navigate = useNavigate();
  const { group, groupId, domain } = useAuth();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [manifests, setManifests] = useState<IntegrationManifest[]>([]);
  const [integrations, setIntegrations] = useState<McpIntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamProfiles, setTeamProfiles] = useState<Record<string, Record<string, string[]>>>({});

  useEffect(() => {
    Promise.all([
      spClient.listProfiles().catch(() => []),
      spClient.getIntegrationManifests().then(d => d.manifests ?? []).catch(() => []),
      spClient.getMcpHealth().then(h => h.integrations ?? []).catch(() => []),
      groupId ? spClient.getTeamProfileConfig(groupId).catch(() => ({})) : Promise.resolve({}),
    ]).then(([profileList, manifestList, integrationList, teamConfig]) => {
      setProfiles(profileList);
      setManifests(manifestList);
      setIntegrations(integrationList);
      setTeamProfiles(teamConfig as Record<string, Record<string, string[]>>);
    }).finally(() => setLoading(false));
  }, [groupId]);

  // Build profile -> manifest/integration lookup
  const profileManifestMap = new Map<string, IntegrationManifest>();
  const profileIntegrationMap = new Map<string, McpIntegrationStatus>();
  for (const m of manifests) {
    if (m.profile) profileManifestMap.set(m.profile, m);
  }
  for (const i of integrations) {
    const manifest = manifests.find(m => m.id === i.id);
    if (manifest?.profile) profileIntegrationMap.set(manifest.profile, i);
  }

  // Only show profiles that have a manifest
  const visibleProfiles = profiles.filter(p => {
    const shortId = p.id.replace(/@.*$/, '').split('/').pop() ?? p.id;
    return profileManifestMap.has(shortId);
  });

  const isTeamManaged = (profileId: string): boolean => {
    return profileId in teamProfiles && Object.keys(teamProfiles[profileId]).length > 0;
  };

  const handleCreate = (profileId: string) => {
    // v0.4: every attestation requires a group_id. In personal mode this is
    // the user's auto-provisioned personal group; in team mode it's the
    // currently active team group. The flag below is only used for UI
    // labeling — the SP runs the same checks for both.
    if (!groupId) {
      // Should not happen — AuthContext sets the personal group on login.
      console.error('No active group when creating authorization');
      return;
    }
    const isTeam = isTeamManaged(profileId);
    sessionStorage.setItem('agentAuth', JSON.stringify({
      profileId,
      groupId,
      groupName: group?.name ?? null,
      domain,
      isTeam,
    }));
    navigate('/agent/gate');
  };

  return (
    <>
      <style>{`
        .profile-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; align-items: stretch; }
        .profile-grid .card { display: flex; flex-direction: column; height: 100%; margin-top: 0 !important; }
        @media (max-width: 900px) { .profile-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .profile-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div className="page-header">
        <h1 className="page-title">Authorize</h1>
        <p className="page-subtitle">What should your agent be able to do? Set limits, express your intent, then authorize.</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Loading...</p>
      ) : visibleProfiles.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            No integrations set up yet. Connect a service first.
          </p>
          <Link to="/integrations" className="btn btn-primary btn-sm">Go to Integrations</Link>
        </div>
      ) : (
        <div className="profile-grid">
          {visibleProfiles.map(p => {
            const isTeam = isTeamManaged(p.id);
            const shortId = p.id.replace(/@.*$/, '').split('/').pop() ?? p.id;
            const manifest = profileManifestMap.get(shortId);
            const integration = profileIntegrationMap.get(shortId);
            const isRunning = integration?.running === true;

            return (
              <div className="card" key={p.id} style={!isRunning ? { opacity: 0.7 } : undefined}>
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
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '1rem', flex: 1 }}>
                  {p.description}
                </p>

                {isRunning ? (
                  <button className="btn btn-primary btn-sm" onClick={() => handleCreate(p.id)}>
                    Authorize
                  </button>
                ) : (
                  <Link
                    to={`/integrations?setup=${manifest?.id ?? ''}`}
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', textAlign: 'center' }}
                  >
                    Set up {manifest?.name ?? 'integration'}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
