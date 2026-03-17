/**
 * MCP Bridge — internal communication from control-plane to MCP server.
 *
 * All calls go to http://127.0.0.1:3030/internal/* within the same container.
 * Each request includes an X-Internal-Secret header for authentication.
 */

const MCP_BASE = process.env.HAP_MCP_INTERNAL_URL ?? 'http://127.0.0.1:3030';

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

export async function pushGateContent(
  frameHash: string,
  path: string,
  gateContent: { problem: string; objective: string; tradeoffs: string },
): Promise<void> {
  const res = await fetch(`${MCP_BASE}/internal/gate-content`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ frameHash, path, gateContent }),
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

export async function addStripePreset(): Promise<unknown> {
  return addIntegration({
    id: 'stripe',
    name: 'Stripe',
    command: 'npx',
    args: ['-y', '@stripe/mcp@latest'],
    envKeys: { STRIPE_SECRET_KEY: 'stripe.apiKey' },
    profile: 'spend',
    enabled: true,
  });
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

export async function getMcpHealth(): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/health`);
  if (!res.ok) throw new Error('MCP server unreachable');
  return res.json();
}
