/**
 * Auth middleware — validates X-API-Key header on protected routes.
 *
 * The API key is validated against the vault's stored hash (set during login).
 * No cookies are used — the API key must be sent on every request.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Vault } from '../lib/vault';

export function requireAuth(vault: Vault) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey || !vault.isUnlocked() || !vault.validateApiKey(apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

/**
 * Variant of requireAuth that also accepts the API key via the `?key=` query
 * parameter. Used for the SSE /events route — native EventSource cannot send
 * custom headers, so we have to allow the key through the URL. Localhost-only
 * gateway architecture means the key isn't crossing untrusted networks.
 */
export function requireAuthQueryOrHeader(vault: Vault) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const headerKey = req.headers['x-api-key'] as string | undefined;
    const queryKey = typeof req.query.key === 'string' ? req.query.key : undefined;
    const apiKey = headerKey ?? queryKey;
    if (!apiKey || !vault.isUnlocked() || !vault.validateApiKey(apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}
