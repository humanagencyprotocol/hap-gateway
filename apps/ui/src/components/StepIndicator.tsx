interface Props {
  currentStep: number;
  totalSteps?: number;
  onStepClick?: (step: number) => void;
}

export function StepIndicator({ currentStep, totalSteps = 6, onStepClick }: Props) {
  return (
    <div className="step-indicator" style={{ marginBottom: '2.5rem' }}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isCurrent = step === currentStep;
        return (
          <div className="step" key={step}>
            {i > 0 && (
              <div className={`step-line${isCompleted ? ' completed' : ''}`} />
            )}
            <div
              className={`step-circle${isCompleted ? ' completed' : ''}${isCurrent ? ' current' : ''}`}
              onClick={isCompleted && onStepClick ? () => onStepClick(step) : undefined}
              style={isCompleted && onStepClick ? { cursor: 'pointer' } : undefined}
            >
              {isCompleted ? '\u2713' : step}
            </div>
          </div>
        );
      })}
    </div>
  );
}
