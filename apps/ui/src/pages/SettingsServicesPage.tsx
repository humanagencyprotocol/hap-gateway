import { useState, useEffect, useCallback } from 'react';
import { spClient, type ServiceDef, type McpIntegrationStatus } from '../lib/sp-client';
import { ServiceCredentialModal } from '../components/ServiceCredentialModal';

type TabId = 'general' | 'services' | 'mcp';

const PROVIDER_CONFIG: Record<string, { provider: string; endpoint: string; models: string[] }> = {
  ollama: {
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'gemma2', 'phi3', 'qwen2.5'],
  },
  openai: {
    provider: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o3-mini'],
  },
  groq: {
    provider: 'openai-compatible',
    endpoint: 'https://api.groq.com/openai/v1',
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'gemma2-9b-it', 'mixtral-8x7b-32768'],
  },
  together: {
    provider: 'openai-compatible',
    endpoint: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3-8b-chat-hf', 'meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  },
  openrouter: {
    provider: 'openai-compatible',
    endpoint: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4', 'openai/gpt-4o-mini', 'openai/gpt-4o', 'google/gemini-2.5-flash', 'meta-llama/llama-3.1-8b-instruct'],
  },
};

export function SettingsServicesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('services');
  const [services, setServices] = useState<ServiceDef[]>([]);
  const [modalService, setModalService] = useState<ServiceDef | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // General tab state
  const [aiPreset, setAiPreset] = useState('ollama');
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

  // MCP tab state
  const [mcpIntegrations, setMcpIntegrations] = useState<McpIntegrationStatus[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpServerUp, setMcpServerUp] = useState<boolean | null>(null);
  const [mcpAdding, setMcpAdding] = useState(false);
  const [stripeKeyInput, setStripeKeyInput] = useState('');
  const [stripeKeyConfigured, setStripeKeyConfigured] = useState(false);
  const [stripeSaving, setStripeSaving] = useState(false);

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
      // Load stored non-secret AI config values
      if (aiStatus.configured && aiStatus.fields) {
        if (aiStatus.fields.provider) setAiProvider(aiStatus.fields.provider);
        if (aiStatus.fields.endpoint) setAiEndpoint(aiStatus.fields.endpoint);
        if (aiStatus.fields.model) setAiModel(aiStatus.fields.model);
        // Derive preset from endpoint
        const ep = aiStatus.fields.endpoint ?? '';
        if (ep.includes('openai.com')) setAiPreset('openai');
        else if (ep.includes('groq.com')) setAiPreset('groq');
        else if (ep.includes('together.xyz')) setAiPreset('together');
        else if (ep.includes('openrouter.ai')) setAiPreset('openrouter');
        else setAiPreset('ollama');
      }
    } catch {
      // ignore
    }
  }, []);

  const loadMcpStatus = useCallback(async () => {
    setMcpLoading(true);
    try {
      const health = await spClient.getMcpHealth();
      setMcpServerUp(true);
      setMcpIntegrations(health.integrations);
      setStripeKeyConfigured(health.serviceCredentials.includes('stripe'));
    } catch {
      setMcpServerUp(false);
      setMcpIntegrations([]);
    } finally {
      setMcpLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
    loadGeneralStatus();
  }, [loadServices, loadGeneralStatus]);

  useEffect(() => {
    if (activeTab === 'mcp') loadMcpStatus();
  }, [activeTab, loadMcpStatus]);

  const handleAiPresetChange = (preset: string) => {
    setAiPreset(preset);
    const cfg = PROVIDER_CONFIG[preset];
    if (cfg) {
      setAiProvider(cfg.provider);
      setAiEndpoint(cfg.endpoint);
      setAiModel(cfg.models[0]);
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
      // If no new API key typed, send empty body so server uses stored config (with real key)
      const result = await spClient.aiTest(aiApiKey ? {
        provider: aiProvider,
        endpoint: aiEndpoint,
        model: aiModel,
        apiKey: aiApiKey,
      } : {});
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

  const saveStripeKey = async () => {
    if (!stripeKeyInput.trim()) return;
    setStripeSaving(true);
    try {
      await spClient.setCredential('stripe', { apiKey: stripeKeyInput });
      setStripeKeyConfigured(true);
      setStripeKeyInput('');
      setSuccessMsg('Stripe API key saved!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setSuccessMsg('Failed to save Stripe key');
    } finally {
      setStripeSaving(false);
    }
  };

  const addStripeIntegration = async () => {
    setMcpAdding(true);
    try {
      const result = await spClient.addMcpStripePreset();
      if (result.warning) {
        setSuccessMsg(result.warning);
      } else {
        setSuccessMsg(`Stripe integration started with ${result.tools.length} tools`);
      }
      setTimeout(() => setSuccessMsg(''), 5000);
      await loadMcpStatus();
    } catch (err) {
      setSuccessMsg(`Failed to add Stripe: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setMcpAdding(false);
    }
  };

  const removeIntegration = async (id: string) => {
    try {
      await spClient.removeMcpIntegration(id);
      setSuccessMsg(`Integration "${id}" removed`);
      setTimeout(() => setSuccessMsg(''), 3000);
      await loadMcpStatus();
    } catch {
      setSuccessMsg(`Failed to remove integration "${id}"`);
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
                value={aiPreset}
                onChange={e => handleAiPresetChange(e.target.value)}
              >
                <option value="ollama">Ollama (local)</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="together">Together</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Model</label>
              {(() => {
                const models = PROVIDER_CONFIG[aiPreset]?.models ?? [];
                const isKnown = models.includes(aiModel);
                return (
                  <>
                    <select
                      className="form-input"
                      value={isKnown ? aiModel : '__custom__'}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setAiModel('');
                        } else {
                          setAiModel(e.target.value);
                        }
                      }}
                      style={{ marginBottom: !isKnown ? '0.375rem' : undefined }}
                    >
                      {models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="__custom__">Custom model...</option>
                    </select>
                    {!isKnown && (
                      <input
                        className="form-input"
                        value={aiModel}
                        onChange={e => setAiModel(e.target.value)}
                        placeholder="Enter model name"
                      />
                    )}
                  </>
                );
              })()}
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">API Key (if required)</label>
              <input
                className="form-input"
                type="password"
                value={aiApiKey}
                onChange={e => setAiApiKey(e.target.value)}
                placeholder={aiConfigured ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'sk-... (not needed for Ollama)'}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={saveAiConfig} disabled={aiSaving}>
                {aiSaving ? 'Saving...' : 'Save & Encrypt'}
              </button>
              {aiConfigured && (
                <button className="btn btn-ghost" onClick={testAi} disabled={aiTesting}>
                  {aiTesting ? 'Testing...' : 'Test Connection'}
                </button>
              )}
            </div>

            {aiTestResult && (
              <div className={`alert ${aiTestResult.startsWith('OK') ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '0.75rem' }}>
                {aiTestResult}
              </div>
            )}
          </div>

          {/* GitHub Access card */}
          <div className="card">
            <h3 className="card-title">GitHub Access</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Personal access token for loading PRs in the deploy review flow. Encrypted in your vault.
            </p>

            <details style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', cursor: 'pointer' }}>
              <summary style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                How to create a GitHub Personal Access Token
              </summary>
              <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.7, marginTop: '0.5rem' }}>
                <li>Go to <strong>GitHub.com</strong> &rarr; click your profile picture &rarr; <strong>Settings</strong></li>
                <li>Scroll down in the left sidebar &rarr; <strong>Developer settings</strong></li>
                <li>Click <strong>Personal access tokens</strong> &rarr; <strong>Fine-grained tokens</strong></li>
                <li>Click <strong>Generate new token</strong></li>
                <li>Give it a name (e.g. "HAP Demo") and set an expiration</li>
                <li>Under <strong>Repository access</strong>, select the repos you want to review</li>
                <li>Under <strong>Permissions</strong>, grant: <strong>Pull requests</strong> (Read) and <strong>Contents</strong> (Read)</li>
                <li>Click <strong>Generate token</strong> and copy the <code>github_pat_...</code> value</li>
                <li>Paste it below and click <strong>Save &amp; Encrypt</strong></li>
              </ol>
            </details>

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
                placeholder={ghConfigured ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'ghp_...'}
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
        <>
          {/* MCP Server Status */}
          {mcpLoading ? (
            <p style={{ color: 'var(--text-tertiary)' }}>Checking MCP server...</p>
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

              {/* Active Integrations */}
              {mcpIntegrations.length > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h3 className="card-title">Active Integrations</h3>
                  {mcpIntegrations.map(integration => (
                    <div key={integration.id} className="service-card">
                      <div className={`service-icon ${integration.running ? 'service-icon-configured' : 'service-icon-error'}`}>
                        {integration.id === 'stripe' ? '\u{1F4B3}' : '\u{1F527}'}
                      </div>
                      <div className="service-info">
                        <div className="service-name">{integration.name}</div>
                        <div className={`service-status ${integration.running ? 'service-status-connected' : 'service-status-error'}`}>
                          <span className="service-status-dot" />
                          {integration.running ? `Running (${integration.toolCount} tools)` : 'Stopped'}
                        </div>
                        {integration.error && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.25rem' }}>
                            {integration.error}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => removeIntegration(integration.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Stripe Setup */}
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 className="card-title">Stripe Integration</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Connect Stripe to let agents create invoices, payment links, and manage billing.
                  Financial operations are gated through HAP spend authorization.
                </p>

                {/* API Key */}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Stripe API Key</label>
                  {stripeKeyConfigured && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginBottom: '0.375rem' }}>
                      {'\u2713'} API key configured
                    </div>
                  )}
                  <input
                    className="form-input"
                    type="password"
                    value={stripeKeyInput}
                    onChange={e => setStripeKeyInput(e.target.value)}
                    placeholder={stripeKeyConfigured ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'sk_test_... or sk_live_...'}
                  />
                  <span className="form-hint">
                    Use a test key (sk_test_...) for development. Keys are encrypted in your vault.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {!stripeKeyConfigured ? (
                    /* Step 1: No key yet — Save Key is the primary action */
                    <button
                      className="btn btn-primary"
                      onClick={saveStripeKey}
                      disabled={stripeSaving || !stripeKeyInput.trim()}
                    >
                      {stripeSaving ? 'Saving...' : 'Save & Encrypt Key'}
                    </button>
                  ) : (
                    <>
                      {/* Key is configured — allow updating it */}
                      <button
                        className="btn btn-ghost"
                        onClick={saveStripeKey}
                        disabled={stripeSaving || !stripeKeyInput.trim()}
                      >
                        {stripeSaving ? 'Saving...' : 'Update Key'}
                      </button>

                      {/* Step 2: Key saved — Start Integration is the primary action */}
                      {!mcpIntegrations.some(i => i.id === 'stripe') && (
                        <button
                          className="btn btn-primary"
                          onClick={addStripeIntegration}
                          disabled={mcpAdding}
                        >
                          {mcpAdding ? 'Starting...' : 'Start Stripe Integration'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* How it works */}
              <div className="card">
                <h3 className="card-title">How Gating Works</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Read-only Stripe tools (list invoices, search customers, etc.) are <strong>ungated</strong> and
                  available to the agent immediately. Write-financial tools (create invoice, create payment link,
                  finalize invoice, create refund) require an active <strong>spend</strong> authorization.
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '0.5rem' }}>
                  Stripe amounts are in cents. The gateway automatically converts to units before checking
                  against your authorization bounds (e.g., 5000 cents = 50 EUR vs. amount_max: 80 EUR).
                </p>
              </div>
            </>
          )}
        </>
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
