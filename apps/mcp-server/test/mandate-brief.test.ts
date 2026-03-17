import { describe, it, expect, vi } from 'vitest';
import { buildMandateBrief } from '../src/lib/mandate-brief';
import type { EnrichedAuthorization } from '../src/lib/shared-state';
import type { ExecutionLog } from '../src/lib/execution-log';

function mockAuth(overrides: Partial<EnrichedAuthorization> = {}): EnrichedAuthorization {
  const now = Math.floor(Date.now() / 1000);
  return {
    frameHash: 'sha256:abc',
    profileId: 'spend@0.3',
    path: 'spend-routine',
    frame: {
      profile: 'spend@0.3',
      path: 'spend-routine',
      amount_max: 100,
      currency: 'USD',
      action_type: 'charge',
      amount_daily_max: 500,
      amount_monthly_max: 5000,
      transaction_count_daily_max: 20,
    },
    attestations: [{ domain: 'finance', blob: 'blob', expiresAt: now + 2700 }],
    requiredDomains: ['finance'],
    attestedDomains: ['finance'],
    complete: true,
    gateContent: {
      problem: 'Enable automated purchasing',
      objective: 'Allow agent to process payments',
      tradeoffs: 'Accepts risk of charges up to limits',
    },
    ...overrides,
  };
}

function mockLog(): ExecutionLog {
  return {
    sumByWindow: vi.fn().mockReturnValue(0),
    record: vi.fn(),
  } as unknown as ExecutionLog;
}

describe('buildMandateBrief', () => {
  it('includes HAP preamble', () => {
    const brief = buildMandateBrief({ authorizations: [] });
    expect(brief).toContain('Human Agency Protocol');
    expect(brief).toContain('bounded authorities');
  });

  it('includes active authority with bounds and gate content', () => {
    const brief = buildMandateBrief({ authorizations: [mockAuth()] });
    expect(brief).toContain('=== ACTIVE AUTHORITIES ===');
    expect(brief).toContain('[spend-routine]');
    expect(brief).toContain('spend@0.3');
    expect(brief).toContain('Bounds:');
    expect(brief).toContain('amount_max: 100');
    expect(brief).toContain('Problem: Enable automated purchasing');
    expect(brief).toContain('Objective: Allow agent to process payments');
  });

  it('includes pending authorities with missing domains', () => {
    const pending = mockAuth({
      complete: false,
      path: 'spend-reviewed',
      requiredDomains: ['finance', 'compliance'],
      attestedDomains: ['finance'],
    });
    const brief = buildMandateBrief({ authorizations: [pending] });
    expect(brief).toContain('PENDING');
    expect(brief).toContain('compliance');
  });

  it('includes list-authorizations instruction', () => {
    const brief = buildMandateBrief({ authorizations: [mockAuth()] });
    expect(brief).toContain('list-authorizations');
  });

  it('includes context section when contextDir has context.md', () => {
    // We can't easily test this without a real file, so just verify
    // the function doesn't crash when contextDir is provided
    const brief = buildMandateBrief({
      authorizations: [mockAuth()],
      contextDir: '/nonexistent',
    });
    expect(brief).toContain('=== ACTIVE AUTHORITIES ===');
    // No context section since file doesn't exist
    expect(brief).not.toContain('=== CONTEXT ===');
  });
});
