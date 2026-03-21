/**
 * MCP Bridge — internal communication from control-plane to MCP server.
 *
 * All calls go to http://127.0.0.1:3430/internal/* (local dev) or :3030 (Docker).
 * Each request includes an X-Internal-Secret header for authentication.
 */

const MCP_BASE = process.env.HAP_MCP_INTERNAL_URL ?? 'http://127.0.0.1:3430';

let internalSecret = '';

export function setInternalSecret(secret: string): void {
  internalSecret = secret;
}

function internalHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Secret': internalSecret,
  };
}

export async function configure(sessionCookie: string, vaultKeyHex?: string): Promise<void> {
  const res = await fetch(`${MCP_BASE}/internal/configure`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ sessionCookie, vaultKeyHex }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`MCP configure failed: ${(err as { error: string }).error}`);
  }
}

export async function pushGateContent(data: {
  frameHash?: string;
  boundsHash?: string;
  contextHash?: string;
  context?: Record<string, string | number>;
  path: string;
  gateContent: { problem: string; objective: string; tradeoffs: string };
}): Promise<void> {
  const res = await fetch(`${MCP_BASE}/internal/gate-content`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`MCP pushGateContent failed: ${(err as { error: string }).error}`);
  }
}

export async function pushServiceCredentials(
  serviceId: string,
  credentials: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${MCP_BASE}/internal/service-credentials`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ serviceId, credentials }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`MCP pushServiceCredentials failed: ${(err as { error: string }).error}`);
  }
}

export async function resyncGates(): Promise<{ synced: number }> {
  const res = await fetch(`${MCP_BASE}/internal/resync-gates`, {
    method: 'POST',
    headers: internalHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`MCP resyncGates failed: ${(err as { error: string }).error}`);
  }
  return res.json() as Promise<{ synced: number }>;
}

// ─── Integration management ──────────────────────────────────────────────

export async function getIntegrations(): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/internal/integrations`, {
    headers: internalHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch integrations');
  return res.json();
}

export async function addIntegration(config: unknown): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/internal/add-integration`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error: string }).error);
  }
  return res.json();
}

/**
 * Activate an integration from its manifest — constructs IntegrationConfig
 * from manifest fields and sends it to the MCP server.
 */
export async function activateIntegration(manifest: {
  id: string;
  name: string;
  mcp: { command: string; args: string[]; env?: Record<string, string> };
  credentials: { envMapping: Record<string, string> };
  profile: string;
  toolGating?: unknown;
}): Promise<unknown> {
  // Construct envKeys by prepending integration ID to each credential key
  const envKeys: Record<string, string> = {};
  for (const [envVar, credKey] of Object.entries(manifest.credentials.envMapping)) {
    envKeys[envVar] = `${manifest.id}.${credKey}`;
  }

  return addIntegration({
    id: manifest.id,
    name: manifest.name,
    command: manifest.mcp.command,
    args: manifest.mcp.args,
    env: manifest.mcp.env,
    envKeys,
    profile: manifest.profile,
    toolGating: manifest.toolGating,
    enabled: true,
  });
}

export async function getManifests(): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/internal/manifests`, {
    headers: internalHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch manifests');
  return res.json();
}

export async function removeIntegration(id: string): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/internal/remove-integration/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: internalHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error: string }).error);
  }
  return res.json();
}

export async function getGateContent(path?: string): Promise<unknown> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`${MCP_BASE}/internal/gate-content${qs}`, {
    headers: internalHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch gate content');
  return res.json();
}

export async function getMcpHealth(): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/health`);
  if (!res.ok) throw new Error('MCP server unreachable');
  return res.json();
}
