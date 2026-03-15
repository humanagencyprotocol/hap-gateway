/**
 * Vault routes — encrypted credential and service management.
 *
 * All routes are protected by requireAuth middleware (applied in index.ts).
 * Never returns decrypted secret values — only masked versions or {configured: true}.
 */

import { Router, type Request, type Response } from 'express';
import type { Vault, ServiceDef } from '../lib/vault';
import { pushServiceCredentials } from '../lib/mcp-bridge';

// Built-in services that appear by default
const BUILTIN_SERVICES: ServiceDef[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payments, invoices, and billing via Stripe MCP',
    icon: '\u{1F4B3}',
    tools: ['create_invoice_item', 'create_payment_link', 'create_refund'],
    profile: 'spend',
    credFields: [
      { label: 'API Key', key: 'apiKey', type: 'password', placeholder: 'sk_live_...' },
      { label: 'Webhook Secret', key: 'webhookSecret', type: 'password', placeholder: 'whsec_...' },
    ],
  },
  {
    id: 'email-service',
    name: 'Email Service',
    description: 'Send and manage email communications',
    icon: '\u2709',
    tools: ['send_email', 'list_templates'],
    profile: 'publish',
    credFields: [
      { label: 'SMTP Host', key: 'host', type: 'text', placeholder: 'smtp.example.com' },
      { label: 'API Key', key: 'apiKey', type: 'password', placeholder: 'SG.xxx' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'Customer relationship management',
    icon: '\u{1F4C7}',
    tools: ['search_contacts', 'update_record'],
    credFields: [
      { label: 'Instance URL', key: 'url', type: 'text', placeholder: 'https://your-instance.crm.com' },
      { label: 'Access Token', key: 'token', type: 'password' },
    ],
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Application performance monitoring',
    icon: '\u{1F4CA}',
    tools: ['get_metrics', 'create_alert'],
    credFields: [
      { label: 'API Key', key: 'apiKey', type: 'password' },
      { label: 'Region', key: 'region', type: 'text', placeholder: 'us-east-1' },
    ],
  },
];

export function createVaultRouter(vault: Vault): Router {
  const router = Router();

  // Ensure built-in services exist in the services file
  function ensureBuiltinServices(): void {
    for (const svc of BUILTIN_SERVICES) {
      if (!vault.getService(svc.id)) {
        vault.setService(svc.id, svc);
      }
    }
  }

  /**
   * GET /vault/status
   */
  router.get('/status', (_req: Request, res: Response) => {
    const credNames = vault.listCredentials();
    ensureBuiltinServices();
    const services = vault.listServices();
    res.json({
      initialized: vault.isUnlocked(),
      credentialNames: credNames,
      serviceCount: services.length,
    });
  });

  /**
   * GET /vault/credentials/:name
   * Returns { configured: true, fieldNames: [...] } — never the actual values.
   */
  router.get('/credentials/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    const cred = vault.getCredential(name);
    if (!cred) {
      res.json({ configured: false });
      return;
    }
    // Return non-secret fields in clear, mask secret-looking ones
    const SECRET_KEYS = ['apiKey', 'apikey', 'api_key', 'pat', 'token', 'secret', 'password', 'webhookSecret'];
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(cred)) {
      if (SECRET_KEYS.includes(key)) {
        fields[key] = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
      } else {
        fields[key] = value;
      }
    }
    res.json({ configured: true, fieldNames: Object.keys(cred), fields });
  });

  /**
   * PUT /vault/credentials/:name
   * Body: { field1: "value1", field2: "value2", ... }
   */
  router.put('/credentials/:name', async (req: Request, res: Response) => {
    const { name } = req.params;
    const fields = req.body as Record<string, string>;

    vault.setCredential(name, fields);

    // Push decrypted creds to MCP for service use
    try {
      await pushServiceCredentials(name, fields);
    } catch (err) {
      console.error(`[Vault] Failed to push credentials to MCP for ${name}:`, err);
    }

    res.json({ ok: true });
  });

  /**
   * DELETE /vault/credentials/:name
   */
  router.delete('/credentials/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    vault.deleteCredential(name);
    res.json({ ok: true });
  });

  /**
   * GET /vault/services
   * Returns all services (built-in + user-added). No secret values.
   */
  router.get('/services', (_req: Request, res: Response) => {
    ensureBuiltinServices();
    const services = vault.listServices();
    const credNames = vault.listCredentials();

    const result = services.map(svc => ({
      ...svc,
      encryptedFields: undefined, // strip encrypted data
      status: credNames.includes(svc.id) ? 'connected' : 'missing',
    }));

    res.json({ services: result });
  });

  /**
   * PUT /vault/services/:id
   * Body: { name, description, icon?, tools?, profile?, credFields, credentials? }
   */
  router.put('/services/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { credentials, ...serviceDef } = req.body as ServiceDef & { credentials?: Record<string, string> };

    vault.setService(id, { ...serviceDef, id });

    // If credentials provided, encrypt and store them too
    if (credentials && Object.keys(credentials).length > 0) {
      vault.setCredential(id, credentials);
      try {
        await pushServiceCredentials(id, credentials);
      } catch (err) {
        console.error(`[Vault] Failed to push service credentials to MCP for ${id}:`, err);
      }
    }

    res.json({ ok: true });
  });

  /**
   * DELETE /vault/services/:id
   */
  router.delete('/services/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    vault.deleteService(id);
    vault.deleteCredential(id);
    res.json({ ok: true });
  });

  /**
   * POST /vault/test/:name
   * Tests credential connectivity server-side (uses decrypted creds).
   */
  router.post('/test/:name', async (req: Request, res: Response) => {
    const { name } = req.params;
    const cred = vault.getCredential(name);
    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    // Basic connectivity test based on credential type
    try {
      if (name === 'github-pat' && cred.pat) {
        const ghRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${cred.pat}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!ghRes.ok) throw new Error(`GitHub API: ${ghRes.status}`);
        const user = await ghRes.json() as { login: string };
        res.json({ ok: true, message: `Authenticated as ${user.login}` });
        return;
      }

      if (name === 'ai-config' && cred.endpoint) {
        const headers: Record<string, string> = {};
        if (cred.apiKey) headers['Authorization'] = `Bearer ${cred.apiKey}`;

        if (cred.provider === 'ollama') {
          const r = await fetch(`${cred.endpoint}/api/tags`, {
            signal: AbortSignal.timeout(3000),
          });
          if (!r.ok) throw new Error(`Ollama: ${r.status}`);
        } else {
          const r = await fetch(`${cred.endpoint}/models`, {
            headers,
            signal: AbortSignal.timeout(3000),
          });
          if (!r.ok) throw new Error(`AI provider: ${r.status}`);
        }
        res.json({ ok: true, message: 'AI provider is reachable' });
        return;
      }

      // Generic: just report that credential exists
      res.json({ ok: true, message: `Credential "${name}" is configured with ${Object.keys(cred).length} field(s)` });
    } catch (err) {
      res.json({ ok: false, message: err instanceof Error ? err.message : 'Connection test failed' });
    }
  });

  return router;
}
