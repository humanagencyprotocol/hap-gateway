/**
 * Attestation Cache — local cache of attestations and SP public key.
 *
 * Fetches from SP on-demand and caches with TTL awareness.
 */

import { SPClient, type SPAttestationsResult, type SPPendingItem } from './sp-client';

export interface CachedAuthorization {
  frameHash: string;            // v0.3 compat (= boundsHash for v0.4)
  boundsHash?: string;          // v0.4
  contextHash?: string;         // v0.4
  profileId: string;
  path: string;
  frame: Record<string, string | number>;     // v0.3 compat (= bounds for v0.4)
  bounds?: Record<string, string | number>;   // v0.4 bounds
  context?: Record<string, string | number>;  // v0.4 context (from local store)
  attestations: Array<{ domain: string; blob: string; expiresAt: number }>;
  requiredDomains: string[];
  attestedDomains: string[];
  deferredCommitmentDomains: string[];
  complete: boolean;
}

export class AttestationCache {
  private spPublicKey: string | null = null;
  private spPublicKeyFetchedAt = 0;
  private readonly SP_PUBKEY_TTL = 300; // 5 minutes

  /** Cache of authorizations by path (e.g., "payment-routine") */
  private authorizations = new Map<string, CachedAuthorization>();
  private lastSync = 0;

  constructor(private spClient: SPClient) {}

  /**
   * Get the SP public key, fetching from SP if not cached or expired.
   */
  async getPublicKey(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.spPublicKey && (now - this.spPublicKeyFetchedAt) < this.SP_PUBKEY_TTL) {
      return this.spPublicKey;
    }

    this.spPublicKey = await this.spClient.getPublicKey();
    this.spPublicKeyFetchedAt = now;
    return this.spPublicKey;
  }

  /**
   * Get a cached authorization by path. If not cached, returns null.
   * Use syncAuthorization() to fetch from SP.
   */
  getAuthorization(path: string): CachedAuthorization | null {
    const auth = this.authorizations.get(path);
    if (!auth) return null;

    // Check if all attestations have expired
    const now = Math.floor(Date.now() / 1000);
    const hasValid = auth.attestations.some(a => a.expiresAt > now);
    if (!hasValid) {
      this.authorizations.delete(path);
      return null;
    }

    return auth;
  }

  /**
   * Fetch attestation data from SP for a frame hash and cache it.
   */
  async syncAuthorization(frameHash: string): Promise<CachedAuthorization | null> {
    const result = await this.spClient.getAttestations(frameHash);
    if (!result.path || !result.profile_id || !result.frame) return null;

    // v0.4: prefer bounds_hash; fall back to frame_hash for v0.3 compat
    const boundsHash = result.bounds_hash ?? result.frame_hash;
    const bounds = result.bounds ?? result.frame;

    const auth: CachedAuthorization = {
      frameHash: boundsHash,           // compat alias
      boundsHash: result.bounds_hash,  // v0.4 (undefined for v0.3)
      contextHash: result.context_hash,
      profileId: result.profile_id,
      path: result.path,
      frame: bounds,                   // compat alias
      bounds: result.bounds,           // v0.4 (undefined for v0.3)
      attestations: result.attestations.map(a => ({
        domain: a.domain,
        blob: a.blob,
        expiresAt: a.expires_at,
      })),
      requiredDomains: result.required_domains ?? [],
      attestedDomains: result.attested_domains ?? [],
      deferredCommitmentDomains: result.deferred_commitment_domains ?? [],
      complete: result.complete,
    };

    this.authorizations.set(auth.path, auth);
    return auth;
  }

  /**
   * Get all cached authorizations (both active and pending).
   */
  getAllAuthorizations(): CachedAuthorization[] {
    const now = Math.floor(Date.now() / 1000);
    const results: CachedAuthorization[] = [];

    for (const [path, auth] of this.authorizations) {
      const hasValid = auth.attestations.some(a => a.expiresAt > now);
      if (hasValid) {
        results.push(auth);
      } else {
        this.authorizations.delete(path);
      }
    }

    return results;
  }

  /**
   * Fetch pending attestations from SP for a domain.
   */
  async getPendingAttestations(domain: string): Promise<SPPendingItem[]> {
    return this.spClient.getPendingAttestations(domain);
  }

  /**
   * Cache an authorization directly (e.g., from SP response after creation).
   */
  cacheAuthorization(auth: CachedAuthorization): void {
    this.authorizations.set(auth.path, auth);
  }
}
