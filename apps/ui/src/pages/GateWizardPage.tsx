import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { spClient } from '../lib/sp-client';
import { StepIndicator } from '../components/StepIndicator';
import { ContextStrip } from '../components/ContextStrip';
import { BoundsEditor } from '../components/BoundsEditor';
import type { AgentProfile, AgentBoundsParams, AgentContextParams } from '@hap/core';

const DEFAULT_GATE_QUESTIONS = [
  { key: 'problem', label: 'Why', prompt: 'Why does the agent need this? What problem are you solving?' },
  { key: 'objective', label: 'Goal', prompt: 'What should the agent achieve? What does success look like?' },
  { key: 'tradeoffs', label: 'Risks', prompt: 'What risks are you accepting? What limits the exposure?' },
] as const;

function getGateQuestions(profile: AgentProfile | null) {
  if (!profile?.gateQuestions) return DEFAULT_GATE_QUESTIONS;
  return [
    { key: 'problem', label: 'Why', prompt: profile.gateQuestions.problem?.question ?? DEFAULT_GATE_QUESTIONS[0].prompt },
    { key: 'objective', label: 'Goal', prompt: profile.gateQuestions.objective?.question ?? DEFAULT_GATE_QUESTIONS[1].prompt },
    { key: 'tradeoffs', label: 'Risks', prompt: profile.gateQuestions.tradeoffs?.question ?? DEFAULT_GATE_QUESTIONS[2].prompt },
  ] as const;
}

interface AuthData {
  profileId: string;
  groupId?: string;
  groupName?: string;
  domain: string;
}

export function GateWizardPage() {
  const navigate = useNavigate();
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [step, setStep] = useState(2); // 2=bounds, 3=problem, 4=objective, 5=tradeoffs
  const [bounds, setBounds] = useState<AgentBoundsParams | null>(null);
  const [context, setContext] = useState<AgentContextParams | null>(null);
  const [gateContent, setGateContent] = useState({ problem: '', objective: '', tradeoffs: '' });
  const [loading, setLoading] = useState(true);

  // AI assist state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('agentAuth');
    if (!stored) { navigate('/agent/new'); return; }
    const data: AuthData = JSON.parse(stored);
    setAuthData(data);

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
    setStep(3);
  };

  const handleGateNext = () => {
    if (step < 5) {
      setStep(step + 1);
      setAiResponse(null);
    } else {
      // Save gate content + TTL config and navigate to review
      const ttlConfig = profile?.ttl;
      sessionStorage.setItem('agentGate', JSON.stringify({ bounds, context, gateContent, ttlConfig }));
      navigate('/agent/review');
    }
  };

  const handleAskAI = async () => {
    const gate = step === 3 ? 'problem' : step === 4 ? 'objective' : 'tradeoffs';
    const gateKey = gate as keyof typeof gateContent;
    setAiLoading(true);
    setAiResponse(null);
    try {
      const result = await spClient.aiAssist({
        gate,
        currentText: gateContent[gateKey],
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

  const gateQuestions = getGateQuestions(profile);
  const currentGateKey = step === 3 ? 'problem' : step === 4 ? 'objective' : 'tradeoffs';
  const currentGate = step >= 3 ? gateQuestions[step - 3] : null;

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

      {/* Steps 3-5: Gate questions */}
      {step >= 3 && step <= 5 && currentGate && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>{currentGate.label}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {currentGate.prompt}
          </p>

          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <textarea
              className="form-textarea"
              placeholder={`Describe the ${currentGate.label.toLowerCase()}...`}
              value={gateContent[currentGateKey as keyof typeof gateContent]}
              onChange={e => setGateContent(prev => ({ ...prev, [currentGateKey]: e.target.value }))}
              style={{ minHeight: '140px' }}
            />
          </div>
          <div className="char-counter">
            {gateContent[currentGateKey as keyof typeof gateContent].length} / 2000
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
            <button className="btn btn-ghost" onClick={() => { setStep(step - 1); setAiResponse(null); }}>Back</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleGateNext}
              disabled={!gateContent[currentGateKey as keyof typeof gateContent].trim()}
            >
              {step < 5 ? `Continue to ${gateQuestions[step - 2].label}` : 'Continue to Review'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
