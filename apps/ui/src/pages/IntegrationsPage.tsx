import { useState, useCallback } from 'react';
import { IntegrationCard } from '../components/IntegrationCard';
import { useIntegrationStatus } from '../contexts/IntegrationStatusContext';

export function IntegrationsPage() {
  const { loading, mcpServerUp, entries, refresh } = useIntegrationStatus();
  const [successMsg, setSuccessMsg] = useState('');

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  }, []);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Integrations</h1>
        <p className="page-subtitle">Connect external services and manage MCP integrations.</p>
      </div>

      <div className="status-banner status-banner-success">
        <span className="status-banner-icon">{'\u{1F512}'}</span>
        <span className="status-banner-text">
          Vault is active. Credentials are encrypted locally before storage.
        </span>
      </div>

      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading integrations...</p>
      ) : mcpServerUp === false ? (
        <div className="status-banner status-banner-error">
          <span className="status-banner-icon">!</span>
          <span className="status-banner-text">
            MCP server is not reachable. Make sure it is running.
          </span>
        </div>
      ) : (
        <>
          <div className="status-banner status-banner-success" style={{ marginBottom: '1.5rem' }}>
            <span className="status-banner-icon">{'✓'}</span>
            <span className="status-banner-text">
              MCP server is running. Tool availability is controlled by active attestations.
            </span>
          </div>

          {entries.map(entry => (
            <IntegrationCard
              key={entry.id}
              manifest={entry.manifest}
              integration={entry.integration}
              state={entry.state}
              onStatusChange={refresh}
              onSuccess={showSuccess}
            />
          ))}

          {entries.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '2rem' }}>
              No integration manifests found.
            </p>
          )}
        </>
      )}
    </>
  );
}
