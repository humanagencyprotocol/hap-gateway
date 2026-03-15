import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TopNav } from '../components/TopNav';

const FEATURES = [
  { icon: '\u25A0', title: 'Authorize Agents', desc: 'Define what each agent can do, which tools it can access, and for how long. Every authorization is time-limited.' },
  { icon: '\u25C9', title: 'Enforce at Runtime', desc: 'The gateway intercepts every tool call. Unauthorized or expired actions are blocked before they reach external services.' },
  { icon: '\u26A0', title: 'Secure Vault', desc: 'API keys and credentials are encrypted at rest. Agents never see raw secrets \u2014 the gateway resolves them at the point of tool execution.' },
  { icon: '\u21B7', title: 'Deploy Reviews', desc: 'Review pull requests through a structured gate flow before code reaches production. Every merge requires human attestation.' },
  { icon: '\u2630', title: 'Audit Trail', desc: 'Every authorization, tool call, and enforcement decision is logged locally. Full visibility into what agents did and why.' },
];

export function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const { login, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!apiKey.trim()) return;
    clearError();
    try {
      await login(apiKey);
      navigate('/');
    } catch {
      // error is set in context
    }
  };

  return (
    <>
      <TopNav />
      <div className="login-split">
        {/* LEFT: Protocol summary */}
        <div className="login-split-left">
          <div style={{ maxWidth: '28rem' }}>
            <h1 style={{ fontSize: 'clamp(2.25rem, 4vw, 3.25rem)', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '1.25rem' }}>
              The Local<br /><span style={{ color: 'var(--accent)' }}>AI Agent Gateway</span>
            </h1>
            <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '3rem' }}>
              The gateway sits between your AI agents and external tools. Agents only get access to what you've authorized — nothing more, nothing less.
            </p>
            <div style={{ display: 'grid', gap: '2rem' }}>
              {FEATURES.map(f => (
                <div key={f.title} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                    {f.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>{f.title}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Login form */}
        <div className="login-split-right">
          <div style={{ width: '100%', maxWidth: '24rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Sign In</div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Enter your API key to manage authorizations.
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">API Key</label>
              <input
                className="form-input"
                type="password"
                placeholder="hap_sk_..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                disabled={isLoading}
                style={{ padding: '0.75rem' }}
              />
              <div className="form-hint">From your HAP Service Provider account.</div>
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleLogin}
              disabled={isLoading}
              style={{ marginBottom: '2rem' }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="login-divider">new here?</div>

            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                Create a demo account on Humanagencyprotocol.com,<br />then come back to sign in.
              </p>
              <a
                href="https://www.humanagencyprotocol.com/register"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-full"
                style={{ textDecoration: 'none' }}
              >
                Create Account
              </a>
            </div>

            <div style={{ paddingTop: '1.75rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.875rem' }}>
                Getting started
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {['Create an account at humanagencyprotocol.com', 'Join or create a team to get domain authority', 'Sign in here with your API key to start authorizing agents'].map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.625rem', alignItems: 'baseline', marginBottom: i < 2 ? '0.5rem' : 0 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.95rem' }}>{i + 1}.</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
