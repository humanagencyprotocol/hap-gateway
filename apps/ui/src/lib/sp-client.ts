/**
 * SP API Client for Platform UI
 *
 * All requests go through the control-plane, which proxies /api/* to the SP.
 * Authentication is API-key-based (X-API-Key header on every request).
 * No cookies are used — the API key is stored in React state only.
 */

export interface SPUser {
  id: string;
  name: string;
  email: string;
  did: string;
}

export interface SPGroup {
  id: string;
  name: string;
  myDomains: string[];
  isAdmin: boolean;
  /** v0.4: true for the auto-provisioned single-member personal workspace. */
  isPersonal?: boolean;
}

export interface AttestResponse {
  attestation_id: string;
  frame_hash?: string;    // v0.3
  bounds_hash?: string;   // v0.4
  context_hash?: string;  // v0.4
  domain: string;
  blob: string;
  expires_at: number;
  status: 'active' | 'pending';
  attested_domains: string[];
  required_domains: string[];
}

export interface ProfileSummary {
  id: string;
  name?: string;
  version: string;
  description: string;
  paths: string[];
}

export interface PendingItem {
  frame_hash: string;
  profile_id: string;
  path: string;
  title: string | null;
  sp_status: string | null;
  frame: Record<string, string | number>;
  required_domains: string[];
  attested_domains: string[];
  missing_domains: string[];
  deferred_commitment_domains: string[];
  created_at: string;
  earliest_expiry: string | null;
  remaining_seconds: number | null;
}

export interface AttestationsResult {
  frame_hash: string;
  attestations: Array<{ domain: string; blob: string; expires_at: number }>;
  complete: boolean;
  frame?: Record<string, string | number>;
  profile_id?: string;
  path?: string;
  required_domains?: string[];
  attested_domains?: string[];
}

export interface VaultStatus {
  initialized: boolean;
  credentialNames: string[];
  serviceCount: number;
}

export interface IntegrationManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  profile: string;
  mcp: { command: string; args: string[]; env?: Record<string, string> };
  credentials: {
    fields: Array<{ key: string; label: string; type: 'text' | 'password'; placeholder?: string; optional?: boolean }>;
    envMapping: Record<string, string>;
  };
  oauth: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    credentialKeys: Record<string, string>;
    tokenStorage: string;
    extraParams?: Record<string, string>;
  } | null;
  toolGating: unknown;
  setupHint?: string;
  setupGuide?: Array<{ title: string; description: string; link?: string }>;
}

export interface McpIntegrationStatus {
  id: string;
  name: string;
  running: boolean;
  toolCount: number;
  error?: string;
}

export interface GateContentEntry {
  frameHash: string;
  boundsHash?: string;
  contextHash?: string;
  path: string;
  profileId: string;
  gateContent: { problem: string; objective: string; tradeoffs: string };
  context?: Record<string, string | number>;
  storedAt: string;
}

export interface Proposal {
  id: string;
  frameHash: string;
  profileId: string;
  path: string;
  pendingDomains: string[];
  committedBy: Record<string, { userId: string; at: number }>;
  rejectedBy: { domain: string; userId: string; at: number } | null;
  tool: string;
  toolArgs: Record<string, unknown>;
  executionContext: Record<string, string | number>;
  status: 'pending' | 'committed' | 'rejected' | 'expired' | 'executed';
  executionResult: unknown | null;
  createdAt: number;
  expiresAt: number;
}

export interface ExecutionReceipt {
  id: string;
  groupId: string;
  userId: string;
  attestationHash: string;
  profileId: string;
  path: string;
  action: string;
  executionContext: Record<string, unknown>;
  cumulativeState: {
    daily: { amount: number; count: number };
    monthly: { amount: number; count: number };
  };
  timestamp: number;
  signature: string;
}

export interface McpHealthResponse {
  status: string;
  transports: string[];
  sp: string;
  activeSessions: number;
  storedGates: number;
  serviceCredentials: string[];
  integrations: McpIntegrationStatus[];
}

class SPClient {
  private apiKey: string | null = null;

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  clearApiKey(): void {
    this.apiKey = null;
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
        ...init?.headers,
      },
    });
  }

  // ─── Auth ─────────────────────────────────────────────────────────────

  async login(apiKey: string): Promise<SPUser> {
    const res = await this.fetch('/auth/login', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Invalid API key' }));
      throw new Error(err.error || `Login failed: ${res.status}`);
    }
    const data = await res.json();
    return data.user;
  }

  async logout(): Promise<void> {
    await this.fetch('/auth/logout', { method: 'POST' });
  }

  // ─── SP proxy ─────────────────────────────────────────────────────────

  async getGroups(): Promise<SPGroup[]> {
    const res = await this.fetch('/api/groups');
    if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`);
    const data = await res.json();
    return data.groups ?? data;
  }

  async listProfiles(): Promise<ProfileSummary[]> {
    const res = await this.fetch('/api/profiles');
    if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`);
    const data = await res.json();
    return data.profiles;
  }

  async getProfile(id: string) {
    const res = await this.fetch(`/api/profiles/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`);
    return res.json();
  }

  async attest(body: {
    profile_id: string;
    // v0.3
    frame?: Record<string, string | number>;
    path?: string;
    // v0.4
    bounds?: Record<string, string | number>;
    bounds_hash?: string;
    context_hash?: string;
    // common
    domain: string;
    did: string;
    gate_content_hashes: Record<string, string>;
    execution_context_hash: string;
    group_id: string;
    ttl?: number;
    commitment_mode: 'automatic' | 'review';
    title?: string;
  }): Promise<AttestResponse> {
    const res = await this.fetch('/api/sp/attest', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Attest failed: ${res.status}`);
    }
    return res.json();
  }

  async getPending(domain: string): Promise<PendingItem[]> {
    const res = await this.fetch(`/api/attestations/pending?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) throw new Error(`Failed to fetch pending: ${res.status}`);
    const data = await res.json();
    return data.pending ?? data;
  }

  async getMyAttestations(status?: string): Promise<PendingItem[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await this.fetch(`/api/attestations/mine${qs}`);
    if (!res.ok) throw new Error(`Failed to fetch attestations: ${res.status}`);
    const data = await res.json();
    // Normalize mine response to PendingItem shape
    return (data.attestations ?? []).map((a: Record<string, unknown>) => ({
      frame_hash: a.boundsHash ?? a.frameHash,
      profile_id: a.profileId,
      path: a.path,
      title: a.title ?? null,
      sp_status: (a.status as string) ?? null,
      frame: a.bounds ?? a.frame ?? {},
      required_domains: a.requiredDomains ?? [],
      attested_domains: a.attestedDomains ?? [],
      missing_domains: (a.requiredDomains as string[] ?? []).filter(
        (d: string) => !(a.attestedDomains as string[] ?? []).includes(d)
      ),
      deferred_commitment_domains: a.deferredCommitmentDomains ?? [],
      created_at: a.createdAt ? new Date((a.createdAt as number) * 1000).toISOString() : '',
      earliest_expiry: (a.attestations as Array<{expiresAt: number}> | undefined)?.length
        ? new Date(Math.min(...(a.attestations as Array<{expiresAt: number}>).map(att => att.expiresAt)) * 1000).toISOString()
        : null,
      remaining_seconds: (a.attestations as Array<{expiresAt: number}> | undefined)?.length
        ? Math.max(0, Math.min(...(a.attestations as Array<{expiresAt: number}>).map(att => att.expiresAt)) - Math.floor(Date.now() / 1000))
        : null,
    }));
  }

  async getMyReceipts(options?: { date?: string; profile?: string; limit?: number }): Promise<ExecutionReceipt[]> {
    const params = new URLSearchParams();
    if (options?.date) params.set('date', options.date);
    if (options?.profile) params.set('profile', options.profile);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const res = await this.fetch(`/api/receipts/mine${qs ? '?' + qs : ''}`);
    if (!res.ok) throw new Error(`Failed to fetch receipts: ${res.status}`);
    const data = await res.json();
    return data.receipts ?? [];
  }

  async revokeAttestation(frameHash: string, reason?: string): Promise<void> {
    const res = await this.fetch(`/api/attestations/${encodeURIComponent(frameHash)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? 'Revoked by user' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to revoke' }));
      throw new Error(err.error || `Revoke failed: ${res.status}`);
    }
  }

  async getAttestations(frameHash: string): Promise<AttestationsResult> {
    const res = await this.fetch(`/api/attestations?frame_hash=${encodeURIComponent(frameHash)}`);
    if (!res.ok) throw new Error(`Failed to fetch attestations: ${res.status}`);
    return res.json();
  }

  async getGroupById(id: string): Promise<{ id: string; name: string; members: Array<{ id: string; name: string; email: string; domains: string[]; role: string }>; inviteCode?: string }> {
    const res = await this.fetch(`/api/groups/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Failed to fetch group: ${res.status}`);
    return res.json();
  }

  async createGroup(name: string): Promise<SPGroup> {
    const res = await this.fetch('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Create group failed: ${res.status}`);
    }
    const data = await res.json();
    const g = data.group || data;
    return { id: g.id, name: g.name, myDomains: g.myDomains || [], isAdmin: true };
  }

  async joinGroup(inviteCode: string): Promise<SPGroup> {
    const res = await this.fetch('/api/groups/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Join group failed: ${res.status}`);
    }
    const data = await res.json();
    const g = data.group || data;
    return { id: g.id, name: g.name, myDomains: g.myDomains || [], isAdmin: g.isAdmin || false };
  }

  async inviteToGroup(groupId: string): Promise<{ inviteCode?: string; code?: string }> {
    const res = await this.fetch(`/api/groups/${encodeURIComponent(groupId)}/invite`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Invite failed: ${res.status}`);
    }
    return res.json();
  }

  // ─── Vault ────────────────────────────────────────────────────────────

  async getVaultStatus(): Promise<VaultStatus> {
    const res = await this.fetch('/vault/status');
    if (!res.ok) throw new Error(`Failed to fetch vault status: ${res.status}`);
    return res.json();
  }

  async getCredential(name: string): Promise<{ configured: boolean; fieldNames?: string[] }> {
    const res = await this.fetch(`/vault/credentials/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`Failed to check credential: ${res.status}`);
    return res.json();
  }

  async setCredential(name: string, fields: Record<string, string>): Promise<void> {
    const res = await this.fetch(`/vault/credentials/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(`Failed to save credential: ${res.status}`);
  }

  async testCredential(name: string): Promise<{ ok: boolean; message: string }> {
    const res = await this.fetch(`/vault/test/${encodeURIComponent(name)}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Test failed: ${res.status}`);
    return res.json();
  }

  // ─── AI ───────────────────────────────────────────────────────────────

  async aiAssist(request: {
    gate: 'intent';
    currentText: string;
    context?: { profileId?: string; bounds?: string };
  }): Promise<{ success: boolean; suggestion?: string; error?: string; disclaimer: string }> {
    const res = await this.fetch('/ai/assist', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'AI request failed' }));
      return { success: false, error: err.error, disclaimer: 'AI surfaces reality. You supply intent.' };
    }
    return res.json();
  }

  async aiTest(config?: { provider?: string; endpoint?: string; model?: string; apiKey?: string }): Promise<{ ok: boolean; message: string }> {
    const res = await this.fetch('/ai/test', {
      method: 'POST',
      body: JSON.stringify(config ?? {}),
    });
    if (!res.ok) throw new Error(`AI test failed: ${res.status}`);
    return res.json();
  }

  // ─── MCP Integrations ──────────────────────────────────────────────────

  async getMcpHealth(): Promise<McpHealthResponse> {
    const res = await this.fetch('/mcp/health');
    if (!res.ok) throw new Error(`MCP server unreachable: ${res.status}`);
    return res.json();
  }

  async getMcpIntegrations(): Promise<{ integrations: McpIntegrationStatus[] }> {
    const res = await this.fetch('/mcp/integrations');
    if (!res.ok) throw new Error(`Failed to fetch integrations: ${res.status}`);
    return res.json();
  }

  async getIntegrationManifests(): Promise<{ manifests: IntegrationManifest[] }> {
    const res = await this.fetch('/mcp/integrations/manifests');
    if (!res.ok) throw new Error(`Failed to fetch manifests: ${res.status}`);
    return res.json();
  }

  async activateIntegration(id: string): Promise<{ ok: boolean; id: string; tools: string[]; warning?: string }> {
    const res = await this.fetch(`/mcp/integrations/${encodeURIComponent(id)}/activate`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error || `Failed: ${res.status}`);
    }
    return res.json();
  }

  async removeMcpIntegration(id: string): Promise<void> {
    const res = await this.fetch(`/mcp/integrations/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to remove integration: ${res.status}`);
  }

  // ─── Team Profile Config ────────────────────────────────────────────────

  async getTeamProfileConfig(groupId: string): Promise<Record<string, Record<string, string[]>>> {
    const res = await this.fetch(`/api/groups/${encodeURIComponent(groupId)}/path-domains`);
    if (!res.ok) return {};
    const data = await res.json();
    return data.pathDomains ?? {};
  }

  // ─── Proposals ──────────────────────────────────────────────────────────

  async getProposals(domain: string): Promise<Proposal[]> {
    const res = await this.fetch(`/api/proposals?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) throw new Error(`Failed to fetch proposals: ${res.status}`);
    const data = await res.json();
    return data.proposals ?? [];
  }

  async resolveProposal(id: string, action: 'commit' | 'reject', domain: string): Promise<{ status: string }> {
    const res = await this.fetch(`/api/proposals/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action, domain }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error || `Failed: ${res.status}`);
    }
    return res.json();
  }

  // ─── Gate Content ───────────────────────────────────────────────────────

  async getGateContent(path: string): Promise<GateContentEntry | null> {
    const res = await this.fetch(`/gate-content?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Failed to fetch gate content: ${res.status}`);
    const data = await res.json();
    return data.entry ?? null;
  }

  async pushGateContent(data: {
    frameHash?: string;     // v0.3
    boundsHash?: string;    // v0.4
    contextHash?: string;   // v0.4
    context?: Record<string, string | number>;  // v0.4
    path?: string;
    gateContent: Record<string, string>;
  }): Promise<void> {
    const res = await this.fetch('/gate-content', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to push gate content' }));
      throw new Error(err.error || `Push gate content failed: ${res.status}`);
    }
  }
}

export const spClient = new SPClient();
