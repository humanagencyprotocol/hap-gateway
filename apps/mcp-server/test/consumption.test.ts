import { describe, it, expect, vi } from 'vitest';
import { getConsumptionState, formatConsumptionCompact, formatConsumptionFull } from '../src/lib/consumption';
import type { EnrichedAuthorization } from '../src/lib/shared-state';
import type { ExecutionLog } from '../src/lib/execution-log';
import type { AgentProfile } from '@hap/core';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockAuth(overrides: Partial<EnrichedAuthorization> = {}): EnrichedAuthorization {
  const now = Math.floor(Date.now() / 1000);
  return {
    frameHash: 'sha256:abc',
    profileId: 'github.com/humanagencyprotocol/hap-profiles/spend@0.3',
    path: 'spend-routine',
    frame: {
      profile: 'github.com/humanagencyprotocol/hap-profiles/spend@0.3',
      path: 'spend-routine',
      amount_max: 100,
      currency: 'USD',
      action_type: 'charge',
      amount_daily_max: 500,
      amount_monthly_max: 5000,
      transaction_count_daily_max: 20,
    },
    attestations: [{ domain: 'finance', blob: 'blob', expiresAt: now + 3600 }],
    requiredDomains: ['finance'],
    attestedDomains: ['finance'],
    complete: true,
    gateContent: null,
    ...overrides,
  };
}

function mockSpendProfile(): AgentProfile {
  return {
    id: 'github.com/humanagencyprotocol/hap-profiles/spend@0.3',
    version: '0.3',
    description: 'Financial authority',
    frameSchema: { keyOrder: [], fields: {} },
    executionContextSchema: {
      fields: {
        action_type: { source: 'declared', description: 'Financial operation', required: true },
        amount: { source: 'declared', description: 'Monetary amount', required: true },
        currency: { source: 'declared', description: 'Currency code', required: true },
        amount_daily: {
          source: 'cumulative',
          cumulativeField: 'amount',
          window: 'daily',
          description: 'Running daily spend total',
          required: true,
        },
        amount_monthly: {
          source: 'cumulative',
          cumulativeField: 'amount',
          window: 'monthly',
          description: 'Running monthly spend total',
          required: true,
        },
        transaction_count_daily: {
          source: 'cumulative',
          cumulativeField: '_count',
          window: 'daily',
          description: 'Running daily transaction count',
          required: true,
        },
      },
    },
    executionPaths: {},
    requiredGates: [],
    gateQuestions: {
      problem: { question: '', required: true },
      objective: { question: '', required: true },
      tradeoffs: { question: '', required: true },
    },
    ttl: { default: 86400, max: 86400 },
    retention_minimum: 7776000,
  };
}

function mockLog(returnValues: Record<string, number> = {}): ExecutionLog {
  return {
    sumByWindow: vi.fn().mockImplementation(
      (_profileId: string, _path: string, field: string, _window: string) => {
        return returnValues[field] ?? 0;
      },
    ),
    record: vi.fn(),
    getAll: () => [],
    size: 0,
  } as unknown as ExecutionLog;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('getConsumptionState', () => {
  it('returns entries for cumulative fields with limits from frame', () => {
    const auth = mockAuth();
    const profile = mockSpendProfile();
    const log = mockLog({ amount: 234.5, _count: 8 });

    const entries = getConsumptionState(auth, log, profile);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ field: 'amount_daily', current: 234.5, limit: 500, window: 'daily' });
    expect(entries[1]).toMatchObject({ field: 'amount_monthly', current: 234.5, limit: 5000, window: 'monthly' });
    expect(entries[2]).toMatchObject({ field: 'transaction_count_daily', current: 8, limit: 20, window: 'daily' });
  });

  it('returns empty array for undefined profile', () => {
    const entries = getConsumptionState(mockAuth(), mockLog(), undefined);
    expect(entries).toEqual([]);
  });

  it('sets limit to null when frame has no matching _max field', () => {
    const auth = mockAuth({
      frame: { profile: 'spend@0.3', path: 'spend-routine', amount_max: 100, currency: 'USD', action_type: 'charge' },
    });
    const profile = mockSpendProfile();
    const log = mockLog({ amount: 50 });

    const entries = getConsumptionState(auth, log, profile);
    // amount_daily_max is missing from frame
    const dailyEntry = entries.find(e => e.field === 'amount_daily');
    expect(dailyEntry?.limit).toBeNull();
  });
});

describe('formatConsumptionCompact', () => {
  it('formats spend entries as compact string', () => {
    const entries = [
      { label: 'Daily spend', current: 234, limit: 500, window: 'daily', field: 'amount_daily' },
      { label: 'Monthly spend', current: 1280, limit: 5000, window: 'monthly', field: 'amount_monthly' },
      { label: 'Daily tx count', current: 8, limit: 20, window: 'daily', field: 'transaction_count_daily' },
    ];

    const result = formatConsumptionCompact(entries);
    expect(result).toBe('$234/$500 daily, $1280/$5000 monthly, 8/20 tx');
  });

  it('returns empty string for no entries', () => {
    expect(formatConsumptionCompact([])).toBe('');
  });

  it('skips entries with null limit', () => {
    const entries = [
      { label: 'Some field', current: 10, limit: null, window: 'daily', field: 'amount_daily' },
    ];
    expect(formatConsumptionCompact(entries)).toBe('');
  });
});

describe('formatConsumptionFull', () => {
  it('formats entries with aligned labels', () => {
    const entries = [
      { label: 'Running daily spend total', current: 234, limit: 500, window: 'daily', field: 'amount_daily' },
      { label: 'Running daily transaction count', current: 8, limit: 20, window: 'daily', field: 'transaction_count_daily' },
    ];

    const result = formatConsumptionFull(entries);
    expect(result).toContain('Running daily spend total:');
    expect(result).toContain('234 / 500');
    expect(result).toContain('Running daily transaction count:');
    expect(result).toContain('8 / 20');
  });

  it('shows unlimited for null limits', () => {
    const entries = [
      { label: 'Some field', current: 10, limit: null, window: 'daily', field: 'foo' },
    ];
    const result = formatConsumptionFull(entries);
    expect(result).toContain('10 / unlimited');
  });

  it('returns empty string for no entries', () => {
    expect(formatConsumptionFull([])).toBe('');
  });
});
