/**
 * Vault routes — Phase 1 stubs for encrypted credential storage.
 */

import { Router, type Request, type Response } from 'express';

export const vaultRouter = Router();

/**
 * GET /vault/status
 */
vaultRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ initialized: false });
});

/**
 * POST /vault/credentials
 */
vaultRouter.post('/credentials', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented — credential vault coming in Phase 2' });
});
