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
