/**
 * Auth routes — handles API key login against the hosted SP,
 * captures the session cookie, and pushes it to the MCP server.
 */

import { Router, type Request, type Response } from 'express';
import { configure } from '../lib/mcp-bridge';

const SP_URL = process.env.HAP_SP_URL ?? 'https://service.humanagencyprotocol.org';

export const authRouter = Router();

/**
 * POST /auth/login
 * Body: { apiKey: string }
 *
 * 1. Calls SP POST /api/auth/session with X-API-Key
 * 2. Captures the Set-Cookie from SP response
 * 3. Pushes session cookie to MCP server
 * 4. Forwards the cookie to the browser
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey) {
    res.status(400).json({ error: 'Missing apiKey' });
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

    // Capture Set-Cookie from SP response
    const setCookieHeaders = spRes.headers.getSetCookie?.() ?? [];
    const sessionCookie = setCookieHeaders.join('; ');

    // Push session cookie to MCP server via internal bridge
    if (sessionCookie) {
      try {
        await configure(sessionCookie);
      } catch (err) {
        console.error('[Control Plane] Failed to configure MCP with session cookie:', err);
      }
    }

    // Forward user data to browser
    const data = await spRes.json();

    // Rewrite cookies: strip Domain + Secure so they work on localhost
    for (const header of setCookieHeaders) {
      const rewritten = header
        .replace(/;\s*Domain=[^;]*/gi, '')
        .replace(/;\s*Secure/gi, '')
        .replace(/;\s*SameSite=None/gi, '; SameSite=Lax');
      res.append('Set-Cookie', rewritten);
    }

    res.json(data);
  } catch (err) {
    console.error('[Control Plane] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /auth/logout
 * Clears the session cookie.
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('session');
  res.json({ ok: true });
});
