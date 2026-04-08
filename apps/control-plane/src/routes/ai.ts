/**
 * AI routes — advisory-only AI assistant for gate content.
 *
 * All routes protected by requireAuth (applied in index.ts).
 * AI API key is decrypted from vault server-side — never sent to browser.
 */

import { Router, type Request, type Response } from 'express';
import type { Vault } from '../lib/vault';
import {
  getAIAssistance,
  testAIConnectivity,
  PROVIDER_PRESETS,
  type AIConfig,
  type AIAssistRequest,
} from '../lib/ai-client';

export function createAIRouter(vault: Vault): Router {
  const router = Router();

  /** Load AI config from vault, returning null if not configured. */
  function loadAIConfig(): AIConfig | null {
    const cred = vault.getCredential('ai-config');
    if (!cred) return null;
    return {
      provider: (cred.provider as AIConfig['provider']) || 'ollama',
      endpoint: cred.endpoint || 'http://localhost:11434',
      model: cred.model || 'llama3.2',
      apiKey: cred.apiKey || undefined,
    };
  }

  /**
   * POST /ai/assist
   * Body: { gate, currentText, context? }
   */
  router.post('/assist', async (req: Request, res: Response) => {
    const config = loadAIConfig();
    if (!config) {
      res.status(400).json({ error: 'AI not configured. Save AI settings in Settings > General.' });
      return;
    }

    const request = req.body as AIAssistRequest;
    if (!request.gate) {
      res.status(400).json({ error: 'Missing gate field (intent)' });
      return;
    }

    const result = await getAIAssistance(config, request);
    res.json(result);
  });

  /**
   * POST /ai/test
   * Body: optional { provider, endpoint, model, apiKey } — if absent, uses stored config.
   */
  router.post('/test', async (req: Request, res: Response) => {
    const body = req.body as Partial<AIConfig> | undefined;

    let config: AIConfig;
    if (body?.endpoint) {
      config = {
        provider: body.provider || 'ollama',
        endpoint: body.endpoint,
        model: body.model || '',
        apiKey: body.apiKey,
      };
    } else {
      const stored = loadAIConfig();
      if (!stored) {
        res.status(400).json({ ok: false, message: 'No AI config stored' });
        return;
      }
      config = stored;
    }

    const result = await testAIConnectivity(config);
    res.json(result);
  });

  /**
   * GET /ai/presets
   */
  router.get('/presets', (_req: Request, res: Response) => {
    res.json({ presets: PROVIDER_PRESETS });
  });

  return router;
}
