import { describe, it, expect } from 'vitest';
import { listAuthorizationsHandler } from '../src/tools/authorizations';
import { checkPendingHandler } from '../src/tools/pending';
import type { AttestationCache, CachedAuthorization } from '../src/lib/attestation-cache';
import type { SharedState, EnrichedAuthorization } from '../src/lib/shared-state';

// ─── Mock factories ──────────────────────────────────────────────────────────

function mockState(authorizations: CachedAuthorization[] = []): SharedState {
  const enriched: EnrichedAuthorization[] = authorizations.map(a => ({
    ...a,
    gateContent: null,
  }));

  return {
    getEnrichedAuthorizations: () => enriched,
    cache: {
      getAllAuthorizations: () => authorizations,
      getAuthorization: (path: string) => authorizations.find(a => a.path === path) ?? null,
      getPublicKey: async () => 'mock-pubkey',
      getPendingAttestations: async () => [],
      syncAuthorization: async () => null,
      cacheAuthorization: () => {},
    },
  } as unknown as SharedState;
}

function mockCache(authorizations: CachedAuthorization[] = []): AttestationCache {
  return {
    getAllAuthorizations: () => authorizations,
    getAuthorization: (path: string) => authorizations.find(a => a.path === path) ?? null,
    getPublicKey: async () => 'mock-pubkey',
    getPendingAttestations: async () => [],
    syncAuthorization: async () => null,
    cacheAuthorization: () => {},
  } as unknown as AttestationCache;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('list-authorizations', () => {
  it('returns empty message when no authorizations', async () => {
    const handler = listAuthorizationsHandler(mockState());
    const result = await handler();
    expect(result.content[0].text).toContain('No active authorizations');
  });

  it('lists active authorizations with bounds and TTL', async () => {
    const now = Math.floor(Date.now() / 1000);
    const handler = listAuthorizationsHandler(mockState([
      {
        frameHash: 'sha256:abc',
        profileId: 'spend@0.3',
        path: 'spend-routine',
        frame: {
          profile: 'spend@0.3',
          path: 'spend-routine',
          amount_max: 80,
          currency: 'EUR',
          action_type: 'charge',
          target_env: 'production',
        },
        attestations: [{ domain: 'finance', blob: 'blob', expiresAt: now + 2700 }],
        requiredDomains: ['finance'],
        attestedDomains: ['finance'],
        complete: true,
      },
    ]));

    const result = await handler();
    const text = result.content[0].text;
    expect(text).toContain('Active authorizations');
    expect(text).toContain('spend-routine');
    expect(text).toContain('amount_max: 80');
    expect(text).toContain('currency: EUR');
  });

  it('lists pending authorizations with missing domains', async () => {
    const now = Math.floor(Date.now() / 1000);
    const handler = listAuthorizationsHandler(mockState([
      {
        frameHash: 'sha256:abc',
        profileId: 'spend@0.3',
        path: 'spend-reviewed',
        frame: {
          profile: 'spend@0.3',
          path: 'spend-reviewed',
          amount_max: 5000,
          currency: 'EUR',
          action_type: 'charge',
          target_env: 'production',
        },
        attestations: [{ domain: 'finance', blob: 'blob', expiresAt: now + 3600 }],
        requiredDomains: ['finance', 'compliance'],
        attestedDomains: ['finance'],
        complete: false,
      },
    ]));

    const result = await handler();
    const text = result.content[0].text;
    expect(text).toContain('Pending');
    expect(text).toContain('compliance');
  });
});

describe('check-pending-attestations', () => {
  it('returns empty message when no pending', async () => {
    const handler = checkPendingHandler(mockCache());
    const result = await handler({ domain: 'compliance' });
    expect(result.content[0].text).toContain('No pending attestations');
  });
});
