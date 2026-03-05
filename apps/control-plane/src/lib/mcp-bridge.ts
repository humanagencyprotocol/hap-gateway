/**
 * MCP Bridge — internal communication from control-plane to MCP server.
 *
 * All calls go to http://127.0.0.1:3030/internal/* within the same container.
 */

const MCP_BASE = process.env.HAP_MCP_INTERNAL_URL ?? 'http://127.0.0.1:3030';

export async function configure(sessionCookie: string): Promise<void> {
  const res = await fetch(`${MCP_BASE}/internal/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCookie }),
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frameHash, path, gateContent }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`MCP pushGateContent failed: ${(err as { error: string }).error}`);
  }
}

export async function pushServiceCredentials(
  credentials: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${MCP_BASE}/internal/service-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentials }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`MCP pushServiceCredentials failed: ${(err as { error: string }).error}`);
  }
}
