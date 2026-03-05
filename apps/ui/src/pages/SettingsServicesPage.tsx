import { useState } from 'react';
import { ServiceCredentialModal } from '../components/ServiceCredentialModal';

interface ServiceDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'connected' | 'missing' | 'error';
  tools: string[];
  profile?: string;
  credFields: Array<{ label: string; key: string; type: 'text' | 'password'; placeholder?: string }>;
}

const SERVICES: ServiceDef[] = [
  {
    id: 'payment-gateway',
    name: 'Payment Gateway',
    description: 'Process payments and manage transactions',
    icon: '\u{1F4B3}',
    status: 'connected',
    tools: ['process_payment', 'check_balance', 'refund'],
    profile: 'payment-gate',
    credFields: [
      { label: 'API Endpoint', key: 'endpoint', type: 'text', placeholder: 'https://api.gateway.example.com' },
      { label: 'API Key', key: 'apiKey', type: 'password', placeholder: 'sk_live_...' },
      { label: 'Webhook Secret', key: 'webhookSecret', type: 'password', placeholder: 'whsec_...' },
    ],
  },
  {
    id: 'email-service',
    name: 'Email Service',
    description: 'Send and manage email communications',
    icon: '\u2709',
    status: 'connected',
    tools: ['send_email', 'list_templates'],
    profile: 'comms-send',
    credFields: [
      { label: 'SMTP Host', key: 'host', type: 'text', placeholder: 'smtp.example.com' },
      { label: 'API Key', key: 'apiKey', type: 'password', placeholder: 'SG.xxx' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'Customer relationship management',
    icon: '\u{1F4C7}',
    status: 'missing',
    tools: ['search_contacts', 'update_record'],
    credFields: [
      { label: 'Instance URL', key: 'url', type: 'text', placeholder: 'https://your-instance.crm.com' },
      { label: 'Access Token', key: 'token', type: 'password' },
    ],
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Application performance monitoring',
    icon: '\u{1F4CA}',
    status: 'error',
    tools: ['get_metrics', 'create_alert'],
    credFields: [
      { label: 'API Key', key: 'apiKey', type: 'password' },
      { label: 'Region', key: 'region', type: 'text', placeholder: 'us-east-1' },
    ],
  },
];

type TabId = 'general' | 'services' | 'mcp';

export function SettingsServicesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('services');
  const [modalService, setModalService] = useState<ServiceDef | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

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
    if (s === 'connected') return 'Connected (mock)';
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

      {activeTab === 'general' && (
        <div className="card">
          <h3 className="card-title">General Settings</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            General application preferences will be available here.
          </p>
        </div>
      )}

      {activeTab === 'services' && (
        <>
          {SERVICES.map(service => (
            <div className="service-card" key={service.id}>
              <div className={`service-icon ${statusIconClass(service.status)}`}>
                {service.icon}
              </div>
              <div className="service-info">
                <div className="service-name">{service.name}</div>
                <div className="service-desc">{service.description}</div>
                <div className={`service-status ${statusClass(service.status)}`}>
                  <span className="service-status-dot" />
                  {statusLabel(service.status)}
                </div>
                <div className="service-tools">
                  {service.tools.map(t => (
                    <span className="service-tool-badge" key={t}>{t}</span>
                  ))}
                </div>
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

          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '1.5rem', textAlign: 'center' }}>
            Additional services can be added via MCP server configuration.
          </p>
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
          serviceName={modalService.name}
          fields={modalService.credFields}
          connected={modalService.status === 'connected'}
          onClose={() => setModalService(null)}
          onSave={() => {
            setModalService(null);
            setSuccessMsg(`${modalService.name} credentials saved!`);
            setTimeout(() => setSuccessMsg(''), 3000);
          }}
        />
      )}
    </>
  );
}
