/**
 * SP API Client for Platform UI
 *
 * All requests go through the control-plane, which proxies /api/* to the SP.
 * Authentication is cookie-based (session cookie set by /auth/login).
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
}

export interface AttestResponse {
  attestation_id: string;
  frame_hash: string;
  domain: string;
  blob: string;
  expires_at: number;
  status: 'active' | 'pending';
  attested_domains: string[];
  required_domains: string[];
}

export interface ProfileSummary {
  id: string;
  version: string;
  description: string;
  paths: string[];
}

export interface PendingItem {
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

class SPClient {
  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  }

  async login(apiKey: string): Promise<SPUser> {
    const res = await this.fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
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
    path: string;
    frame: Record<string, string | number>;
    domain: string;
    did: string;
    gate_content_hashes: Record<string, string>;
    execution_context_hash: string;
    group_id?: string;
    ttl?: number;
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
    return res.json();
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
    // SP returns { group: {...}, inviteCode } — unwrap
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
}

export const spClient = new SPClient();
