import { useState, useEffect, useCallback } from 'react';
import { spClient, type ServiceDef } from '../lib/sp-client';
import { ServiceCredentialModal } from '../components/ServiceCredentialModal';

type TabId = 'general' | 'services' | 'mcp';

export function SettingsServicesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('services');
  const [services, setServices] = useState<ServiceDef[]>([]);
  const [modalService, setModalService] = useState<ServiceDef | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // General tab state
  const [aiProvider, setAiProvider] = useState('ollama');
  const [aiEndpoint, setAiEndpoint] = useState('http://localhost:11434');
  const [aiModel, setAiModel] = useState('llama3.2');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);

  const [ghPat, setGhPat] = useState('');
  const [ghConfigured, setGhConfigured] = useState(false);
  const [ghSaving, setGhSaving] = useState(false);
  const [ghTesting, setGhTesting] = useState(false);
  const [ghTestResult, setGhTestResult] = useState<string | null>(null);

  // Add service form state
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServiceFields, setNewServiceFields] = useState<Array<{ label: string; key: string; type: 'text' | 'password' }>>([
    { label: '', key: '', type: 'password' },
  ]);

  const loadServices = useCallback(async () => {
    try {
      const svcs = await spClient.getServices();
      setServices(svcs);
    } catch {
      // Services will stay empty
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGeneralStatus = useCallback(async () => {
    try {
      const [aiStatus, ghStatus] = await Promise.all([
        spClient.getCredential('ai-config'),
        spClient.getCredential('github-pat'),
      ]);
      setAiConfigured(aiStatus.configured);
      setGhConfigured(ghStatus.configured);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadServices();
    loadGeneralStatus();
  }, [loadServices, loadGeneralStatus]);

  const handleAiPresetChange = async (preset: string) => {
    try {
      const data = await spClient.getAIPresets();
      const p = data.presets[preset];
      if (p) {
        setAiProvider(p.provider);
        setAiEndpoint(p.endpoint);
        setAiModel(p.model);
      }
    } catch {
      // ignore
    }
  };

  const saveAiConfig = async () => {
    setAiSaving(true);
    try {
      await spClient.setCredential('ai-config', {
        provider: aiProvider,
        endpoint: aiEndpoint,
        model: aiModel,
        ...(aiApiKey ? { apiKey: aiApiKey } : {}),
      });
      setAiConfigured(true);
      setSuccessMsg('AI configuration saved!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setSuccessMsg('Failed to save AI config');
    } finally {
      setAiSaving(false);
    }
  };

  const testAi = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const result = await spClient.aiTest({
        provider: aiProvider,
        endpoint: aiEndpoint,
        model: aiModel,
        apiKey: aiApiKey || undefined,
      });
      setAiTestResult(result.ok ? `OK: ${result.message}` : `Failed: ${result.message}`);
    } catch (e) {
      setAiTestResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setAiTesting(false);
    }
  };

  const saveGhPat = async () => {
    setGhSaving(true);
    try {
      await spClient.setCredential('github-pat', { pat: ghPat });
      setGhConfigured(true);
      setGhPat('');
      setSuccessMsg('GitHub PAT saved!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setSuccessMsg('Failed to save GitHub PAT');
    } finally {
      setGhSaving(false);
    }
  };

  const testGh = async () => {
    setGhTesting(true);
    setGhTestResult(null);
    try {
      const result = await spClient.testCredential('github-pat');
      setGhTestResult(result.ok ? `OK: ${result.message}` : `Failed: ${result.message}`);
    } catch (e) {
      setGhTestResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setGhTesting(false);
    }
  };

  const handleAddService = async () => {
    const id = newServiceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id) return;

    try {
      await spClient.addService(id, {
        id,
        name: newServiceName,
        description: newServiceDesc,
        credFields: newServiceFields.filter(f => f.key && f.label),
      });
      setShowAddService(false);
      setNewServiceName('');
      setNewServiceDesc('');
      setNewServiceFields([{ label: '', key: '', type: 'password' }]);
      setSuccessMsg(`Service "${newServiceName}" added!`);
      setTimeout(() => setSuccessMsg(''), 3000);
      loadServices();
    } catch {
      setSuccessMsg('Failed to add service');
    }
  };

  const statusIconClass = (s: string) => {
    if (s === 'connected') return 'service-icon-configured';
    if (s === 'error') return 'service-icon-error';
    return 'service-icon-missing';
  };

  const statusClass = (s: string) => {
    if (s === 'connected') return 'service-status-connected';
    if (s === 'error') return 'service-status-error';
    return 'service-status-missing';
  };

  const statusLabel = (s: string) => {
    if (s === 'connected') return 'Connected';
    if (s === 'error') return 'Connection Error';
    return 'Not configured';
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage services, credentials, and MCP configuration.</p>
      </div>

      {/* Vault banner */}
      <div className="status-banner status-banner-success">
        <span className="status-banner-icon">{'\u{1F512}'}</span>
        <span className="status-banner-text">
          Vault is active. Credentials are encrypted locally before storage.
        </span>
      </div>

      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Tabs */}
      <div className="nav-tabs">
        {([
          { id: 'general' as TabId, label: 'General' },
          { id: 'services' as TabId, label: 'Services' },
          { id: 'mcp' as TabId, label: 'MCP' },
        ]).map(tab => (
          <button
            key={tab.id}
            className={`nav-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── General tab ─────────────────────────────────────────────── */}
      {activeTab === 'general' && (
        <>
          {/* AI Assistant card */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">AI Assistant</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Advisory-only AI to help you think through gates. Keys are encrypted in your vault.
            </p>

            {aiConfigured && (
              <div className="status-banner status-banner-success" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
                <span className="status-banner-icon">{'\u2713'}</span>
                <span className="status-banner-text">AI configured</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Provider Preset</label>
              <select
                className="form-input"
                value={aiProvider === 'ollama' ? 'ollama' : ''}
                onChange={e => handleAiPresetChange(e.target.value)}
              >
                <option value="ollama">Ollama (local)</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="together">Together</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Endpoint</label>
              <input
                className="form-input"
                value={aiEndpoint}
                onChange={e => setAiEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Model</label>
              <input
                className="form-input"
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
                placeholder="llama3.2"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">API Key (if required)</label>
              <input
                className="form-input"
                type="password"
                value={aiApiKey}
                onChange={e => setAiApiKey(e.target.value)}
                placeholder="sk-... (not needed for Ollama)"
              />
            </div>

            {aiTestResult && (
              <div className={`alert ${aiTestResult.startsWith('OK') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '0.75rem' }}>
                {aiTestResult}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost" onClick={testAi} disabled={aiTesting}>
                {aiTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button className="btn btn-primary" onClick={saveAiConfig} disabled={aiSaving}>
                {aiSaving ? 'Saving...' : 'Save & Encrypt'}
              </button>
            </div>
          </div>

          {/* GitHub Access card */}
          <div className="card">
            <h3 className="card-title">GitHub Access</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Personal access token for loading PRs in the deploy review flow. Encrypted in your vault.
            </p>

            {ghConfigured && (
              <div className="status-banner status-banner-success" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
                <span className="status-banner-icon">{'\u2713'}</span>
                <span className="status-banner-text">GitHub PAT configured</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Personal Access Token</label>
              <input
                className="form-input"
                type="password"
                value={ghPat}
                onChange={e => setGhPat(e.target.value)}
                placeholder="ghp_..."
              />
            </div>

            {ghTestResult && (
              <div className={`alert ${ghTestResult.startsWith('OK') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '0.75rem' }}>
                {ghTestResult}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost" onClick={testGh} disabled={ghTesting || !ghConfigured}>
                {ghTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button className="btn btn-primary" onClick={saveGhPat} disabled={ghSaving || !ghPat}>
                {ghSaving ? 'Saving...' : 'Save & Encrypt'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Services tab ────────────────────────────────────────────── */}
      {activeTab === 'services' && (
        <>
          {loading ? (
            <p style={{ color: 'var(--text-tertiary)' }}>Loading services...</p>
          ) : (
            <>
              {services.map(service => (
                <div className="service-card" key={service.id}>
                  <div className={`service-icon ${statusIconClass(service.status)}`}>
                    {service.icon || '\u{1F527}'}
                  </div>
                  <div className="service-info">
                    <div className="service-name">{service.name}</div>
                    <div className="service-desc">{service.description}</div>
                    <div className={`service-status ${statusClass(service.status)}`}>
                      <span className="service-status-dot" />
                      {statusLabel(service.status)}
                    </div>
                    {service.tools && service.tools.length > 0 && (
                      <div className="service-tools">
                        {service.tools.map(t => (
                          <span className="service-tool-badge" key={t}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'flex-end' }}>
                    {service.profile && (
                      <span className="profile-badge">{service.profile}</span>
                    )}
                    <button
                      className={`btn btn-sm ${service.status === 'connected' ? 'btn-ghost' : 'btn-secondary'}`}
                      onClick={() => setModalService(service)}
                    >
                      {service.status === 'connected' ? 'Edit' : service.status === 'error' ? 'Reconnect' : 'Configure'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Service */}
              {!showAddService ? (
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                  <button className="btn btn-secondary" onClick={() => setShowAddService(true)}>
                    + Add Service
                  </button>
                </div>
              ) : (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <h3 className="card-title">Add New Service</h3>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Service Name</label>
                    <input
                      className="form-input"
                      value={newServiceName}
                      onChange={e => setNewServiceName(e.target.value)}
                      placeholder="My Custom Service"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Description</label>
                    <input
                      className="form-input"
                      value={newServiceDesc}
                      onChange={e => setNewServiceDesc(e.target.value)}
                      placeholder="What does this service do?"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Credential Fields</label>
                    {newServiceFields.map((f, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <input
                          className="form-input"
                          style={{ flex: 1 }}
                          placeholder="Label"
                          value={f.label}
                          onChange={e => {
                            const next = [...newServiceFields];
                            next[i] = { ...f, label: e.target.value };
                            setNewServiceFields(next);
                          }}
                        />
                        <input
                          className="form-input"
                          style={{ flex: 1 }}
                          placeholder="Key"
                          value={f.key}
                          onChange={e => {
                            const next = [...newServiceFields];
                            next[i] = { ...f, key: e.target.value };
                            setNewServiceFields(next);
                          }}
                        />
                        <select
                          className="form-input"
                          style={{ width: '100px' }}
                          value={f.type}
                          onChange={e => {
                            const next = [...newServiceFields];
                            next[i] = { ...f, type: e.target.value as 'text' | 'password' };
                            setNewServiceFields(next);
                          }}
                        >
                          <option value="password">Secret</option>
                          <option value="text">Text</option>
                        </select>
                      </div>
                    ))}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: '0.25rem' }}
                      onClick={() => setNewServiceFields([...newServiceFields, { label: '', key: '', type: 'password' }])}
                    >
                      + Add Field
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-ghost" onClick={() => setShowAddService(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleAddService} disabled={!newServiceName.trim()}>
                      Add Service
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'mcp' && (
        <div className="card">
          <h3 className="card-title">MCP Configuration</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            The MCP server is running and providing tools to connected agents.
            Tool availability is controlled by active attestations.
          </p>
        </div>
      )}

      {/* Credential Modal */}
      {modalService && (
        <ServiceCredentialModal
          serviceId={modalService.id}
          serviceName={modalService.name}
          fields={modalService.credFields}
          connected={modalService.status === 'connected'}
          onClose={() => setModalService(null)}
          onSave={async (values) => {
            try {
              await spClient.setCredential(modalService.id, values);
              setModalService(null);
              setSuccessMsg(`${modalService.name} credentials saved!`);
              setTimeout(() => setSuccessMsg(''), 3000);
              loadServices();
            } catch {
              setSuccessMsg(`Failed to save ${modalService.name} credentials`);
            }
          }}
        />
      )}
    </>
  );
}
