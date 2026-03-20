import { useState, useEffect } from 'react';
import { spClient } from '../lib/sp-client';

interface CredField {
  label: string;
  key: string;
  type: 'text' | 'password';
  placeholder?: string;
}

interface Props {
  serviceId: string;
  serviceName: string;
  fields: CredField[];
  connected: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}

export function ServiceCredentialModal({ serviceId, serviceName, fields, connected, onClose, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [existingFields, setExistingFields] = useState<string[]>([]);
  const [maskedValues, setMaskedValues] = useState<Record<string, string>>({});

  // Load existing credential status on open
  useEffect(() => {
    spClient.getCredential(serviceId).then(status => {
      if (status.configured && status.fieldNames) {
        setExistingFields(status.fieldNames);
        if (status.fields) {
          setMaskedValues(status.fields);
          setValues(status.fields);
        }
      }
    }).catch(() => {/* ignore */});
  }, [serviceId]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await spClient.testCredential(serviceId);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
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

          {/* Show existing field names (values masked) */}
          {existingFields.length > 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
              Configured fields: {existingFields.join(', ')}
            </div>
          )}

          {/* Credential fields */}
          {fields.map(field => (
            <div className="form-group" key={field.key}>
              <label className="form-label">{field.label}</label>
              {field.type === 'password' ? (
                <div className="cred-field">
                  <input
                    className="form-input"
                    type={showSecrets[field.key] ? 'text' : 'password'}
                    placeholder={maskedValues[field.key] || field.placeholder}
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

          {testResult && (
            <div className={`alert ${testResult.ok ? 'alert-success' : 'alert-error'}`}>
              {testResult.message}
            </div>
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
