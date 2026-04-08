import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { spClient } from '../lib/sp-client';
import { StepIndicator } from '../components/StepIndicator';
import { ContextStrip } from '../components/ContextStrip';
import { BoundsEditor } from '../components/BoundsEditor';
import type { AgentProfile, AgentBoundsParams, AgentContextParams } from '@hap/core';

interface AuthData {
  profileId: string;
  groupId?: string;
  groupName?: string;
  domain: string;
}

export function GateWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStep = Number(searchParams.get('step')) || 2;
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [step, setStep] = useState(initialStep); // 2=scope+limits, 3=intent
  const [bounds, setBounds] = useState<AgentBoundsParams | null>(null);
  const [context, setContext] = useState<AgentContextParams | null>(null);
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(true);

  // AI assist state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('agentAuth');
    if (!stored) { navigate('/agent/new'); return; }
    const data: AuthData = JSON.parse(stored);
    setAuthData(data);

    // Restore previous selections if user navigated back
    const gateStored = sessionStorage.getItem('agentGate');
    if (gateStored) {
      const gate = JSON.parse(gateStored);
      if (gate.bounds) setBounds(gate.bounds);
      if (gate.context) setContext(gate.context);
      if (gate.gateContent?.intent) setIntent(gate.gateContent.intent);
    }

    spClient.getProfile(data.profileId)
      .then(p => setProfile(p))
      .catch(() => navigate('/agent/new'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const boundsString = bounds
    ? Object.entries(bounds)
        .filter(([k]) => k !== 'profile' && k !== 'path')
        .map(([k, v]) => `${k} = ${v}`)
        .join(', ')
    : '';

  const handleBoundsConfirm = (b: AgentBoundsParams, c: AgentContextParams) => {
    setBounds(b);
    setContext(c);

    // Suggest intent from selected scope + bounds
    if (!intent.trim() && profile) {
      const parts: string[] = [];

      // Context fields (scope)
      const contextSchema = profile.contextSchema;
      if (contextSchema) {
        for (const key of contextSchema.keyOrder) {
          const val = c[key];
          if (val !== undefined && val !== '') {
            const field = contextSchema.fields[key];
            const label = field?.displayName ?? key.replace(/_/g, ' ');
            const values = String(val).split(',').map(s => s.trim()).filter(Boolean);
            parts.push(`${label}: ${values.join(', ')}`);
          }
        }
      }

      // Bounds fields (limits)
      const boundsSchema = profile.boundsSchema ?? profile.frameSchema;
      if (boundsSchema) {
        for (const key of boundsSchema.keyOrder) {
          if (key === 'profile' || key === 'path') continue;
          const val = b[key];
          if (val !== undefined && val !== '' && val !== 0) {
            const field = boundsSchema.fields[key];
            const label = field?.displayName ?? key.replace(/_/g, ' ');
            parts.push(`${label}: ${val}`);
          }
        }
      }

      if (parts.length > 0) {
        setIntent(parts.join('. ') + '.');
      }
    }

    setStep(3);
  };

  const handleIntentNext = () => {
    const ttlConfig = profile?.ttl;
    const gateContent = { intent };
    sessionStorage.setItem('agentGate', JSON.stringify({ bounds, context, gateContent, ttlConfig }));
    navigate('/agent/review');
  };

  const handleAskAI = async () => {
    setAiLoading(true);
    setAiResponse(null);
    try {
      const result = await spClient.aiAssist({
        gate: 'intent',
        currentText: intent,
        context: authData ? {
          profileId: authData.profileId,
          bounds: boundsString || undefined,
        } : undefined,
      });
      if (result.success && result.suggestion) {
        setAiResponse(result.suggestion);
      } else {
        setAiResponse(result.error || 'AI could not generate a response.');
      }
    } catch (err) {
      setAiResponse(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading || !authData || !profile) {
    return <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>;
  }

  return (
    <>
      <StepIndicator currentStep={step} onStepClick={s => { if (s >= 2) setStep(s); }} />

      {/* Context strip */}
      <ContextStrip
        profileId={authData.profileId}
        bounds={boundsString || undefined}
        groupName={authData.groupName}
        domain={authData.domain}
      />

      {/* Step 2: Bounds */}
      {step === 2 && (
        <div className="card">
          <BoundsEditor
            profile={profile}
            onConfirm={handleBoundsConfirm}
            initialBounds={bounds || undefined}
            initialContext={context || undefined}
          />
        </div>
      )}

      {/* Step 3: Intent */}
      {step === 3 && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>What should your agent know?</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Help your agent understand your intent. Consider:
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
            <li><strong>Why</strong> — What's the situation? Why does this need to happen?</li>
            <li><strong>Goal</strong> — What should the agent try to achieve?</li>
            <li><strong>Watch out</strong> — What should the agent avoid or be careful about?</li>
          </ul>

          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <textarea
              className="form-textarea"
              placeholder="e.g. We're running a spring promotion. Process customer refunds up to $50. Don't refund orders older than 30 days. Flag anything that looks unusual."
              value={intent}
              onChange={e => setIntent(e.target.value)}
              style={{ minHeight: '160px' }}
            />
          </div>
          <div className="char-counter">
            {intent.length} / 2000
          </div>

          {/* AI Assist */}
          <div style={{ marginTop: '0.75rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleAskAI}
              disabled={aiLoading}
              style={{ fontSize: '0.8rem' }}
            >
              {aiLoading ? 'Thinking...' : 'Ask AI'}
            </button>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginLeft: '0.5rem' }}>
              Advisory only — AI surfaces reality, you supply intent.
            </span>
          </div>

          {aiResponse && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                AI Advisory
              </div>
              {aiResponse}
            </div>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={() => { setStep(2); setAiResponse(null); }}>Back</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleIntentNext}
              disabled={!intent.trim()}
            >
              Continue to Review
            </button>
          </div>
        </div>
      )}
    </>
  );
}
