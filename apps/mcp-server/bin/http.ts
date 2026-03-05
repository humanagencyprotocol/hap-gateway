#!/usr/bin/env node

/**
 * HAP MCP Server — HTTP entry point (supports both SSE and Streamable HTTP).
 *
 * Container mode: listens on 0.0.0.0:3030, accepts internal requests only
 * from the control-plane via loopback.
 *
 * Environment variables:
 * - HAP_SP_URL — SP server URL (default: https://service.humanagencyprotocol.org)
 * - HAP_MCP_PORT — HTTP port (default: 3030)
 */

import { randomUUID } from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SharedState } from '../src/lib/shared-state';
import { createMcpServer } from '../src/index';
import { verifyGateContentHashes } from '../src/lib/gate-content';
import type { GateContent } from '../src/lib/gate-store';

const spUrl = process.env.HAP_SP_URL ?? 'https://service.humanagencyprotocol.org';
const port = parseInt(process.env.HAP_MCP_PORT ?? '3030', 10);

// ─── Shared state (one instance for all connections) ───────────────────────

const state = new SharedState(spUrl);

// ─── Track active MCP sessions for refresh propagation ─────────────────────

interface ActiveSession {
  refreshTools: () => void;
}

const activeSessions = new Map<string, ActiveSession>();

const app = express();
app.use(express.json());

// ─── CORS for control-plane UI ────────────────────────────────────────────

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ─── Internal-only middleware ──────────────────────────────────────────────

function internalOnly(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLoopback) {
    res.status(403).json({ error: 'Internal endpoint — loopback only' });
    return;
  }
  next();
}

// ─── Internal endpoints (control-plane → MCP) ─────────────────────────────

app.post('/internal/configure', internalOnly, (req: Request, res: Response) => {
  const { sessionCookie } = req.body as { sessionCookie?: string };
  if (!sessionCookie) {
    res.status(400).json({ error: 'Missing sessionCookie' });
    return;
  }
  state.spClient.setSessionCookie(sessionCookie);
  console.error('[HAP MCP] Session cookie configured by control-plane');
  res.json({ ok: true });
});

app.post('/internal/gate-content', internalOnly, async (req: Request, res: Response) => {
  try {
    const { frameHash, path, gateContent } = req.body as {
      frameHash: string;
      path: string;
      gateContent: GateContent;
    };

    if (!frameHash || !path || !gateContent?.problem || !gateContent?.objective || !gateContent?.tradeoffs) {
      res.status(400).json({ error: 'Missing required fields: frameHash, path, gateContent.{problem,objective,tradeoffs}' });
      return;
    }

    // Sync attestation from SP so we can verify hashes
    const auth = await state.cache.syncAuthorization(frameHash);
    if (!auth) {
      res.status(404).json({ error: `No attestation found for frame hash ${frameHash}` });
      return;
    }

    // Verify gate content hashes match attestation
    const verification = verifyGateContentHashes(gateContent, auth);
    if (!verification.valid) {
      res.status(400).json({ error: 'Gate content hash mismatch', details: verification.errors });
      return;
    }

    // Store gate content
    state.setGateContent(path, frameHash, auth.profileId, gateContent);
    console.error(`[HAP MCP] Gate content accepted for ${path}`);

    // Refresh tools on all active MCP sessions
    for (const [sessionId, session] of activeSessions) {
      try {
        session.refreshTools();
      } catch (err) {
        console.error(`[HAP MCP] Failed to refresh session ${sessionId}:`, err);
      }
    }

    res.json({ ok: true, path });
  } catch (err) {
    console.error('[HAP MCP] Error handling /internal/gate-content:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/internal/service-credentials', internalOnly, (_req: Request, res: Response) => {
  // Phase 1 stub — credential vault not yet implemented
  res.status(501).json({ error: 'Not implemented — credential vault coming in Phase 2' });
});

// ─── SSE transport (for mcporter / OpenClaw) ────────────────────────────────

const sseSessions = new Map<string, SSEServerTransport>();

// GET /sse — client opens SSE stream
app.get('/sse', async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport('/messages', res);
  const { server, refreshTools } = createMcpServer(state);

  const sessionId = transport.sessionId;
  sseSessions.set(sessionId, transport);
  activeSessions.set(sessionId, { refreshTools });
  console.error(`[HAP MCP] SSE session ${sessionId} connected`);

  res.on('close', () => {
    sseSessions.delete(sessionId);
    activeSessions.delete(sessionId);
    console.error(`[HAP MCP] SSE session ${sessionId} closed`);
  });

  await server.connect(transport);
});

// POST /messages — client sends JSON-RPC messages
app.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseSessions.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: 'Unknown session' });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

// ─── Streamable HTTP transport (modern MCP clients) ─────────────────────────

const streamableSessions = new Map<string, StreamableHTTPServerTransport>();

app.all('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE') {
    if (sessionId && streamableSessions.has(sessionId)) {
      const transport = streamableSessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'POST' && !sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          streamableSessions.delete(transport.sessionId);
          activeSessions.delete(transport.sessionId);
          console.error(`[HAP MCP] Streamable session ${transport.sessionId} closed`);
        }
      };

      const { server, refreshTools } = createMcpServer(state);
      await server.connect(transport);

      if (transport.sessionId) {
        streamableSessions.set(transport.sessionId, transport);
        activeSessions.set(transport.sessionId, { refreshTools });
        console.error(`[HAP MCP] Streamable session ${transport.sessionId}`);
      }

      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ error: 'Bad request — missing or invalid session' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});

// ─── Health check ───────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    transports: ['sse', 'streamable-http'],
    sp: spUrl,
    activeSessions: activeSessions.size,
    storedGates: state.gateStore.getAll().length,
  });
});

app.listen(port, '0.0.0.0', () => {
  console.error(`[HAP MCP] HTTP server listening on http://0.0.0.0:${port}`);
  console.error(`[HAP MCP]   SSE:        http://0.0.0.0:${port}/sse`);
  console.error(`[HAP MCP]   Streamable: http://0.0.0.0:${port}/mcp`);
  console.error(`[HAP MCP]   SP server:  ${spUrl}`);
});
