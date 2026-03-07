/**
 * AI Client — advisory-only assistant for gate content.
 *
 * Multi-provider support: Ollama, OpenAI, Groq, Together.
 * AI may surface reality, but it may not supply intent.
 *
 * Ported from demo-deploy/apps/ui/src/local-ai/client.ts
 * Key difference: runs server-side, keys never sent to browser.
 */

export interface AIConfig {
  provider: 'ollama' | 'openai-compatible';
  endpoint: string;
  model: string;
  apiKey?: string;
}

export const PROVIDER_PRESETS: Record<string, AIConfig> = {
  ollama: {
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    model: 'llama3.2',
  },
  openai: {
    provider: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  groq: {
    provider: 'openai-compatible',
    endpoint: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
  },
  together: {
    provider: 'openai-compatible',
    endpoint: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3-8b-chat-hf',
  },
  openrouter: {
    provider: 'openai-compatible',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4',
  },
};

export interface AIAssistRequest {
  gate: 'problem' | 'objective' | 'tradeoffs';
  currentText: string;
  context?: {
    profileId?: string;
    path?: string;
    bounds?: string;
    prTitle?: string;
    prBody?: string;
    prBranch?: string;
    prFileSummary?: string;
  };
}

export interface AIAssistResponse {
  success: boolean;
  suggestion?: string;
  error?: string;
  disclaimer: string;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  problem: `You are a reviewing assistant helping a human articulate what problem an agent authorization addresses.

Your role:
- Help the reviewer think through what problem needs solving
- Surface observations about the context
- Ask clarifying questions

You must NOT:
- Propose wording for the problem statement
- Tell the reviewer what to write
- Make decisions for the reviewer

Keep responses to 2-3 short paragraphs. Use **Observation**, **Question**, or **Consideration** headers.`,

  objective: `You are a reviewing assistant helping a human articulate what an agent should achieve.

Your role:
- Help the reviewer think through what success looks like
- Surface potential gaps between stated objective and context

You must NOT:
- Suggest a better objective
- Rewrite the objective
- Make recommendations

Keep responses to 2-3 short paragraphs. Use **Observation**, **Question**, or **Consideration** headers.`,

  tradeoffs: `You are a reviewing assistant helping a human reflect on risks and tradeoffs.

Your role:
- Surface risks the reviewer may not have considered
- Ask about constraints and exposure limits
- Help identify what could go wrong

You must NOT:
- Recommend specific tradeoffs
- Judge acceptability of risks
- Suggest wording

Keep responses to 2-3 short paragraphs. Use **Observation**, **Question**, or **Consideration** headers.`,
};

export async function getAIAssistance(
  config: AIConfig,
  request: AIAssistRequest,
): Promise<AIAssistResponse> {
  const disclaimer = 'AI surfaces reality. You supply intent.';

  const systemPrompt = SYSTEM_PROMPTS[request.gate] ?? SYSTEM_PROMPTS.problem;

  const contextParts: string[] = [];
  if (request.context?.profileId) contextParts.push(`Profile: ${request.context.profileId}`);
  if (request.context?.path) contextParts.push(`Path: ${request.context.path}`);
  if (request.context?.bounds) contextParts.push(`Bounds: ${request.context.bounds}`);
  if (request.context?.prTitle) contextParts.push(`PR Title: ${request.context.prTitle}`);
  if (request.context?.prBody) contextParts.push(`PR Description: ${request.context.prBody}`);
  if (request.context?.prBranch) contextParts.push(`Branch: ${request.context.prBranch}`);
  if (request.context?.prFileSummary) contextParts.push(`Changed Files:\n${request.context.prFileSummary}`);

  const userPrompt = [
    contextParts.length > 0 ? `Context:\n${contextParts.join('\n')}` : '',
    request.currentText
      ? `The reviewer has written:\n"${request.currentText}"`
      : 'The reviewer has not yet written anything.',
    `Help them think through the ${request.gate}.`,
  ].filter(Boolean).join('\n\n');

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  try {
    let suggestion: string;

    if (config.provider === 'ollama') {
      const response = await fetch(`${config.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          options: { temperature: 0.1, num_predict: 300 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Ollama: ${response.status}`);
      const data = await response.json() as { message?: { content?: string } };
      suggestion = data.message?.content?.trim() || 'No response generated.';
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const response = await fetch(`${config.endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.1,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI provider: ${response.status} - ${errorText}`);
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      suggestion = data.choices?.[0]?.message?.content?.trim() || 'No response generated.';
    }

    return { success: true, suggestion, disclaimer };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      disclaimer,
    };
  }
}

export async function testAIConnectivity(config: AIConfig): Promise<{ ok: boolean; message: string }> {
  try {
    if (config.provider === 'ollama') {
      const res = await fetch(`${config.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`Ollama: ${res.status}`);
      return { ok: true, message: 'Ollama is reachable' };
    } else {
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const res = await fetch(`${config.endpoint}/models`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`AI provider: ${res.status}`);
      return { ok: true, message: 'AI provider is reachable' };
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Connection failed' };
  }
}
