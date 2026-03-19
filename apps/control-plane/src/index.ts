/**
 * HAP Control Plane — Express server that:
 * 1. Serves the built Vite UI
 * 2. Handles cookie-less API key authentication
 * 3. Proxies /api/* to the hosted SP (injecting server-side cookie, auth-guarded)
 * 4. Forwards gate-content to MCP server
 * 5. Provides encrypted vault endpoints
 * 6. Proxies AI assistant requests (keys never sent to browser)
 * 7. Proxies GitHub API requests (PAT never sent to browser)
 */

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Vault } from './lib/vault';
import { createAuthRouter } from './routes/auth';
import { createVaultRouter } from './routes/vault';
import { createAIRouter } from './routes/ai';
import { createGitHubRouter } from './routes/github';
import { requireAuth } from './middleware/auth';
import { pushGateContent, setInternalSecret } from './lib/mcp-bridge';
import { createMCPRouter } from './routes/mcp';
import { startUpdateChecker, getUpdateStatus } from './lib/update-checker';

const SP_URL = process.env.HAP_SP_URL ?? 'https://www.humanagencyprotocol.com';
const port = parseInt(process.env.HAP_CP_PORT ?? '3000', 10);

// UI dist path: in Docker it's /app/ui/dist, locally fall back to sibling
const UI_DIST = process.env.HAP_UI_DIST ?? join(import.meta.dirname ?? __dirname, '../../ui/dist');

// ─── Shared vault instance ───────────────────────────────────────────────

const vault = new Vault();

// ─── CP↔MCP shared secret (generated once per process start) ────────────
// In Docker, set HAP_INTERNAL_SECRET env var so both containers share it.

const internalSecret = process.env.HAP_INTERNAL_SECRET ?? randomBytes(32).toString('hex');
setInternalSecret(internalSecret);

const app = express();

// Only parse JSON on routes we handle directly — NOT on /api/* which is proxied.
// express.json() consumes the request body stream, which prevents
// http-proxy-middleware from forwarding POST/PUT bodies to the SP.
const jsonParser = express.json();

// ─── Rate limiting for login ─────────────────────────────────────────────

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 60_000; // 1 minute
const LOGIN_MAX_ATTEMPTS = 10;

function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      return;
    }
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  }
  next();
}

// ─── Auth routes (/auth/*) ──────────────────────────────────────────────

app.use('/auth', jsonParser, createAuthRouter(vault, requireAuth(vault), loginRateLimit));

// ─── Protected routes — require X-API-Key ────────────────────────────────

const authGuard = requireAuth(vault);

// Vault routes
app.use('/vault', jsonParser, authGuard, createVaultRouter(vault));

// AI routes
app.use('/ai', jsonParser, authGuard, createAIRouter(vault));

// GitHub routes
app.use('/github', jsonParser, authGuard, createGitHubRouter(vault));

// MCP integration management routes
app.use('/mcp', jsonParser, authGuard, createMCPRouter());

// Gate content forward — protected
app.post('/gate-content', jsonParser, authGuard, async (req: Request, res: Response) => {
  try {
    const { frameHash, boundsHash, contextHash, context, path, gateContent } = req.body as {
      frameHash?: string;
      boundsHash?: string;
      contextHash?: string;
      context?: Record<string, string | number>;
      path: string;
      gateContent: { problem: string; objective: string; tradeoffs: string };
    };

    await pushGateContent({ frameHash, boundsHash, contextHash, context, path, gateContent });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Control Plane] Gate content forward error:', err);
    res.status(500).json({ error: 'Failed to forward gate content to MCP server' });
  }
});

// ─── Proxy /api/* to hosted SP (AUTH-GUARDED) ───────────────────────────

// Auth guard for /api — runs first, rejects with 401 if unauthorized
app.use('/api', authGuard);

// Proxy /api/* to SP — mounted at root so http-proxy-middleware sees the full path
app.use(
  createProxyMiddleware({
    target: SP_URL,
    changeOrigin: true,
    pathFilter: '/api',
    on: {
      proxyReq: (proxyReq) => {
        // Inject server-side SP session cookie instead of forwarding browser cookies
        const cookie = vault.getSpCookie();
        if (cookie) {
          proxyReq.setHeader('Cookie', cookie);
        }
      },
    },
  }),
);

// ─── Health check (public) ──────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  const update = getUpdateStatus();
  res.json({
    status: 'ok',
    vaultUnlocked: vault.isUnlocked(),
    version: update.runningSha,
    updateAvailable: update.updateAvailable,
  });
});

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
  console.error(`[Control Plane]   Internal secret: configured`);
  startUpdateChecker();
});
