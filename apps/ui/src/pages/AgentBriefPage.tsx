import { useState, useEffect, useCallback } from 'react';
import { spClient } from '../lib/sp-client';
import { AIChatPanel } from '../components/AIChatPanel';

// Plain-spoken default brief for first-time users. Covers what HAP is,
// how to behave under bounded authority, when to pull intent details on
// demand, and a few example standing-orders. Intentionally generic — the
// user tailors it for their actual workflow.
const STARTER_TEMPLATE = `# Agent Brief

You act on my behalf under the Human Agency Protocol (HAP). You have
bounded authorities — each one describes an area of authority, a set of
numeric limits, and a scope. Operate inside those bounds or the
Gatekeeper will reject your action.

## Before you act in a domain

1. Call \`list-authorizations(domain: "<domain>")\` to load the full
   intent, scope, and usage for that area. The session brief shows only
   a one-line summary per authority — the Intent paragraph lives behind
   that call, and often contains soft rules you MUST honor (e.g. "never
   publish on weekends", "only reply in English").
2. If the action would exceed a bound or fall outside the scope, stop
   and explain what would be blocked instead of trying.
3. If you're not sure whether an action is covered, ask me first.

## How to handle reviews

Authorizations in review mode require my approval before the action
executes. When you propose an action:
- Include everything I need to judge it (title, recipients, amounts,
  dates, attendees) in the tool arguments.
- Don't batch unrelated proposals — one proposal per decision.

## Standing orders

(Add your own here. Examples:)

- Every morning, summarize today's calendar and flag conflicts.
- On Fridays, give me a weekly review: what's done, what slipped, what's
  next.
- Never email anyone outside the company without asking first.
- When drafting posts, prefer plain language over marketing copy.
`;

export function AgentBriefPage() {
  const [context, setContext] = useState<string>('');
  const [originalContext, setOriginalContext] = useState<string>('');
  const [preview, setPreview] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const dirty = context !== originalContext;
  const byteLength = new Blob([context]).size;
  const MAX_BYTES = 16 * 1024;

  // Initial load of context.md + preview.
  useEffect(() => {
    let cancelled = false;
    spClient.getAgentContext()
      .then(c => {
        if (cancelled) return;
        setContext(c);
        setOriginalContext(c);
      })
      .catch(err => {
        if (cancelled) return;
        setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to load context' });
      })
      .finally(() => { if (!cancelled) setLoadingContext(false); });
    return () => { cancelled = true; };
  }, []);

  const refreshPreview = useCallback(() => {
    setLoadingPreview(true);
    spClient.getAgentBriefPreview()
      .then(setPreview)
      .catch(err => setPreview(`(preview unavailable: ${err instanceof Error ? err.message : 'unknown error'})`))
      .finally(() => setLoadingPreview(false));
  }, []);

  useEffect(() => { refreshPreview(); }, [refreshPreview]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await spClient.saveAgentContext(context);
      setOriginalContext(context);
      setMessage({ kind: 'ok', text: 'Saved. New MCP sessions will pick this up on next connect.' });
      refreshPreview();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setContext(originalContext);
    setMessage(null);
  };

  const handleStarter = () => {
    if (context.trim() && !confirm('Replace current context with the starter template?')) return;
    setContext(STARTER_TEMPLATE);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Agent Brief</h1>
        <p className="page-subtitle">
          Standing orders for agents that connect via MCP. This text
          prepends every new session — keep it tight.
        </p>
      </div>

      {message && (
        <div
          className={message.kind === 'ok' ? 'alert alert-success' : 'error-message'}
          style={{ marginBottom: '1rem' }}
        >
          {message.text}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            context.md
          </div>
          <div style={{ fontSize: '0.75rem', color: byteLength > MAX_BYTES ? 'var(--danger)' : 'var(--text-tertiary)' }}>
            {byteLength.toLocaleString()} / {MAX_BYTES.toLocaleString()} bytes
          </div>
        </div>

        <textarea
          className="form-input"
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder={loadingContext ? 'Loading…' : 'Type your standing orders here, or click "Insert starter template" below.'}
          disabled={loadingContext}
          rows={18}
          style={{ fontFamily: "'SF Mono', Monaco, monospace", fontSize: '0.85rem', lineHeight: 1.5, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !dirty || byteLength > MAX_BYTES || loadingContext}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRevert}
            disabled={saving || !dirty}
          >
            Revert
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleStarter}
            disabled={saving || loadingContext}
            title="Insert a starter brief covering HAP basics and example standing orders"
          >
            Insert starter template
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <AIChatPanel
          target={{ kind: 'context' }}
          currentText={context}
          onApply={(text) => {
            if (context.trim() && !confirm('Replace the current context with the applied draft?')) return;
            setContext(text);
          }}
          title="Refine with AI — context.md"
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Session preview — what the next MCP connection receives
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={refreshPreview}
            disabled={loadingPreview}
            style={{ fontSize: '0.7rem', padding: '0.125rem 0.5rem' }}
          >
            {loadingPreview ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <pre
          style={{
            background: 'var(--bg-main)',
            padding: '0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '28rem',
            overflowY: 'auto',
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          {preview || '(loading…)'}
        </pre>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', marginBottom: 0 }}>
          This is the exact string sent as MCP <code>instructions</code> on
          every new session. Intents are pulled on demand via
          <code> list-authorizations(domain)</code>.
        </p>
      </div>
    </>
  );
}
