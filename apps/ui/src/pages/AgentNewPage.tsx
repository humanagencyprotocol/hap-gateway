import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type ProfileSummary, type IntegrationManifest, type McpIntegrationStatus, type AuthTemplate } from '../lib/sp-client';
import { profileDisplayName } from '../lib/profile-display';

export function AgentNewPage() {
  const navigate = useNavigate();
  const { group, groupId, domain } = useAuth();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [manifests, setManifests] = useState<IntegrationManifest[]>([]);
  const [integrations, setIntegrations] = useState<McpIntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamProfiles, setTeamProfiles] = useState<Record<string, Record<string, string[]>>>({});
  const [modalProfile, setModalProfile] = useState<{ profileId: string; manifest: IntegrationManifest } | null>(null);

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

  const storeAuthAndNavigate = (profileId: string, template?: AuthTemplate) => {
    if (!groupId) {
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
    if (template) {
      sessionStorage.setItem('agentGate', JSON.stringify({
        bounds: template.bounds,
        context: template.context,
        gateContent: { intent: template.intent },
        ttlConfig: { max: template.ttl },
        templateMode: template.mode,
        templateTtl: template.ttl,
      }));
    } else {
      sessionStorage.removeItem('agentGate');
    }
    setModalProfile(null);
    navigate('/agent/gate');
  };

  const handleCreate = (profileId: string) => {
    if (!groupId) {
      console.error('No active group when creating authorization');
      return;
    }
    // Find the manifest for this profile to check for templates
    const shortId = profileId.replace(/@.*$/, '').split('/').pop() ?? profileId;
    const manifest = profileManifestMap.get(shortId);

    if (manifest?.templates && manifest.templates.length > 0) {
      setModalProfile({ profileId, manifest });
    } else {
      storeAuthAndNavigate(profileId);
    }
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

      {/* Template / Custom modal */}
      {modalProfile && (
        <div className="modal-backdrop" onClick={() => setModalProfile(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Set up {modalProfile.manifest.name} authorization</h2>
              <button className="modal-close" onClick={() => setModalProfile(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {/* Quick start templates */}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 600 }}>
                Quick start
              </p>
              <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: `repeat(${Math.min(modalProfile.manifest.templates!.length, 3)}, 1fr)` }}>
                {modalProfile.manifest.templates!.map((tpl) => (
                  <button
                    key={tpl.name}
                    className="template-card"
                    onClick={() => storeAuthAndNavigate(modalProfile.profileId, tpl)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                      <span className={`template-mode template-mode-${tpl.mode === 'automatic' ? 'auto' : 'review'}`}>
                        {tpl.mode === 'automatic' ? 'Auto' : 'Review'}
                      </span>
                      <span className="template-risk" data-risk={tpl.risk}>{tpl.risk}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      {tpl.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.5rem' }}>
                      {tpl.description}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {tpl.tags.map(tag => (
                        <span key={tag} className="template-tag">{tag}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              {/* OR divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>

              {/* Custom option */}
              <button
                className="btn btn-primary"
                style={{ width: '100%', textAlign: 'center', padding: '0.75rem' }}
                onClick={() => storeAuthAndNavigate(modalProfile.profileId)}
              >
                Custom — define your own limits and scope
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
