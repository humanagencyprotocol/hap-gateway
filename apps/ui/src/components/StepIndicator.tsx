import { useNavigate } from 'react-router-dom';

const STEP_LABELS = ['Bounds', 'Problem', 'Objective', 'Tradeoffs', 'Review', 'Authorize'];

interface Props {
  currentStep: number; // 2-7
  onStepClick?: (step: number) => void;
}

export function StepIndicator({ currentStep, onStepClick }: Props) {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '2.5rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        overflow: 'hidden',
      }}>
        {STEP_LABELS.map((label, i) => {
          const step = i + 2;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;
          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <div style={{
                  width: '1.5rem',
                  height: '2px',
                  background: isCompleted ? 'var(--accent)' : 'var(--border)',
                  flexShrink: 1,
                }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div
                  className={`step-circle${isCompleted ? ' completed' : ''}${isCurrent ? ' current' : ''}`}
                  onClick={isCompleted && onStepClick ? () => onStepClick(step) : undefined}
                  style={isCompleted && onStepClick ? { cursor: 'pointer' } : undefined}
                >
                  {isCompleted ? '\u2713' : i + 1}
                </div>
                <span className="step-label-text" style={{
                  fontSize: '0.6rem',
                  marginTop: '0.3rem',
                  color: isCurrent ? 'var(--accent)' : isCompleted ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                  fontWeight: isCurrent ? 600 : 400,
                  textAlign: 'center',
                }}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => navigate('/agent/new')}
        style={{ flexShrink: 0, fontSize: '0.8rem', marginTop: '0.15rem' }}
      >
        Cancel
      </button>
    </div>
  );
}
