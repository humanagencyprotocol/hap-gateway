import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type ProfileSummary, type PendingItem } from '../lib/sp-client';
import { profileDisplayName } from '../lib/profile-display';
import type { AgentProfile } from '@hap/core';

interface PathStatus {
  active: number;
  expired: number;
}

function getPathStatuses(attestations: PendingItem[]): Map<string, PathStatus> {
  const map = new Map<string, PathStatus>();
  for (const a of attestations) {
    const key = `${a.profile_id}::${a.path}`;
    const existing = map.get(key) ?? { active: 0, expired: 0 };
    if (a.remaining_seconds !== null && a.remaining_seconds > 0 && a.missing_domains.length === 0) {
      existing.active++;
    } else if (a.remaining_seconds === null || a.remaining_seconds <= 0) {
      existing.expired++;
    }
    map.set(key, existing);
  }
  return map;
}

export function AgentNewPage() {
  const navigate = useNavigate();
  const { group, groupId, domain } = useAuth();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullProfiles, setFullProfiles] = useState<Map<string, AgentProfile>>(new Map());
  const [pathStatuses, setPathStatuses] = useState<Map<string, PathStatus>>(new Map());
  const [teamProfiles, setTeamProfiles] = useState<Record<string, Record<string, string[]>>>({});
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      spClient.listProfiles().catch(() => []),
      spClient.getMyAttestations().catch(() => []),
      groupId ? spClient.getTeamProfileConfig(groupId).catch(() => ({})) : Promise.resolve({}),
    ]).then(([profileList, attestations, teamConfig]) => {
      setProfiles(profileList);
      setPathStatuses(getPathStatuses(attestations));
      setTeamProfiles(teamConfig as Record<string, Record<string, string[]>>);

      Promise.all(
        profileList.map(p =>
          spClient.getProfile(p.id)
            .then(full => [p.id, full] as const)
            .catch(() => null)
        )
      ).then(results => {
        const map = new Map<string, AgentProfile>();
        for (const r of results) if (r) map.set(r[0], r[1]);
        setFullProfiles(map);
      });
    }).finally(() => setLoading(false));
  }, [groupId]);

  const isTeamManaged = (profileId: string): boolean => {
    return profileId in teamProfiles && Object.keys(teamProfiles[profileId]).length > 0;
  };

  const getRequiredRoles = (profileId: string, path: string): string[] => {
    return teamProfiles[profileId]?.[path] ?? [];
  };

  const handleCreate = (profileId: string, path: string) => {
    const isTeam = isTeamManaged(profileId);
    sessionStorage.setItem('agentAuth', JSON.stringify({
      profileId,
      path,
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
            const full = fullProfiles.get(p.id);
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

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {p.paths.map(path => {
                    const key = `${p.id}::${path}`;
                    const status = pathStatuses.get(key);
                    const active = status?.active ?? 0;
                    const expired = status?.expired ?? 0;
                    const isExpanded = expandedPath === key;
                    const roles = getRequiredRoles(p.id, path);

                    let dotColor: string;
                    let borderColor: string;
                    let bg: string;
                    if (active > 0) {
                      dotColor = 'var(--success)';
                      borderColor = 'var(--success)';
                      bg = 'var(--success-subtle)';
                    } else if (expired > 0) {
                      dotColor = 'var(--danger)';
                      borderColor = 'var(--danger)';
                      bg = 'var(--danger-subtle)';
                    } else {
                      dotColor = 'var(--warning)';
                      borderColor = 'var(--warning)';
                      bg = 'transparent';
                    }

                    let label = path;
                    if (active > 0) label += ` (${active})`;
                    else if (expired > 0) label += ` (${expired} expired)`;

                    return (
                      <div key={path}>
                        <button
                          onClick={() => setExpandedPath(isExpanded ? null : key)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.35rem 0.7rem',
                            border: `1px solid ${borderColor}`, borderRadius: '0.375rem',
                            background: isExpanded ? bg : 'transparent',
                            cursor: 'pointer', fontSize: '0.8rem',
                            color: 'var(--text-primary)', fontFamily: 'inherit',
                          }}
                        >
                          <span style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                          {label}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Expanded path detail */}
                {expandedPath?.startsWith(`${p.id}::`) && (() => {
                  const path = expandedPath.split('::')[1];
                  const desc = full?.executionPaths?.[path]?.description;
                  const status = pathStatuses.get(expandedPath);
                  const active = status?.active ?? 0;
                  const expired = status?.expired ?? 0;
                  const roles = getRequiredRoles(p.id, path);

                  return (
                    <div style={{
                      marginTop: '0.75rem', padding: '0.75rem',
                      background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '0.5rem',
                    }}>
                      {desc && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{desc}</p>
                      )}

                      {roles.length > 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                          Requires: {roles.join(', ')}
                        </p>
                      )}

                      {active > 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginBottom: '0.5rem' }}>
                          {active} active authorization{active > 1 ? 's' : ''}
                        </p>
                      )}

                      {expired > 0 && (
                        <p style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                          <Link to="/authorizations" style={{ color: 'var(--danger)', textDecoration: 'underline' }}>
                            {expired} expired
                          </Link>
                        </p>
                      )}

                      <button className="btn btn-primary btn-sm" onClick={() => handleCreate(p.id, path)}>
                        {expired > 0 && active === 0 ? 'Renew' : 'Authorize'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
