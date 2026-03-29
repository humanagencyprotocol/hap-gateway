/**
 * Auth routes — cookie-less API key authentication.
 *
 * Login: rate-limited, validates API key against SP, captures SP session cookie
 * server-side, derives vault key, pushes both to MCP. No cookies sent to browser.
 *
 * Logout: requires auth (prevents anonymous DoS).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { configure, pushServiceCredentials, resyncGates } from '../lib/mcp-bridge';
import type { Vault } from '../lib/vault';

const SP_URL = process.env.HAP_SP_URL ?? 'https://www.humanagencyprotocol.com';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

export function createAuthRouter(vault: Vault, logoutAuth: Middleware, loginRateLimit: Middleware): Router {
  const router = Router();

  /**
   * POST /auth/login
   * Header: X-API-Key: hap_xxx
   *
   * 1. Rate-limited (10 attempts / minute per IP)
   * 2. Calls SP POST /api/auth/session with X-API-Key
   * 3. Captures SP session cookie -> server-side only
   * 4. Derives vault key from API key
   * 5. Pushes cookie + vault key to MCP
   * 6. Returns { user, groups } — NO Set-Cookie headers
   */
  router.post('/login', loginRateLimit, async (req: Request, res: Response) => {
    const apiKey = (req.headers['x-api-key'] as string) || (req.body as { apiKey?: string })?.apiKey;
    if (!apiKey) {
      res.status(400).json({ error: 'Missing API key (X-API-Key header or body.apiKey)' });
      return;
    }

    // Prevent concurrent sessions — one gateway, one user
    const force = req.query.force === 'true' || (req.body as { force?: boolean })?.force === true;
    if (vault.isUnlocked() && !force) {
      res.status(409).json({
        error: 'Another session is already active. Log out first, or use force=true to override.',
      });
      return;
    }

    try {
      const spRes = await fetch(`${SP_URL}/api/auth/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      });

      if (!spRes.ok) {
        const err = await spRes.json().catch(() => ({ error: 'Invalid API key' }));
        res.status(spRes.status).json(err);
        return;
      }

      // Capture SP session cookie — store server-side, never send to browser
      const setCookieHeaders = spRes.headers.getSetCookie?.() ?? [];
      const sessionCookie = setCookieHeaders.join('; ');
      vault.setSpCookie(sessionCookie);

      // Derive vault encryption key from API key
      vault.deriveAndSetKey(apiKey);

      // Push session cookie + vault key to MCP server (must complete before responding)
      if (sessionCookie) {
        try {
          await configure(sessionCookie, vault.getVaultKeyHex());
        } catch (err) {
          console.error('[Control Plane] Failed to configure MCP:', err);
        }
      }

      // Return user data immediately — don't block on credential sync
      const data = await spRes.json();
      res.json(data);

      // Background: re-push credentials and re-sync gates (non-blocking)
      (async () => {
        for (const credId of vault.listCredentials()) {
          try {
            const creds = vault.getCredential(credId);
            if (creds) {
              await pushServiceCredentials(credId, creds);
              console.error(`[Control Plane] Pushed ${credId} credentials to MCP`);
            }
          } catch (err) {
            console.error(`[Control Plane] Failed to push ${credId} credentials:`, err);
          }
        }
        try {
          const { synced } = await resyncGates();
          if (synced > 0) {
            console.error(`[Control Plane] Re-synced ${synced} gate(s) with SP`);
          }
        } catch (err) {
          console.error('[Control Plane] Failed to re-sync gates:', err);
        }
      })().catch(() => {});
    } catch (err) {
      console.error('[Control Plane] Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  /**
   * POST /auth/logout
   * Requires valid X-API-Key — prevents anonymous DoS.
   * Clears vault key + SP cookie from memory.
   */
  router.post('/logout', logoutAuth, (_req: Request, res: Response) => {
    vault.clearKey();
    res.json({ ok: true });
  });

  return router;
}
