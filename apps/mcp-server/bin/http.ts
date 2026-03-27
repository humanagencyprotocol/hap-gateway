#!/usr/bin/env node

/**
 * HAP MCP Server — HTTP entry point (supports both SSE and Streamable HTTP).
 *
 * Container mode: listens on 0.0.0.0:3030, accepts internal requests only
 * from the control-plane via loopback.
 *
 * Environment variables:
 * - HAP_SP_URL — SP server URL (default: https://www.humanagencyprotocol.com)
 * - HAP_SP_API_KEY — SP API key for receipt requests (optional)
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
import { IntegrationRegistry, type IntegrationConfig } from '../src/lib/integration-registry';
import { IntegrationManager } from '../src/lib/integration-manager';
import { loadProfiles } from '../src/lib/profile-loader';
import { loadManifests, getAllManifests } from '../src/lib/manifest-loader';

const spUrl = process.env.HAP_SP_URL ?? 'https://www.humanagencyprotocol.com';
const port = parseInt(process.env.HAP_MCP_PORT ?? '3430', 10);

// ─── Shared state (one instance for all connections) ───────────────────────

const state = new SharedState(spUrl);

const spApiKey = process.env.HAP_SP_API_KEY ?? '';
if (spApiKey) {
  state.spClient.setApiKey(spApiKey);
}

// ─── Service credentials held in memory for connector use ──────────────────

const serviceCredentials = new Map<string, Record<string, string>>();

// ─── Integration registry + manager ────────────────────────────────────────

const integrationRegistry = new IntegrationRegistry();
const integrationManager = new IntegrationManager(serviceCredentials);

// ─── Track active MCP sessions for refresh propagation ─────────────────────

interface ActiveSession {
  refreshTools: () => void;
  registerProxiedTools: () => void;
}

const activeSessions = new Map<string, ActiveSession>();

/** Refresh tools on all active MCP sessions */
function refreshAllSessions() {
  for (const [sessionId, session] of activeSessions) {
    try {
      session.registerProxiedTools();
      session.refreshTools();
    } catch (err) {
      console.error(`[HAP MCP] Failed to refresh session ${sessionId}:`, err);
    }
  }
}

// When tools change (integration start/stop/crash), refresh all sessions
integrationManager.setOnToolsChanged(() => {
  refreshAllSessions();
});

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

// ─── Internal-only middleware (loopback + shared secret) ──────────────────

const INTERNAL_SECRET = process.env.HAP_INTERNAL_SECRET ?? '';

function internalOnly(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLoopback) {
    res.status(403).json({ error: 'Internal endpoint — loopback only' });
    return;
  }
  // Validate shared secret (if configured)
  const secret = req.headers['x-internal-secret'] as string | undefined;
  if (INTERNAL_SECRET && secret !== INTERNAL_SECRET) {
    res.status(403).json({ error: 'Invalid internal secret' });
    return;
  }
  next();
}

// ─── Internal endpoints (control-plane → MCP) ─────────────────────────────

app.post('/internal/configure', internalOnly, (req: Request, res: Response) => {
  const { sessionCookie, vaultKeyHex, apiKey } = req.body as {
    sessionCookie?: string;
    vaultKeyHex?: string;
    apiKey?: string;
  };
  if (!sessionCookie) {
    res.status(400).json({ error: 'Missing sessionCookie' });
    return;
  }
  state.spClient.setSessionCookie(sessionCookie);
  console.error('[HAP MCP] Session cookie configured by control-plane');

  if (vaultKeyHex) {
    state.gateStore.setVaultKey(Buffer.from(vaultKeyHex, 'hex'));
    console.error('[HAP MCP] Vault key configured — gate store encryption active');
  }

  if (apiKey) {
    state.spClient.setApiKey(apiKey);
    console.error('[HAP MCP] SP API key configured by control-plane');
  }

  res.json({ ok: true });
});

app.post('/internal/gate-content', internalOnly, async (req: Request, res: Response) => {
  try {
    const { frameHash, boundsHash, contextHash, context, path, gateContent } = req.body as {
      frameHash?: string;
      boundsHash?: string;      // v0.4
      contextHash?: string;     // v0.4
      context?: Record<string, string | number>;  // v0.4
      path: string;
      gateContent: GateContent;
    };

    // Accept either frameHash (v0.3) or boundsHash (v0.4); use boundsHash when present
    const storageHash = boundsHash ?? frameHash;

    if (!storageHash || !path || !gateContent?.problem || !gateContent?.objective || !gateContent?.tradeoffs) {
      res.status(400).json({ error: 'Missing required fields: frameHash (or boundsHash), path, gateContent.{problem,objective,tradeoffs}' });
      return;
    }

    // Sync attestation from SP so we can verify hashes
    const auth = await state.cache.syncAuthorization(storageHash);
    if (!auth) {
      res.status(404).json({ error: `No attestation found for frame hash ${storageHash}` });
      return;
    }

    // Verify gate content hashes match attestation
    const verification = verifyGateContentHashes(gateContent, auth);
    if (!verification.valid) {
      res.status(400).json({ error: 'Gate content hash mismatch', details: verification.errors });
      return;
    }

    // Store gate content (encrypted if vault key is set), passing v0.4 fields through
    state.setGateContent(path, storageHash, auth.profileId, gateContent, {
      boundsHash, contextHash, context,
    });
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

app.post('/internal/service-credentials', internalOnly, (req: Request, res: Response) => {
  const { serviceId, credentials } = req.body as {
    serviceId?: string;
    credentials?: Record<string, string>;
  };
  if (!serviceId || !credentials) {
    res.status(400).json({ error: 'Missing serviceId or credentials' });
    return;
  }
  serviceCredentials.set(serviceId, credentials);
  console.error(`[HAP MCP] Service credentials stored for ${serviceId}`);

  // Late-start: try starting integrations that depend on these credentials
  startPendingIntegrations();

  res.json({ ok: true });
});

app.post('/internal/resync-gates', internalOnly, async (_req: Request, res: Response) => {
  const gates = state.gateStore.getAll();
  if (gates.length === 0) {
    res.json({ ok: true, synced: 0 });
    return;
  }

  let synced = 0;
  for (const gate of gates) {
    try {
      // Use boundsHash if present (v0.4), otherwise fall back to frameHash (v0.3)
      const syncHash = gate.boundsHash ?? gate.frameHash;
      const auth = await state.cache.syncAuthorization(syncHash);
      if (auth) {
        state.setGateContent(gate.path, syncHash, auth.profileId, gate.gateContent, {
          boundsHash: gate.boundsHash,
          contextHash: gate.contextHash,
          context: gate.context,
        });
        synced++;
        console.error(`[HAP MCP] Re-synced gate: ${gate.path}`);
      }
    } catch (err) {
      console.error(`[HAP MCP] Failed to re-sync gate ${gate.path}:`, err);
    }
  }

  // Refresh tools on all active MCP sessions
  for (const [sessionId, session] of activeSessions) {
    try {
      session.refreshTools();
    } catch (err) {
      console.error(`[HAP MCP] Failed to refresh session ${sessionId}:`, err);
    }
  }

  res.json({ ok: true, synced });
});

// ─── Integration management endpoints ──────────────────────────────────────

app.post('/internal/add-integration', internalOnly, async (req: Request, res: Response) => {
  try {
    const config = req.body as IntegrationConfig;
    if (!config.id || !config.command) {
      res.status(400).json({ error: 'Missing required fields: id, command' });
      return;
    }

    // Persist config
    integrationRegistry.add(config);
    console.error(`[HAP MCP] Integration ${config.id} added to registry`);

    // Try to start if enabled and credentials are available
    if (config.enabled) {
      if (Object.keys(config.envKeys ?? {}).length === 0 || integrationManager.canResolveEnvKeys(config)) {
        try {
          const tools = await integrationManager.startIntegration(config);
          res.json({ ok: true, id: config.id, tools: tools.map(t => t.namespacedName) });
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[HAP MCP] Failed to start integration ${config.id}:`, message);
          res.json({ ok: true, id: config.id, tools: [], warning: `Saved but failed to start: ${message}` });
          return;
        }
      } else {
        console.error(`[HAP MCP] Integration ${config.id} saved but waiting for credentials`);
        res.json({ ok: true, id: config.id, tools: [], warning: 'Saved but waiting for service credentials' });
        return;
      }
    }

    res.json({ ok: true, id: config.id, tools: [] });
  } catch (err) {
    console.error('[HAP MCP] Error adding integration:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.delete('/internal/remove-integration/:id', internalOnly, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  // Stop if running
  await integrationManager.stopIntegration(id);

  // Remove from registry
  const removed = integrationRegistry.remove(id);
  if (!removed) {
    res.status(404).json({ error: `Integration "${id}" not found` });
    return;
  }

  console.error(`[HAP MCP] Integration ${id} removed`);
  res.json({ ok: true, id });
});

app.get('/internal/integrations', internalOnly, (_req: Request, res: Response) => {
  const configs = integrationRegistry.getAll();
  const statuses = integrationManager.getStatus(configs);
  res.json({ integrations: statuses });
});

// ─── SSE transport (for mcporter / OpenClaw) ────────────────────────────────

const sseSessions = new Map<string, SSEServerTransport>();

// GET /sse — client opens SSE stream
app.get('/sse', async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport('/messages', res);
  const { server, refreshTools, registerProxiedTools } = createMcpServer(state, integrationManager);

  const sessionId = transport.sessionId;
  sseSessions.set(sessionId, transport);
  activeSessions.set(sessionId, { refreshTools, registerProxiedTools });
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

      const { server, refreshTools, registerProxiedTools } = createMcpServer(state, integrationManager);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      // Register session after handleRequest (sessionId is assigned during initialize)
      if (transport.sessionId && !streamableSessions.has(transport.sessionId)) {
        streamableSessions.set(transport.sessionId, transport);
        activeSessions.set(transport.sessionId, { refreshTools, registerProxiedTools });
        console.error(`[HAP MCP] Streamable session ${transport.sessionId}`);
      }
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
    serviceCredentials: Array.from(serviceCredentials.keys()),
    integrations: integrationManager.getStatus(integrationRegistry.getAll()),
  });
});

app.get('/internal/gate-content', internalOnly, (req: Request, res: Response) => {
  const path = req.query.path as string | undefined;
  const gates = state.gateStore.getAll();
  if (path) {
    const entry = gates.find(g => g.path === path);
    res.json({ entry: entry ?? null });
  } else {
    res.json({ entries: gates });
  }
});

app.get('/internal/manifests', internalOnly, (_req: Request, res: Response) => {
  res.json({ manifests: getAllManifests() });
});

// ─── Integration startup helpers ────────────────────────────────────────────

/**
 * Start integrations that are enabled and have their credentials available.
 * Called at startup and after new credentials are received.
 */
async function startPendingIntegrations() {
  const configs = integrationRegistry.getEnabled();
  for (const config of configs) {
    if (integrationManager.isRunning(config.id)) continue;

    const needsCreds = Object.keys(config.envKeys ?? {}).length > 0;
    if (needsCreds && !integrationManager.canResolveEnvKeys(config)) continue;

    try {
      await integrationManager.startIntegration(config);
    } catch (err) {
      console.error(`[HAP MCP] Failed to start integration ${config.id}:`, err);
    }
  }
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.error('[HAP MCP] SIGTERM received, shutting down...');
  await integrationManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.error('[HAP MCP] SIGINT received, shutting down...');
  await integrationManager.shutdown();
  process.exit(0);
});

// ─── Start server ───────────────────────────────────────────────────────────

app.listen(port, '0.0.0.0', () => {
  console.error(`[HAP MCP] HTTP server listening on http://0.0.0.0:${port}`);
  console.error(`[HAP MCP]   SSE:        http://0.0.0.0:${port}/sse`);
  console.error(`[HAP MCP]   Streamable: http://0.0.0.0:${port}/mcp`);
  console.error(`[HAP MCP]   SP server:  ${spUrl}`);

  // Load profiles and integration manifests before starting integrations
  loadProfiles();
  loadManifests();

  // Personal mode: auto-register personalDefault integrations on first boot
  if (process.env.HAP_MODE === 'personal' && integrationRegistry.getEnabled().length === 0) {
    const personalManifests = getAllManifests().filter(m => m.personalDefault);
    for (const manifest of personalManifests) {
      // Build envKeys / optionalEnvKeys from manifest credential fields
      const optionalKeys = new Set(
        manifest.credentials.fields.filter(f => f.optional).map(f => f.key),
      );
      const envKeys: Record<string, string> = {};
      const optionalEnvKeys: Record<string, string> = {};
      for (const [envVar, credKey] of Object.entries(manifest.credentials.envMapping)) {
        if (optionalKeys.has(credKey)) {
          optionalEnvKeys[envVar] = `${manifest.id}.${credKey}`;
        } else {
          envKeys[envVar] = `${manifest.id}.${credKey}`;
        }
      }

      integrationRegistry.add({
        id: manifest.id,
        name: manifest.name,
        command: manifest.mcp.command,
        args: manifest.mcp.args,
        env: manifest.mcp.env,
        envKeys,
        ...(Object.keys(optionalEnvKeys).length > 0 ? { optionalEnvKeys } : {}),
        profile: manifest.profile,
        toolGating: manifest.toolGating,
        enabled: true,
      });
      console.error(`[HAP MCP] Auto-registered personal integration: ${manifest.id}`);
    }
  }

  // Restore integrations from registry on startup
  startPendingIntegrations().then(() => {
    const running = integrationManager.getStatus().filter(s => s.running);
    if (running.length > 0) {
      console.error(`[HAP MCP] Restored ${running.length} integration(s): ${running.map(s => s.id).join(', ')}`);
    }
  });

  // ─── Auto-execution loop for committed proposals ────────────────────────
  // Polls SP every 5 seconds for proposals that all domains have committed.
  // When found, executes the stored tool call and updates the proposal.

  const PROPOSAL_POLL_INTERVAL = 5_000;

  async function executeCommittedProposals(): Promise<void> {
    try {
      const committed = await state.spClient.getCommittedProposals();
      for (const proposal of committed) {
        try {
          // Parse tool name: "integration___toolName" → { integrationId, toolName }
          const parts = proposal.tool.split('___');
          if (parts.length !== 2) {
            console.error(`[HAP MCP] Invalid tool name in proposal ${proposal.id}: ${proposal.tool}`);
            continue;
          }
          const [integrationId, toolName] = parts;

          // Execute the tool
          const result = await integrationManager.callTool(integrationId, toolName, proposal.toolArgs);

          // Post receipt to SP
          try {
            await state.spClient.postReceipt({
              attestationHash: proposal.frameHash,
              profileId: proposal.profileId,
              path: proposal.path,
              action: toolName,
              executionContext: proposal.executionContext,
            });
          } catch (err) {
            console.error(`[HAP MCP] Receipt failed for proposal ${proposal.id}:`, err);
          }

          // Record in execution log
          state.executionLog.record({
            profileId: proposal.profileId,
            path: proposal.path,
            execution: proposal.executionContext,
            timestamp: Math.floor(Date.now() / 1000),
          });

          // Update proposal status to executed
          try {
            await state.spClient.updateProposalStatus(proposal.id, 'executed', result);
          } catch {
            // Best-effort status update
          }

          console.error(`[HAP MCP] Auto-executed proposal ${proposal.id}: ${proposal.tool}`);
        } catch (err) {
          console.error(`[HAP MCP] Failed to execute proposal ${proposal.id}:`, err);
        }
      }
    } catch {
      // SP unreachable or no session — skip this cycle
    }
  }

  setInterval(executeCommittedProposals, PROPOSAL_POLL_INTERVAL);
});
