/**
 * HAP Control Plane — Express server that:
 * 1. Serves the built Vite UI
 * 2. Handles authentication (API key → session cookie)
 * 3. Proxies /api/* to the hosted SP (with cookie forwarding)
 * 4. Forwards gate-content to MCP server
 * 5. Provides vault endpoints (Phase 1 stubs)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Request, type Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authRouter } from './routes/auth';
import { vaultRouter } from './routes/vault';
import { pushGateContent } from './lib/mcp-bridge';

const SP_URL = process.env.HAP_SP_URL ?? 'https://service.humanagencyprotocol.org';
const port = parseInt(process.env.HAP_CP_PORT ?? '3000', 10);

// UI dist path: in Docker it's /app/ui/dist, locally fall back to sibling
const UI_DIST = process.env.HAP_UI_DIST ?? join(import.meta.dirname ?? __dirname, '../../ui/dist');

const app = express();

// Only parse JSON on routes we handle directly — NOT on /api/* which is proxied.
// express.json() consumes the request body stream, which prevents
// http-proxy-middleware from forwarding POST/PUT bodies to the SP.
const jsonParser = express.json();

// ─── Auth routes (/auth/*) ─────────────────────────────────────────────────

app.use('/auth', jsonParser, authRouter);

// ─── Vault routes (/vault/*) ───────────────────────────────────────────────

app.use('/vault', jsonParser, vaultRouter);

// ─── POST /gate-content — forward to MCP server ───────────────────────────

app.post('/gate-content', jsonParser, async (req: Request, res: Response) => {
  try {
    const { frameHash, path, gateContent } = req.body as {
      frameHash: string;
      path: string;
      gateContent: { problem: string; objective: string; tradeoffs: string };
    };

    await pushGateContent(frameHash, path, gateContent);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Control Plane] Gate content forward error:', err);
    res.status(500).json({ error: 'Failed to forward gate content to MCP server' });
  }
});

// ─── Proxy /api/* to hosted SP ─────────────────────────────────────────────

app.use(
  createProxyMiddleware({
    target: SP_URL,
    changeOrigin: true,
    pathFilter: '/api',
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward cookies from the browser to the SP
        const cookie = (req as express.Request).headers.cookie;
        if (cookie) {
          proxyReq.setHeader('Cookie', cookie);
        }
      },
      proxyRes: (proxyRes, _req, res) => {
        // Forward Set-Cookie from SP to browser, rewriting for localhost
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie) {
          const rewritten = (Array.isArray(setCookie) ? setCookie : [setCookie]).map(h =>
            h.replace(/;\s*Domain=[^;]*/gi, '')
             .replace(/;\s*Secure/gi, '')
             .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
          );
          (res as express.Response).setHeader('Set-Cookie', rewritten);
        }
      },
    },
  }),
);

// ─── Serve built UI ────────────────────────────────────────────────────────

if (existsSync(UI_DIST)) {
  app.use(express.static(UI_DIST));

  // SPA fallback — serve index.html for unmatched routes
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      status: 'control-plane running',
      note: `UI not found at ${UI_DIST} — run 'pnpm build' first`,
    });
  });
}

app.listen(port, '0.0.0.0', () => {
  console.error(`[Control Plane] Listening on http://0.0.0.0:${port}`);
  console.error(`[Control Plane]   SP proxy: ${SP_URL}`);
  console.error(`[Control Plane]   UI dist:  ${UI_DIST}`);
});
