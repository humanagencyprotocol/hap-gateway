import { describe, it, expect } from 'vitest';
import { listAuthorizationsHandler } from '../src/tools/authorizations';
import { makePaymentHandler } from '../src/tools/payment';
import { checkPendingHandler } from '../src/tools/pending';
import type { AttestationCache, CachedAuthorization } from '../src/lib/attestation-cache';
import type { MCPGatekeeper } from '../src/lib/gatekeeper';
import type { SharedState, EnrichedAuthorization } from '../src/lib/shared-state';
import type { GatekeeperResult } from '@hap/core';

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

function mockGatekeeper(verifyResult: GatekeeperResult): MCPGatekeeper {
  return {
    verifyExecution: async (_path: string, _execution: Record<string, string | number>) => ({
      result: verifyResult,
      authorization: null,
    }),
  } as unknown as MCPGatekeeper;
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
        profileId: 'payment-gate@0.3',
        path: 'payment-routine',
        frame: {
          profile: 'payment-gate@0.3',
          path: 'payment-routine',
          amount_max: 80,
          currency: 'EUR',
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
    expect(text).toContain('payment-routine');
    expect(text).toContain('amount_max: 80');
    expect(text).toContain('currency: EUR');
  });

  it('lists pending authorizations with missing domains', async () => {
    const now = Math.floor(Date.now() / 1000);
    const handler = listAuthorizationsHandler(mockState([
      {
        frameHash: 'sha256:abc',
        profileId: 'payment-gate@0.3',
        path: 'payment-large',
        frame: {
          profile: 'payment-gate@0.3',
          path: 'payment-large',
          amount_max: 5000,
          currency: 'EUR',
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

describe('make-payment', () => {
  it('returns success when Gatekeeper approves', async () => {
    const handler = makePaymentHandler(mockGatekeeper({ approved: true }));
    const result = await handler({
      authorization: 'payment-routine',
      amount: 5,
      currency: 'EUR',
      recipient: 'supplier-x',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Payment confirmed');
    expect(result.content[0].text).toContain('supplier-x');
  });

  it('returns error when Gatekeeper rejects', async () => {
    const handler = makePaymentHandler(mockGatekeeper({
      approved: false,
      errors: [{
        code: 'BOUND_EXCEEDED',
        field: 'amount',
        message: 'Value 120 exceeds authorized maximum of 80',
        bound: 80,
        actual: 120,
      }],
    }));

    const result = await handler({
      authorization: 'payment-routine',
      amount: 120,
      currency: 'EUR',
      recipient: 'supplier-x',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Payment rejected');
    expect(result.content[0].text).toContain('120');
    expect(result.content[0].text).toContain('80');
  });

  it('returns error when no authorization exists', async () => {
    const handler = makePaymentHandler(mockGatekeeper({
      approved: false,
      errors: [{
        code: 'DOMAIN_NOT_COVERED',
        message: 'No active authorization for "payment-routine".',
      }],
    }));

    const result = await handler({
      authorization: 'payment-routine',
      amount: 5,
      currency: 'EUR',
      recipient: 'supplier-x',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active authorization');
  });
});

describe('check-pending-attestations', () => {
  it('returns empty message when no pending', async () => {
    const handler = checkPendingHandler(mockCache());
    const result = await handler({ domain: 'compliance' });
    expect(result.content[0].text).toContain('No pending attestations');
  });
});
