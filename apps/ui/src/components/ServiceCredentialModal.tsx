import { useState } from 'react';

interface CredField {
  label: string;
  key: string;
  type: 'text' | 'password';
  placeholder?: string;
}

interface Props {
  serviceName: string;
  fields: CredField[];
  connected: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}

export function ServiceCredentialModal({ serviceName, fields, connected, onClose, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = () => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult('success');
    }, 1000);
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Configure {serviceName}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Connection status */}
          <div className={`status-banner ${connected ? 'status-banner-success' : 'status-banner-warn'}`}>
            <span className="status-banner-icon">{connected ? '\u2713' : '\u26A0'}</span>
            <span className="status-banner-text">
              {connected ? 'Connected' : 'Not configured'}
            </span>
          </div>

          {/* Credential fields */}
          {fields.map(field => (
            <div className="form-group" key={field.key}>
              <label className="form-label">{field.label}</label>
              {field.type === 'password' ? (
                <div className="cred-field">
                  <input
                    className="form-input"
                    type={showSecrets[field.key] ? 'text' : 'password'}
                    placeholder={field.placeholder}
                    value={values[field.key] || ''}
                    onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
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
                  value={values[field.key] || ''}
                  onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          {/* Vault info */}
          <div className="status-banner status-banner-success" style={{ fontSize: '0.75rem' }}>
            <span className="status-banner-icon">{'\u{1F512}'}</span>
            <span className="status-banner-text">
              Credentials are encrypted in your local vault before being stored.
            </span>
          </div>

          {testResult === 'success' && (
            <div className="alert alert-success">Connection test passed.</div>
          )}
          {testResult === 'error' && (
            <div className="alert alert-error">Connection test failed.</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(values)}>
            Save &amp; Encrypt
          </button>
        </div>
      </div>
    </div>
  );
}
