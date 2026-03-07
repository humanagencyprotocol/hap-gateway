import { describe, it, expect, beforeAll } from 'vitest';
import { verify } from '../src/gatekeeper';
import { registerProfile } from '../src/profiles';
import { PAYMENT_GATE_PROFILE } from './fixtures';
import { generateTestKeyPair, createTestAttestation, type TestKeyPair } from './helpers';
import type { AgentFrameParams } from '../src/types';

describe('gatekeeper', () => {
  let keyPair: TestKeyPair;
  let wrongKeyPair: TestKeyPair;

  const routineFrame: AgentFrameParams = {
    profile: 'payment-gate@0.3',
    path: 'payment-routine',
    amount_max: 80,
    currency: 'EUR',
    target_env: 'production',
  };

  const largeFrame: AgentFrameParams = {
    profile: 'payment-gate@0.3',
    path: 'payment-large',
    amount_max: 5000,
    currency: 'EUR',
    target_env: 'production',
  };

  beforeAll(async () => {
    registerProfile('payment-gate@0.3', PAYMENT_GATE_PROFILE);
    keyPair = await generateTestKeyPair();
    wrongKeyPair = await generateTestKeyPair();
  });

  describe('within bounds → approved', () => {
    it('approves payment within max amount', async () => {
      const blob = await createTestAttestation({
        keyPair,
        frame: routineFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
      });

      const result = await verify(
        {
          frame: routineFrame,
          attestations: [blob],
          execution: { amount: 5, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(true);
    });

    it('approves payment at exact max amount', async () => {
      const blob = await createTestAttestation({
        keyPair,
        frame: routineFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
      });

      const result = await verify(
        {
          frame: routineFrame,
          attestations: [blob],
          execution: { amount: 80, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(true);
    });
  });

  describe('exceeds max → BOUND_EXCEEDED', () => {
    it('rejects amount exceeding max', async () => {
      const blob = await createTestAttestation({
        keyPair,
        frame: routineFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
      });

      const result = await verify(
        {
          frame: routineFrame,
          attestations: [blob],
          execution: { amount: 120, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('BOUND_EXCEEDED');
        expect(result.errors[0].field).toBe('amount');
        expect(result.errors[0].actual).toBe(120);
        expect(result.errors[0].bound).toBe(80);
      }
    });
  });

  describe('wrong currency → BOUND_EXCEEDED', () => {
    it('rejects wrong currency', async () => {
      const blob = await createTestAttestation({
        keyPair,
        frame: routineFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
      });

      const result = await verify(
        {
          frame: routineFrame,
          attestations: [blob],
          execution: { amount: 5, currency: 'USD', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors.some(e => e.code === 'BOUND_EXCEEDED' && e.field === 'currency')).toBe(true);
      }
    });
  });

  describe('expired → TTL_EXPIRED', () => {
    it('rejects expired attestation', async () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 100;
      const blob = await createTestAttestation({
        keyPair,
        frame: routineFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
        expiresAt: pastExpiry,
      });

      const result = await verify(
        {
          frame: routineFrame,
          attestations: [blob],
          execution: { amount: 5, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors.some(e => e.code === 'TTL_EXPIRED')).toBe(true);
      }
    });
  });

  describe('bad signature → INVALID_SIGNATURE', () => {
    it('rejects attestation signed with wrong key', async () => {
      const blob = await createTestAttestation({
        keyPair: wrongKeyPair,
        frame: routineFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
      });

      const result = await verify(
        {
          frame: routineFrame,
          attestations: [blob],
          execution: { amount: 5, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex // verifying with a different key
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors.some(e => e.code === 'INVALID_SIGNATURE')).toBe(true);
      }
    });
  });

  describe('missing domain → DOMAIN_NOT_COVERED', () => {
    it('rejects when required domain is missing (multi-owner)', async () => {
      // payment-large requires finance + compliance
      const financeBlob = await createTestAttestation({
        keyPair,
        frame: largeFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
      });

      // Only finance attested, compliance missing
      const result = await verify(
        {
          frame: largeFrame,
          attestations: [financeBlob],
          execution: { amount: 2000, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors.some(e => e.code === 'DOMAIN_NOT_COVERED' && e.message.includes('compliance'))).toBe(true);
      }
    });

    it('approves when all domains are covered', async () => {
      const financeBlob = await createTestAttestation({
        keyPair,
        frame: largeFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'finance',
      });
      const complianceBlob = await createTestAttestation({
        keyPair,
        frame: largeFrame,
        profile: PAYMENT_GATE_PROFILE,
        domain: 'compliance',
      });

      const result = await verify(
        {
          frame: largeFrame,
          attestations: [financeBlob, complianceBlob],
          execution: { amount: 2000, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(true);
    });
  });

  describe('unknown profile → INVALID_PROFILE', () => {
    it('rejects unknown profile ID', async () => {
      const result = await verify(
        {
          frame: { profile: 'unknown@1.0', path: 'test' },
          attestations: [],
          execution: {},
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors[0].code).toBe('INVALID_PROFILE');
      }
    });
  });

  describe('unknown execution path → INVALID_PROFILE', () => {
    it('rejects unknown path', async () => {
      const result = await verify(
        {
          frame: { profile: 'payment-gate@0.3', path: 'nonexistent-path', amount_max: 80, currency: 'EUR', target_env: 'production' },
          attestations: [],
          execution: {},
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors[0].code).toBe('INVALID_PROFILE');
      }
    });
  });

  describe('authorization checked before bounds (§8.6.4 rule 4)', () => {
    it('returns authorization errors even if bounds would pass', async () => {
      // No attestations at all — should fail with DOMAIN_NOT_COVERED, not check bounds
      const result = await verify(
        {
          frame: routineFrame,
          attestations: [],
          execution: { amount: 5, currency: 'EUR', target_env: 'production' },
        },
        keyPair.publicKeyHex
      );

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.errors.some(e => e.code === 'DOMAIN_NOT_COVERED')).toBe(true);
        // Should NOT contain BOUND_EXCEEDED since auth failed first
        expect(result.errors.some(e => e.code === 'BOUND_EXCEEDED')).toBe(false);
      }
    });
  });
});
