import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { StepIndicator } from '../components/StepIndicator';
import { GroupSelector } from '../components/GroupSelector';
import { DomainBadge } from '../components/DomainBadge';

const MOCK_PR = {
  repo: 'acme/api-gateway',
  number: 142,
  title: 'feat: add rate limiting to payment endpoints',
  branch: 'feature/rate-limit',
  base: 'main',
  author: 'jsmith',
  filesChanged: 5,
  additions: 142,
  deletions: 23,
  sha: 'a1b2c3d4e5f6',
  domains: [
    { name: 'engineering', attested: true },
    { name: 'release_management', attested: false },
  ],
  files: [
    { path: 'src/middleware/rate-limiter.ts', additions: 89, deletions: 0 },
    { path: 'src/routes/payment.ts', additions: 23, deletions: 5 },
    { path: 'src/config/defaults.ts', additions: 12, deletions: 3 },
    { path: 'tests/rate-limiter.test.ts', additions: 45, deletions: 0 },
    { path: 'package.json', additions: 3, deletions: 1 },
  ],
};

export function DeployReviewPage() {
  const { activeGroup, activeDomain } = useAuth();
  const [prRef, setPrRef] = useState('acme/api-gateway#142');
  const [prLoaded, setPrLoaded] = useState(false);
  const [deployStep, setDeployStep] = useState(1);
  const [gateContent, setGateContent] = useState({ problem: '', objective: '', tradeoffs: '' });

  const GATE_KEYS = ['problem', 'objective', 'tradeoffs'] as const;
  const gateStep = deployStep - 3; // 3->0=problem, 4->1=objective, 5->2=tradeoffs

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Deploy Review</h1>
        <p className="page-subtitle">Attest a pull request through the HAP gate flow.</p>
      </div>

      <GroupSelector />

      {/* Setup guide */}
      <details style={{ marginBottom: '1.5rem' }}>
        <summary className="card" style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>{'\u2139'}</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>First time? Set up your repository for HAP deploy reviews</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>Click to expand</span>
        </summary>
        <div className="card" style={{ borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: '-1px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
            Your repository needs two files for the deploy gate flow to work:
          </p>
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              1. <code>.hap/binding.json</code>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
              Declares which HAP profile and execution path apply to this repo.
            </p>
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              2. <code>.hap/owners.json</code>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
              Maps domains to GitHub users who are authorized to attest.
            </p>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              3. GitHub App (optional)
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Install the HAP GitHub App to get automatic check runs on PRs.
            </p>
          </div>
        </div>
      </details>

      {/* PR Loader */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>Load Pull Request</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            className="form-input"
            value={prRef}
            onChange={e => setPrRef(e.target.value)}
            placeholder="owner/repo#number"
            style={{ flex: 1, fontFamily: "'SF Mono', Monaco, monospace", fontSize: '0.85rem' }}
          />
          <button className="btn btn-primary" onClick={() => setPrLoaded(true)}>Load</button>
        </div>

        {prLoaded && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span style={{ fontWeight: 600 }}>{MOCK_PR.title}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>#{MOCK_PR.number}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              <code style={{ fontSize: '0.75rem' }}>{MOCK_PR.branch}</code>
              {' \u2192 '}
              <code style={{ fontSize: '0.75rem' }}>{MOCK_PR.base}</code>
              {' \u00B7 '}by {MOCK_PR.author} {'\u00B7'} {MOCK_PR.filesChanged} files changed {'\u00B7'} +{MOCK_PR.additions} -{MOCK_PR.deletions}
            </div>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {MOCK_PR.domains.map(d => (
                <DomainBadge key={d.name} domain={d.name} attested={d.attested} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Deploy Gate Wizard */}
      {prLoaded && (
        <div className="card">
          <StepIndicator currentStep={deployStep} />

          {/* Step 1: Context check */}
          {deployStep === 1 && (
            <>
              <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Gate 1: Context</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Confirm the authorization context before proceeding.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setDeployStep(2)}>
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 2: Execution context / Frame */}
          {deployStep === 2 && (
            <>
              <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Gate 2: Frame</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Review the execution context. This is what you're attesting to.
              </p>

              <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
                  Resolved Execution Context
                </div>
                <dl className="review-grid" style={{ marginBottom: 0 }}>
                  <dt>Profile</dt><dd>deploy-gate@0.3</dd>
                  <dt>Path</dt><dd>standard-deploy</dd>
                  <dt>Repo</dt><dd><code>{MOCK_PR.repo}</code></dd>
                  <dt>SHA</dt><dd><code style={{ fontSize: '0.8rem' }}>{MOCK_PR.sha}</code></dd>
                  <dt>Changed Paths</dt><dd>{MOCK_PR.filesChanged} files</dd>
                  <dt>Required</dt>
                  <dd>
                    {MOCK_PR.domains.map(d => (
                      <DomainBadge key={d.name} domain={d.name} attested={d.attested} />
                    ))}
                  </dd>
                </dl>
              </div>

              {/* Changed files accordion */}
              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0', color: 'var(--text-secondary)' }}>
                  Changed Files ({MOCK_PR.filesChanged})
                </summary>
                <div style={{ padding: '0.5rem 0', fontSize: '0.85rem' }}>
                  {MOCK_PR.files.map(f => (
                    <div key={f.path} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid var(--border)' }}>
                      <code style={{ fontSize: '0.8rem' }}>{f.path}</code>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>+{f.additions} -{f.deletions}</span>
                    </div>
                  ))}
                </div>
              </details>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setDeployStep(1)}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setDeployStep(3)}>
                  Continue to Problem
                </button>
              </div>
            </>
          )}

          {/* Steps 3-5: Gate questions */}
          {deployStep >= 3 && deployStep <= 5 && (
            <>
              <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>
                Gate {deployStep}: {['Problem', 'Objective', 'Tradeoffs'][gateStep]}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {gateStep === 0 && 'What problem does this deploy solve?'}
                {gateStep === 1 && 'What should this deploy achieve?'}
                {gateStep === 2 && 'What risks are you accepting with this deploy?'}
              </p>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <textarea
                  className="form-textarea"
                  value={gateContent[GATE_KEYS[gateStep]]}
                  onChange={e => setGateContent(prev => ({ ...prev, [GATE_KEYS[gateStep]]: e.target.value }))}
                  style={{ minHeight: '140px' }}
                />
              </div>
              <div className="char-counter">{gateContent[GATE_KEYS[gateStep]].length} / 2000</div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setDeployStep(deployStep - 1)}>Back</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => setDeployStep(deployStep + 1)}
                  disabled={!gateContent[GATE_KEYS[gateStep]].trim()}
                >
                  {deployStep < 5 ? 'Continue' : 'Continue to Review'}
                </button>
              </div>
            </>
          )}

          {/* Step 6: Review & Commit */}
          {deployStep === 6 && (
            <>
              <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Review &amp; Commit</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Review your deploy attestation before signing.
              </p>
              <dl className="review-grid">
                <dt>PR</dt><dd>{MOCK_PR.repo}#{MOCK_PR.number}</dd>
                <dt>Title</dt><dd>{MOCK_PR.title}</dd>
                <dt>SHA</dt><dd><code>{MOCK_PR.sha}</code></dd>
              </dl>
              <div className="gate-content-block">
                {GATE_KEYS.map(key => (
                  <div className="gate-content-item" key={key}>
                    <div className="gate-content-label">{key}</div>
                    <div className="gate-content-text">{gateContent[key]}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setDeployStep(5)}>Back</button>
                <button className="btn btn-primary btn-lg" style={{ flex: 1 }}>
                  Commit &mdash; Sign Attestation
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
