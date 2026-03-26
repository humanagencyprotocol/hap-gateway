/**
 * SP API Client — fetches attestations, public key, and pending attestations from the SP.
 *
 * In container mode, the control-plane pushes the session cookie to the MCP server
 * via the internal /internal/configure endpoint. All SP requests include this cookie.
 */

export interface SPAttestationResponse {
  domain: string;
  blob: string;
  expires_at: number;
}

export interface SPAttestationsResult {
  frame_hash: string;
  bounds_hash?: string;   // v0.4
  context_hash?: string;  // v0.4
  attestations: (SPAttestationResponse & { commitment?: string })[];
  complete: boolean;
  frame?: Record<string, string | number>;
  bounds?: Record<string, string | number>;  // v0.4
  profile_id?: string;
  path?: string;
  required_domains?: string[];
  attested_domains?: string[];
  deferred_commitment_domains?: string[];
}

export interface SPProposal {
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

export interface SPPendingItem {
  frame_hash: string;
  profile_id: string;
  path: string;
  frame: Record<string, string | number>;
  required_domains: string[];
  attested_domains: string[];
  missing_domains: string[];
  created_at: string;
  earliest_expiry: string | null;
  remaining_seconds: number | null;
}

export class SPReceiptError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SPReceiptError';
  }
}

export class SPClient {
  private sessionCookie = '';
  private apiKey = '';

  constructor(private baseUrl: string) {}

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  setSessionCookie(cookie: string): void {
    this.sessionCookie = cookie;
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    };

    if (this.sessionCookie) {
      headers['Cookie'] = this.sessionCookie;
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    return globalThis.fetch(url, {
      ...init,
      headers,
    });
  }

  /**
   * Get SP public key.
   */
  async getPublicKey(): Promise<string> {
    const res = await this.fetch('/api/sp/pubkey');
    if (!res.ok) throw new Error(`SP pubkey request failed: ${res.status}`);
    const data = await res.json() as { publicKey: string };
    return data.publicKey;
  }

  /**
   * Get all attestations for a frame hash.
   */
  async getAttestations(frameHash: string): Promise<SPAttestationsResult> {
    const res = await this.fetch(`/api/attestations?frame_hash=${encodeURIComponent(frameHash)}`);
    if (!res.ok) throw new Error(`SP attestations request failed: ${res.status}`);
    return res.json() as Promise<SPAttestationsResult>;
  }

  /**
   * Get pending attestations for a domain.
   */
  async getPendingAttestations(domain: string): Promise<SPPendingItem[]> {
    const res = await this.fetch(`/api/attestations/pending?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) throw new Error(`SP pending request failed: ${res.status}`);
    return res.json() as Promise<SPPendingItem[]>;
  }

  /**
   * Request a signed receipt from the SP (pre-flight check before tool execution).
   * The SP enforces group-level limits and returns a signed receipt on success.
   */
  async postReceipt(data: {
    attestationHash: string;
    profileId: string;
    path: string;
    action: string;
    executionContext: Record<string, unknown>;
    amount?: number;
  }): Promise<{ receipt: Record<string, unknown> }> {
    const res = await this.fetch('/api/sp/receipt', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const error = (body.error as string) ?? `SP receipt request failed: ${res.status}`;
      throw new SPReceiptError(error, res.status, body);
    }
    return res.json() as Promise<{ receipt: Record<string, unknown> }>;
  }

  /**
   * Submit a proposal for deferred commitment review.
   */
  async submitProposal(data: {
    frameHash: string;
    profileId: string;
    path: string;
    pendingDomains: string[];
    tool: string;
    toolArgs: Record<string, unknown>;
    executionContext: Record<string, string | number>;
  }): Promise<{ proposal: SPProposal }> {
    const res = await this.fetch('/api/proposals', {
      method: 'POST',
      body: JSON.stringify({
        frame_hash: data.frameHash,
        profile_id: data.profileId,
        path: data.path,
        pending_domains: data.pendingDomains,
        tool: data.tool,
        tool_args: data.toolArgs,
        execution_context: data.executionContext,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) ?? `SP proposal submission failed: ${res.status}`);
    }
    return res.json() as Promise<{ proposal: SPProposal }>;
  }

  /**
   * Get pending proposals for a domain.
   */
  async getProposals(domain: string): Promise<SPProposal[]> {
    const res = await this.fetch(`/api/proposals?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) throw new Error(`SP proposals request failed: ${res.status}`);
    const data = await res.json() as { proposals: SPProposal[] };
    return data.proposals;
  }

  /**
   * Get proposals that have been fully committed and are ready for execution.
   */
  async getCommittedProposals(): Promise<SPProposal[]> {
    const res = await this.fetch('/api/proposals?status=committed');
    if (!res.ok) throw new Error(`SP committed proposals request failed: ${res.status}`);
    const data = await res.json() as { proposals: SPProposal[] };
    return data.proposals;
  }

  /**
   * Update a proposal's status (e.g., after execution).
   */
  async updateProposalStatus(id: string, status: string, result?: unknown): Promise<void> {
    const res = await this.fetch(`/api/proposals/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action: status, execution_result: result }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) ?? `SP proposal update failed: ${res.status}`);
    }
  }
}
