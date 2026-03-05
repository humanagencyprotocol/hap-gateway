import { describe, it, expect } from 'vitest';
import { canonicalFrame, computeFrameHash, validateFrameParams } from '../src/frame';
import { PAYMENT_GATE_PROFILE } from '../src/profiles/payment-gate';
import { COMMS_SEND_PROFILE } from '../src/profiles/comms-send';

describe('frame', () => {
  describe('canonicalFrame', () => {
    it('produces canonical string with correct key order', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 80,
        currency: 'EUR',
        target_env: 'production',
      };

      const result = canonicalFrame(frame, PAYMENT_GATE_PROFILE);
      expect(result).toBe(
        'profile=payment-gate@0.3\npath=payment-routine\namount_max=80\ncurrency=EUR\ntarget_env=production'
      );
    });

    it('converts numbers to strings in canonical form', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 100.5,
        currency: 'USD',
        target_env: 'staging',
      };

      const result = canonicalFrame(frame, PAYMENT_GATE_PROFILE);
      expect(result).toContain('amount_max=100.5');
    });

    it('works with comms-send profile', () => {
      const frame = {
        profile: 'comms-send@0.3',
        path: 'send-internal',
        max_recipients: 5,
        channel: 'email',
      };

      const result = canonicalFrame(frame, COMMS_SEND_PROFILE);
      expect(result).toBe(
        'profile=comms-send@0.3\npath=send-internal\nmax_recipients=5\nchannel=email'
      );
    });

    it('throws on missing required field', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        // missing amount_max, currency, target_env
      };

      expect(() => canonicalFrame(frame, PAYMENT_GATE_PROFILE)).toThrow('Missing required field');
    });

    it('throws on unknown field', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 80,
        currency: 'EUR',
        target_env: 'production',
        unknown_field: 'value',
      };

      expect(() => canonicalFrame(frame, PAYMENT_GATE_PROFILE)).toThrow('Unknown field');
    });

    it('throws on wrong type (string where number expected)', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 'eighty' as unknown as number,
        currency: 'EUR',
        target_env: 'production',
      };

      expect(() => canonicalFrame(frame, PAYMENT_GATE_PROFILE)).toThrow('must be a number');
    });
  });

  describe('computeFrameHash', () => {
    it('returns sha256: prefixed hash', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 80,
        currency: 'EUR',
        target_env: 'production',
      };

      const hash = computeFrameHash(frame, PAYMENT_GATE_PROFILE);
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('produces same hash for same inputs', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 80,
        currency: 'EUR',
        target_env: 'production',
      };

      const hash1 = computeFrameHash(frame, PAYMENT_GATE_PROFILE);
      const hash2 = computeFrameHash(frame, PAYMENT_GATE_PROFILE);
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different values', () => {
      const frame1 = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 80,
        currency: 'EUR',
        target_env: 'production',
      };
      const frame2 = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 100,
        currency: 'EUR',
        target_env: 'production',
      };

      const hash1 = computeFrameHash(frame1, PAYMENT_GATE_PROFILE);
      const hash2 = computeFrameHash(frame2, PAYMENT_GATE_PROFILE);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateFrameParams', () => {
    it('validates correct frame params', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        path: 'payment-routine',
        amount_max: 80,
        currency: 'EUR',
        target_env: 'production',
      };

      const result = validateFrameParams(frame, PAYMENT_GATE_PROFILE);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports multiple errors at once', () => {
      const frame = {
        profile: 'payment-gate@0.3',
        // missing path, amount_max, currency, target_env
      };

      const result = validateFrameParams(frame, PAYMENT_GATE_PROFILE);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
