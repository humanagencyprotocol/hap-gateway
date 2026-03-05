import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { spClient } from '../lib/sp-client';
import { StepIndicator } from '../components/StepIndicator';
import { ContextStrip } from '../components/ContextStrip';
import { BoundsEditor } from '../components/BoundsEditor';
import type { AgentProfile, AgentFrameParams } from '@hap/core';

const GATE_QUESTIONS = [
  { key: 'problem', label: 'Problem', prompt: 'What problem does this agent authorization solve? Why is it needed right now?' },
  { key: 'objective', label: 'Objective', prompt: 'What should the agent achieve? What does success look like?' },
  { key: 'tradeoffs', label: 'Tradeoffs', prompt: 'What risks are you accepting? What constraints limit the exposure?' },
] as const;

interface AuthData {
  profileId: string;
  path: string;
  groupId?: string;
  groupName?: string;
  domain: string;
}

export function GateWizardPage() {
  const navigate = useNavigate();
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [step, setStep] = useState(2); // 2=bounds, 3=problem, 4=objective, 5=tradeoffs
  const [frame, setFrame] = useState<AgentFrameParams | null>(null);
  const [gateContent, setGateContent] = useState({ problem: '', objective: '', tradeoffs: '' });
  const [loading, setLoading] = useState(true);

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

  const boundsString = frame
    ? Object.entries(frame)
        .filter(([k]) => k !== 'profile' && k !== 'path')
        .map(([k, v]) => `${k} = ${v}`)
        .join(', ')
    : '';

  const handleBoundsConfirm = (f: AgentFrameParams) => {
    setFrame(f);
    setStep(3);
  };

  const handleGateNext = () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      // Save gate content and navigate to review
      sessionStorage.setItem('agentGate', JSON.stringify({ frame, gateContent }));
      navigate('/agent/review');
    }
  };

  const currentGateKey = step === 3 ? 'problem' : step === 4 ? 'objective' : 'tradeoffs';
  const currentGate = step >= 3 ? GATE_QUESTIONS[step - 3] : null;

  if (loading || !authData || !profile) {
    return <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>;
  }

  return (
    <>
      <StepIndicator currentStep={step} onStepClick={s => { if (s >= 2) setStep(s); }} />

      {/* Context strip */}
      <ContextStrip
        profileId={authData.profileId}
        path={authData.path}
        bounds={boundsString || undefined}
        groupName={authData.groupName}
        domain={authData.domain}
      />

      {/* Step 2: Bounds */}
      {step === 2 && (
        <div className="card">
          <BoundsEditor
            profile={profile}
            pathId={authData.path}
            onConfirm={handleBoundsConfirm}
            initialFrame={frame || undefined}
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

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleGateNext}
              disabled={!gateContent[currentGateKey as keyof typeof gateContent].trim()}
            >
              {step < 5 ? `Continue to ${GATE_QUESTIONS[step - 2].label}` : 'Continue to Review'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
