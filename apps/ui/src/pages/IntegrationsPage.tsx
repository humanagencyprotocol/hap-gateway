import { useState, useEffect, useCallback } from 'react';
import { spClient, type IntegrationManifest, type McpIntegrationStatus } from '../lib/sp-client';
import { IntegrationCard } from '../components/IntegrationCard';

export function IntegrationsPage() {
  const [manifests, setManifests] = useState<IntegrationManifest[]>([]);
  const [integrations, setIntegrations] = useState<McpIntegrationStatus[]>([]);
  const [mcpServerUp, setMcpServerUp] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [manifestsData, healthData] = await Promise.all([
        spClient.getIntegrationManifests().catch(() => ({ manifests: [] })),
        spClient.getMcpHealth().catch(() => null),
      ]);
      setManifests(manifestsData.manifests);
      if (healthData) {
        setMcpServerUp(true);
        setIntegrations(healthData.integrations);
      } else {
        setMcpServerUp(false);
        setIntegrations([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Integrations</h1>
        <p className="page-subtitle">Connect external services and manage MCP integrations.</p>
      </div>

      {/* Vault banner */}
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
            <span className="status-banner-icon">{'\u2713'}</span>
            <span className="status-banner-text">
              MCP server is running. Tool availability is controlled by active attestations.
            </span>
          </div>

          {manifests.map(manifest => (
            <IntegrationCard
              key={manifest.id}
              manifest={manifest}
              integration={integrations.find(i => i.id === manifest.id)}
              onStatusChange={loadStatus}
              onSuccess={showSuccess}
            />
          ))}

          {manifests.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '2rem' }}>
              No integration manifests found.
            </p>
          )}

        </>
      )}
    </>
  );
}
