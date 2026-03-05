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
  attestations: SPAttestationResponse[];
  complete: boolean;
  frame?: Record<string, string | number>;
  profile_id?: string;
  path?: string;
  required_domains?: string[];
  attested_domains?: string[];
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

export class SPClient {
  private sessionCookie = '';

  constructor(private baseUrl: string) {}

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
}
