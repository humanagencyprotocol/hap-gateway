import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { spClient, type IntegrationManifest, type McpIntegrationStatus } from '../lib/sp-client';

const ICON_MAP: Record<string, string> = {
  card: '\u{1F4B3}',
  mail: '\u2709\uFE0F',
};

interface Props {
  manifest: IntegrationManifest;
  integration: McpIntegrationStatus | undefined;
  onStatusChange: () => void;
  onSuccess: (msg: string) => void;
}

type CardState = 'unconfigured' | 'needs-oauth' | 'ready' | 'running';

export function IntegrationCard({ manifest, integration, onStatusChange, onSuccess }: Props) {
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [credConfigured, setCredConfigured] = useState(false);
  const [credsOnFile, setCredsOnFile] = useState(false); // vault has credentials stored
  const [oauthConnected, setOauthConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [activating, setActivating] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Check if credentials exist
    spClient.getCredential(manifest.id).then(status => {
      if (status.configured) {
        setCredConfigured(true);
        setCredsOnFile(true);
        // Check if OAuth token exists
        if (manifest.oauth) {
          setOauthConnected(status.fieldNames?.includes(manifest.oauth.tokenStorage) ?? false);
        }
      }
    }).catch(() => {/* ignore */});
  }, [manifest.id, manifest.oauth]);

  const cardState: CardState = (() => {
    if (integration?.running) return 'running';
    if (!credConfigured) return 'unconfigured';
    if (manifest.oauth && !oauthConnected) return 'needs-oauth';
    return 'ready';
  })();

  const saveCredentials = async () => {
    const hasValues = manifest.credentials.fields.some(f => credValues[f.key]?.trim());
    if (!hasValues) return;
    setSaving(true);
    try {
      await spClient.setCredential(manifest.id, credValues);
      setCredConfigured(true);
      setCredValues({});
      // Auto-start: if this integration doesn't need OAuth, activating now
      // skips the dead state where credentials are saved but nothing runs.
      if (!manifest.oauth) {
        onSuccess(`${manifest.name} credentials saved — starting integration...`);
        await activate();
      } else {
        onSuccess(`${manifest.name} credentials saved!`);
      }
    } catch {
      onSuccess(`Failed to save ${manifest.name} credentials`);
    } finally {
      setSaving(false);
    }
  };

  const startOAuth = () => {
    window.open(`/auth/oauth/${manifest.id}/start`, '_blank', 'width=600,height=700');
    const poll = setInterval(async () => {
      try {
        const cred = await spClient.getCredential(manifest.id);
        if (cred.configured && manifest.oauth && cred.fieldNames?.includes(manifest.oauth.tokenStorage)) {
          setOauthConnected(true);
          clearInterval(poll);
          onSuccess(`${manifest.name} connected — starting integration...`);
          // Auto-start after OAuth completes so the user doesn't have to click Start separately.
          await activate();
        }
      } catch { /* ignore */ }
    }, 2000);
    setTimeout(() => clearInterval(poll), 120000);
  };

  const activate = async () => {
    setActivating(true);
    try {
      const result = await spClient.activateIntegration(manifest.id);
      if (result.warning) {
        onSuccess(result.warning);
      } else {
        onSuccess(`${manifest.name} integration started with ${result.tools.length} tools`);
      }
      onStatusChange();
    } catch (err) {
      onSuccess(`Failed to start ${manifest.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActivating(false);
    }
  };

  const remove = async () => {
    try {
      await spClient.removeMcpIntegration(manifest.id);
      onSuccess(`${manifest.name} integration removed`);
      onStatusChange();
    } catch {
      onSuccess(`Failed to remove ${manifest.name}`);
    }
  };

  const icon = ICON_MAP[manifest.icon] ?? '\u{1F527}';

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <h3 className="card-title" style={{ margin: 0 }}>{manifest.name}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {manifest.description}
          </p>
        </div>
        {manifest.profile && <span className="profile-badge">{manifest.profile}</span>}
      </div>

      {/* Setup Guide (collapsible) */}
      {manifest.setupGuide && manifest.setupGuide.length > 0 && cardState !== 'running' && (
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            onClick={() => setShowGuide(!showGuide)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: '0.8rem',
              color: 'var(--accent)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <span style={{ transition: 'transform 0.2s', transform: showGuide ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>{'\u25B6'}</span>
            How to set up {manifest.name}
          </button>
          {showGuide && (
            <div style={{ marginTop: '0.75rem', paddingLeft: '0.25rem' }}>
              {manifest.setupGuide.map((step: { title: string; description: string; link?: string }, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    background: 'var(--border)',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: '0.1rem',
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.125rem' }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {step.description}
                      {step.link && (
                        <>
                          {' '}
                          <a href={step.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem' }}>
                            Open {'\u2197'}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Running state */}
      {cardState === 'running' && integration && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="service-status service-status-connected">
              <span className="service-status-dot" />
              Running ({integration.toolCount} tools)
            </div>
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--danger)' }}
              onClick={remove}
              title="Stops the subprocess and removes the integration from the registry. It will NOT auto-start on next gateway restart. Re-enable with Install."
            >
              Disable
            </button>
          </div>

          {/* Link to authorize */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <Link to="/agent/new" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
              Authorize your agent
            </Link>
          </div>
        </>
      )}

      {/* Unconfigured state — show credential form */}
      {cardState === 'unconfigured' && (() => {
        const allOptional = manifest.credentials.fields.every(f => f.optional);
        const hasRequiredFields = manifest.credentials.fields.some(f => !f.optional);
        const hasValues = manifest.credentials.fields.some(f => credValues[f.key]?.trim());
        return (
          <>
            {credsOnFile && (
              <div className="alert" style={{
                fontSize: '0.8rem',
                background: 'var(--bg-main)',
                border: '1px solid var(--border)',
                borderRadius: '0.375rem',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.75rem',
                color: 'var(--text-secondary)',
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>Credentials on file.</strong>{' '}
                Existing values are encrypted in the vault and not shown. Enter new values below to replace them, or{' '}
                <button
                  onClick={() => { setCredConfigured(true); if (manifest.oauth) setOauthConnected(true); }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  keep existing
                </button>.
              </div>
            )}
            {manifest.oauth && !credsOnFile && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                Step 1 of 2 — enter credentials, then connect your account.
              </p>
            )}
            {manifest.setupHint && !credsOnFile && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
                {manifest.setupHint}
              </p>
            )}
            {manifest.credentials.fields.map(field => (
              <div className="form-group" key={field.key} style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">{field.label}</label>
                {field.type === 'password' ? (
                  <div className="cred-field">
                    <input
                      className="form-input"
                      type={showSecrets[field.key] ? 'text' : 'password'}
                      placeholder={field.placeholder}
                      value={credValues[field.key] || ''}
                      onChange={e => setCredValues(v => ({ ...v, [field.key]: e.target.value }))}
                    />
                    <button
                      className="cred-toggle"
                      onClick={() => setShowSecrets(s => ({ ...s, [field.key]: !s[field.key] }))}
                    >
                      {showSecrets[field.key] ? 'hide' : 'show'}
                    </button>
                  </div>
                ) : (
                  <input
                    className="form-input"
                    type="text"
                    placeholder={field.placeholder}
                    value={credValues[field.key] || ''}
                    onChange={e => setCredValues(v => ({ ...v, [field.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {hasValues && (
                <button
                  className="btn btn-primary"
                  onClick={saveCredentials}
                  disabled={saving || (hasRequiredFields && !manifest.credentials.fields.filter(f => !f.optional).every(f => credValues[f.key]?.trim()))}
                >
                  {saving ? 'Saving...' : 'Save & Encrypt'}
                </button>
              )}
              {allOptional && !hasValues && (
                <button
                  className="btn btn-primary"
                  onClick={activate}
                  disabled={activating}
                >
                  {activating ? 'Starting...' : `Activate ${manifest.name}`}
                </button>
              )}
            </div>
          </>
        );
      })()}

      {/* Needs OAuth */}
      {cardState === 'needs-oauth' && (
        <>
          <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginBottom: '0.25rem' }}>
            {'\u2713'} Step 1 done — credentials saved
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Step 2: connect your {manifest.name} account to authorize access.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={startOAuth}>
              Connect {manifest.name} Account
            </button>
            <button className="btn btn-ghost" onClick={() => setCredConfigured(false)}>
              Change Credentials
            </button>
          </div>
        </>
      )}

      {/* Ready to start */}
      {cardState === 'ready' && !integration && (
        <>
          <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginBottom: '0.75rem' }}>
            {'\u2713'} {manifest.oauth ? `${manifest.name} account connected` : 'Credentials configured'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={activate}
              disabled={activating}
            >
              {activating ? 'Starting...' : `Start ${manifest.name} Integration`}
            </button>
            {!manifest.oauth && (
              <button className="btn btn-ghost" onClick={() => setCredConfigured(false)}>
                Update Credentials
              </button>
            )}
            {manifest.oauth && (
              <button className="btn btn-ghost" onClick={() => { setCredConfigured(false); setOauthConnected(false); }}>
                Change Credentials
              </button>
            )}
          </div>
        </>
      )}

      {/* Stopped but registered — offer retry */}
      {cardState === 'ready' && integration && !integration.running && (
        <>
          <div className="service-status service-status-error" style={{ marginBottom: '0.75rem' }}>
            <span className="service-status-dot" />
            Not running
          </div>
          {integration.error && (
            <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.75rem' }}>
              {integration.error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={activate} disabled={activating}>
              {activating ? 'Starting...' : 'Start'}
            </button>
            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={remove}>
              Disable
            </button>
          </div>
        </>
      )}
    </div>
  );
}
