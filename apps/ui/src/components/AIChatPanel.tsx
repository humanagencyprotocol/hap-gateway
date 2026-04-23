import { useState, useRef, useEffect } from 'react';
import { spClient } from '../lib/sp-client';

export type ChatTarget =
  | { kind: 'context' }
  | { kind: 'intent'; profileId?: string; path?: string; bounds?: string };

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  target: ChatTarget;
  /** Current draft of the document being refined. Passed to the AI on every turn
   *  so the model sees the latest state, not the version from when the chat
   *  started. */
  currentText: string;
  /** Called when the user clicks "Apply" on a draft in an assistant message.
   *  Receives the extracted fenced block, or the whole reply if no fence. */
  onApply: (text: string) => void;
  /** Placeholder for the input. Defaults to a target-appropriate hint. */
  placeholder?: string;
  /** Optional heading text above the chat. */
  title?: string;
}

/**
 * Extract the first ```markdown (or ```) fenced block from a reply. The chat
 * system prompt instructs the AI to wrap full-document drafts this way so
 * Apply can pull the draft cleanly. Returns null if no fenced block is found.
 */
function extractDraft(text: string): string | null {
  const match = text.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/);
  return match?.[1]?.trim() ?? null;
}

export function AIChatPanel({ target, currentText, onApply, placeholder, title }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message when history grows.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const defaultPlaceholder = target.kind === 'context'
    ? 'Ask for help drafting standing orders, or paste a sketch…'
    : 'Ask for help articulating the intent…';

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const result = await spClient.aiChat({
        target,
        currentText,
        messages: nextMessages,
      });
      if (result.success && result.reply) {
        setMessages(m => [...m, { role: 'assistant', content: result.reply! }]);
      } else {
        setError(result.error ?? 'AI returned no reply');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter sends. Plain Enter inserts a newline — the input is
    // a textarea because users paste multi-line drafts.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    if (!confirm('Clear the chat?')) return;
    setMessages([]);
    setError(null);
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '20rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title ?? 'AI Assistant'}
        </div>
        {messages.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleReset}
            style={{ fontSize: '0.7rem', padding: '0.125rem 0.5rem' }}
          >
            Clear
          </button>
        )}
      </div>

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '28rem',
          border: '1px solid var(--border)',
          borderRadius: '0.375rem',
          background: 'var(--bg-main)',
          padding: '0.75rem',
          fontSize: '0.85rem',
          lineHeight: 1.5,
          marginBottom: '0.5rem',
        }}
      >
        {messages.length === 0 && !loading && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
            Ask the assistant for help with the
            {target.kind === 'context' ? ' brief' : ' intent'}. It sees your current draft
            automatically. When it proposes a full draft, an "Apply" button appears.
          </div>
        )}

        {messages.map((m, i) => {
          const draft = m.role === 'assistant' ? extractDraft(m.content) : null;
          return (
            <div key={i} style={{ marginBottom: '0.75rem' }}>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: m.role === 'user' ? 'var(--accent)' : 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.15rem',
              }}>
                {m.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                {m.content}
              </div>
              {draft !== null && (
                <div style={{ marginTop: '0.4rem' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => onApply(draft)}
                    title="Replace the current draft with the fenced block above"
                  >
                    Apply this draft
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: '0.5rem' }}>
          {error}
        </div>
      )}

      <textarea
        className="form-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? defaultPlaceholder}
        rows={3}
        disabled={loading}
        style={{ fontSize: '0.85rem', resize: 'vertical', marginBottom: '0.5rem' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
          Cmd/Ctrl+Enter to send
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
