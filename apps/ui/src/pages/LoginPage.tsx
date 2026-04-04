import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TopNav } from '../components/TopNav';

const FEATURES = [
  { icon: '\u25A0', title: 'Runs on Your Machine', desc: 'Your gateway, your rules. Credentials stay encrypted locally. Nothing leaves without your authorization.' },
  { icon: '\u25C9', title: 'Automatic or Review', desc: 'Routine actions execute within your bounds. High-stakes actions pause for your review.' },
  { icon: '\u25CB', title: 'Personal or Team', desc: 'Use it solo or with your team. For critical actions, require approval from multiple members.' },
  { icon: '\u21B7', title: 'Works With Any Agent', desc: 'Connect Claude, Cursor, or any MCP-compatible agent. One config, done.' },
  { icon: '\u2630', title: 'Signed Receipts', desc: 'Every action produces cryptographic proof \u2014 what was done, when, under which authorization.' },
  { icon: '\u26A0', title: 'Secure Vault', desc: 'API keys and credentials encrypted at rest. Agents never see raw secrets.' },
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
              Let your AI agents act —<br /><span style={{ color: 'var(--accent)' }}>within bounds you control.</span>
            </h1>
            <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '3rem' }}>
              Define what your agents are allowed to do. Every action is bounded, time-limited, and traceable to your decision.
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
                Create an account on humanagencyprotocol.com,<br />then come back to sign in.
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
