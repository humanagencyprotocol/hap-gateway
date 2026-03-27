import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { spClient, type GitHubRepo, type GitHubPull, type GitHubPullDetail, type GitHubPullFile } from '../lib/sp-client';
import { StepIndicator } from '../components/StepIndicator';
import { DomainBadge } from '../components/DomainBadge';
import DiffViewer from '../components/DiffViewer';

function getStatusColor(status: string): string {
  switch (status) {
    case 'added': return '#1a7f37';
    case 'removed': return '#cf222e';
    case 'renamed': return '#9a6700';
    default: return 'var(--text-secondary)';
  }
}

export function DeployReviewPage() {
  const { activeGroup, activeDomain } = useAuth();

  // GitHub config state
  const [ghConfigured, setGhConfigured] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  // Repo & PR selection
  const [selectedRepo, setSelectedRepo] = useState('');
  const [pulls, setPulls] = useState<GitHubPull[]>([]);
  const [pullsLoading, setPullsLoading] = useState(false);

  // Manual input fallback
  const [manualRef, setManualRef] = useState('');

  // Loaded PR state
  const [prData, setPrData] = useState<GitHubPullDetail | null>(null);
  const [prFiles, setPrFiles] = useState<GitHubPullFile[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState('');

  // File accordion expand state
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Gate wizard state
  const [deployStep, setDeployStep] = useState(0); // 0 = not started
  const [gateContent, setGateContent] = useState({ problem: '', objective: '', tradeoffs: '' });

  // AI assist state
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<Record<string, { suggestion?: string; error?: string }>>({});

  const GATE_KEYS = ['problem', 'objective', 'tradeoffs'] as const;

  // Track the owner/repo used to load the current PR (for display in review)
  const [prRef, setPrRef] = useState('');

  // Check GitHub config on mount
  useEffect(() => {
    spClient.getCredential('github-pat').then(status => {
      setGhConfigured(status.configured);
      if (status.configured) {
        setReposLoading(true);
        spClient.getGitHubRepos()
          .then(r => setRepos(r))
          .catch(() => {})
          .finally(() => setReposLoading(false));
      }
    }).catch(() => {});
  }, []);

  // Load open PRs when repo is selected
  useEffect(() => {
    if (!selectedRepo) {
      setPulls([]);
      return;
    }
    const [owner, repo] = selectedRepo.split('/');
    if (!owner || !repo) return;

    setPullsLoading(true);
    setPulls([]);
    spClient.getGitHubPulls(owner, repo)
      .then(p => setPulls(p))
      .catch(() => {})
      .finally(() => setPullsLoading(false));
  }, [selectedRepo]);

  // Parse PR reference: owner/repo#number or full GitHub URL
  const parsePrRef = useCallback((input: string): { owner: string; repo: string; number: number } | null => {
    // Try owner/repo#number
    const shortMatch = input.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    if (shortMatch) {
      return { owner: shortMatch[1], repo: shortMatch[2], number: parseInt(shortMatch[3]) };
    }
    // Try GitHub URL: https://github.com/owner/repo/pull/123
    const urlMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (urlMatch) {
      return { owner: urlMatch[1], repo: urlMatch[2], number: parseInt(urlMatch[3]) };
    }
    return null;
  }, []);

  // Load a specific PR
  const loadPR = useCallback(async (owner: string, repo: string, number: number) => {
    setPrLoading(true);
    setPrError('');
    setPrData(null);
    setPrFiles([]);
    setExpandedFiles(new Set());
    setDeployStep(0);
    setGateContent({ problem: '', objective: '', tradeoffs: '' });
    setAiResult({});
    setPrRef(`${owner}/${repo}#${number}`);

    try {
      const [detail, files] = await Promise.all([
        spClient.getGitHubPull(owner, repo, number),
        spClient.getGitHubPullFiles(owner, repo, number),
      ]);
      setPrData(detail);
      setPrFiles(files);
    } catch (err) {
      setPrError(err instanceof Error ? err.message : 'Failed to load PR');
    } finally {
      setPrLoading(false);
    }
  }, []);

  // Handle clicking a PR card
  const handlePRClick = useCallback((pr: GitHubPull) => {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split('/');
    loadPR(owner, repo, pr.number);
  }, [selectedRepo, loadPR]);

  // Handle manual PR load
  const handleManualLoad = useCallback(() => {
    const parsed = parsePrRef(manualRef.trim());
    if (!parsed) {
      setPrError('Format: owner/repo#number or GitHub PR URL');
      return;
    }
    loadPR(parsed.owner, parsed.repo, parsed.number);
  }, [manualRef, parsePrRef, loadPR]);

  // Toggle file expansion
  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // AI assist handler
  const handleAiAssist = useCallback(async (gate: 'problem' | 'objective' | 'tradeoffs') => {
    if (!prData) return;
    setAiLoading(gate);
    setAiResult(prev => ({ ...prev, [gate]: {} }));

    const fileSummary = prData.files
      .map(f => `${f.status} ${f.path} (+${f.additions} -${f.deletions})`)
      .join('\n');

    const result = await spClient.aiAssist({
      gate,
      currentText: gateContent[gate],
      context: {
        prTitle: prData.title,
        prBody: prData.body ?? undefined,
        prBranch: `${prData.branch} -> ${prData.base}`,
        prFileSummary: fileSummary,
      },
    });

    setAiResult(prev => ({
      ...prev,
      [gate]: result.success ? { suggestion: result.suggestion } : { error: result.error || 'AI request failed' },
    }));
    setAiLoading(null);
  }, [prData, gateContent]);

  // Gate step indices: 1=Context, 2=Frame, 3=Problem, 4=Objective, 5=Tradeoffs, 6=Review
  const gateStep = deployStep - 3; // maps step 3->0(problem), 4->1(objective), 5->2(tradeoffs)

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Deploy Review</h1>
        <p className="page-subtitle">Attest a pull request through the HAP gate flow.</p>
      </div>

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

      {/* PR Selection Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>Select Pull Request</h3>

        {!ghConfigured && (
          <div className="status-banner status-banner-warn" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
            <span className="status-banner-icon">{'\u26A0'}</span>
            <span className="status-banner-text">
              GitHub PAT not configured. Go to Settings &gt; General to add one.
            </span>
          </div>
        )}

        {/* Repo selector */}
        {ghConfigured && (
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Repository</label>
            <select
              className="form-input"
              value={selectedRepo}
              onChange={e => setSelectedRepo(e.target.value)}
              style={{ fontSize: '0.85rem' }}
              disabled={reposLoading}
            >
              <option value="">{reposLoading ? 'Loading repos...' : 'Select a repository'}</option>
              {repos.map(r => (
                <option key={r.fullName} value={r.fullName}>
                  {r.fullName}{r.private ? ' (private)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Open PRs list */}
        {selectedRepo && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Open Pull Requests
            </div>
            {pullsLoading && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '0.5rem 0' }}>
                Loading pull requests...
              </div>
            )}
            {!pullsLoading && pulls.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '0.5rem 0' }}>
                No open pull requests found.
              </div>
            )}
            {!pullsLoading && pulls.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {pulls.map(pr => (
                  <button
                    key={pr.number}
                    onClick={() => handlePRClick(pr)}
                    disabled={prLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 0.75rem',
                      background: prData?.number === pr.number ? 'var(--accent-bg)' : 'var(--bg-main)',
                      border: `1px solid ${prData?.number === pr.number ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      fontSize: '0.85rem',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '0.8rem', flexShrink: 0 }}>
                      #{pr.number}
                    </span>
                    <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.title}
                    </span>
                    <code style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {pr.branch}
                    </code>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {pr.author}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manual input */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.375rem' }}>
            Or enter manually
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="form-input"
              value={manualRef}
              onChange={e => setManualRef(e.target.value)}
              placeholder="owner/repo#number or GitHub PR URL"
              onKeyDown={e => e.key === 'Enter' && handleManualLoad()}
              style={{ flex: 1, fontFamily: "'SF Mono', Monaco, monospace", fontSize: '0.85rem' }}
            />
            <button
              className="btn btn-primary"
              onClick={handleManualLoad}
              disabled={prLoading || !ghConfigured}
            >
              {prLoading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>

        {prError && (
          <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{prError}</div>
        )}
      </div>

      {/* PR Details + Files */}
      {prData && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          {/* PR header */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span style={{ fontWeight: 600, fontSize: '1rem' }}>{prData.title}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>#{prData.number}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
              <code style={{ fontSize: '0.75rem' }}>{prData.branch}</code>
              <span>{'\u2192'}</span>
              <code style={{ fontSize: '0.75rem' }}>{prData.base}</code>
              <span>{'\u00B7'}</span>
              <span>by {prData.author}</span>
              <span>{'\u00B7'}</span>
              <span>{prData.filesChanged} files</span>
              <span>{'\u00B7'}</span>
              <span style={{ color: '#1a7f37' }}>+{prData.additions}</span>
              <span style={{ color: '#cf222e' }}>-{prData.deletions}</span>
            </div>
            {prData.body && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: '120px', overflow: 'auto' }}>
                {prData.body}
              </div>
            )}
          </div>

          {/* Changed files with diffs */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Changed Files ({prData.filesChanged})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {prFiles.map(f => {
                const isExpanded = expandedFiles.has(f.path);
                return (
                  <div key={f.path}>
                    <button
                      onClick={() => toggleFile(f.path)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.375rem 0.5rem',
                        background: 'none',
                        border: '1px solid var(--border)',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                        {isExpanded ? '\u25BC' : '\u25B6'}
                      </span>
                      <span style={{ color: getStatusColor(f.status), fontSize: '0.7rem', fontWeight: 600, flexShrink: 0, textTransform: 'uppercase' }}>
                        {f.status.charAt(0)}
                      </span>
                      <code style={{ flex: 1, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.path}
                      </code>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                        <span style={{ color: '#1a7f37' }}>+{f.additions}</span>{' '}
                        <span style={{ color: '#cf222e' }}>-{f.deletions}</span>
                      </span>
                    </button>
                    {isExpanded && f.patch && (
                      <DiffViewer patch={f.patch} filename={f.path} status={f.status} />
                    )}
                    {isExpanded && !f.patch && (
                      <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        Binary file or diff too large to display
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Start gate review button */}
          {deployStep === 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                onClick={() => setDeployStep(1)}
              >
                Start Gate Review
              </button>
            </div>
          )}
        </div>
      )}

      {/* Deploy Gate Wizard */}
      {prData && deployStep >= 1 && (
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
                  <dt>PR</dt><dd><code>{prRef}</code></dd>
                  <dt>Title</dt><dd>{prData.title}</dd>
                  <dt>SHA</dt><dd><code style={{ fontSize: '0.8rem' }}>{prData.sha}</code></dd>
                  <dt>Changed Paths</dt><dd>{prData.filesChanged} files</dd>
                </dl>
              </div>

              {/* Changed files accordion */}
              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0', color: 'var(--text-secondary)' }}>
                  Changed Files ({prData.filesChanged})
                </summary>
                <div style={{ padding: '0.5rem 0', fontSize: '0.85rem' }}>
                  {prData.files.map(f => (
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

          {/* Steps 3-5: Gate questions with AI assist */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div className="char-counter">{gateContent[GATE_KEYS[gateStep]].length} / 2000</div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                  onClick={() => handleAiAssist(GATE_KEYS[gateStep])}
                  disabled={aiLoading === GATE_KEYS[gateStep]}
                >
                  {aiLoading === GATE_KEYS[gateStep] ? 'Thinking...' : 'Ask AI'}
                </button>
              </div>

              {/* AI result */}
              {aiResult[GATE_KEYS[gateStep]]?.suggestion && (
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  fontSize: '0.8rem',
                  lineHeight: 1.6,
                }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    AI Advisory
                  </div>
                  <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {aiResult[GATE_KEYS[gateStep]].suggestion}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    AI surfaces reality. You supply intent.
                  </div>
                </div>
              )}
              {aiResult[GATE_KEYS[gateStep]]?.error && (
                <div className="alert alert-error" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
                  AI: {aiResult[GATE_KEYS[gateStep]].error}
                </div>
              )}

              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
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
                <dt>PR</dt><dd>{prRef}</dd>
                <dt>Title</dt><dd>{prData.title}</dd>
                <dt>SHA</dt><dd><code>{prData.sha}</code></dd>
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
