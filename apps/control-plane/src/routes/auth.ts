/**
 * Auth routes — cookie-less API key authentication.
 *
 * Login: rate-limited, validates API key against SP, captures SP session cookie
 * server-side, derives vault key, pushes both to MCP. No cookies sent to browser.
 *
 * Logout: requires auth (prevents anonymous DoS).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { configure, pushServiceCredentials, resyncGates, startPendingIntegrations, stopAllIntegrations } from '../lib/mcp-bridge';
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

      // Check if vault belongs to a different user — if so, wipe and start fresh
      if (vault.isVaultFromDifferentKey()) {
        console.error('[Control Plane] Different user detected — wiping vault and stopping integrations');
        try {
          await stopAllIntegrations();
        } catch (err) {
          console.error('[Control Plane] Failed to stop integrations:', err);
        }
        vault.wipe();
        // Re-derive key after wipe (wipe clears the salt, need a fresh one)
        vault.deriveAndSetKey(apiKey);
      }

      // Push session cookie + vault key to MCP server (must complete before responding)
      if (sessionCookie) {
        try {
          await configure(sessionCookie, vault.getVaultKeyHex());
        } catch (err) {
          console.error('[Control Plane] Failed to configure MCP:', err);
        }
      }

      // Return user data
      const data = await spRes.json();
      res.json(data);

      // Background: re-push credentials, trigger a pending-integrations retry,
      // and re-sync gates (non-blocking).
      //
      // The per-credential pushServiceCredentials path already fires
      // startIntegrationForService for integrations whose envKeys reference the
      // credId. The explicit startPendingIntegrations() afterwards catches
      // the case where an integration's envKeys reference a service id that
      // doesn't match the credId — so the sweep sees the updated credentials
      // and starts everything that's resolvable now. Silently-skipped
      // integrations log their missing keys on the MCP side.
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
          const { running } = await startPendingIntegrations();
          console.error(`[Control Plane] Post-unlock sweep — running: ${running.join(', ') || '(none)'}`);
        } catch (err) {
          console.error('[Control Plane] Post-unlock sweep failed:', err);
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
  router.post('/logout', logoutAuth, async (_req: Request, res: Response) => {
    try {
      await stopAllIntegrations();
    } catch (err) {
      console.error('[Control Plane] Failed to stop integrations on logout:', err);
    }
    vault.clearKey();
    res.json({ ok: true });
  });

  return router;
}
