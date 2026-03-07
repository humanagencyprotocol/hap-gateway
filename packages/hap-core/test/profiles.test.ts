import { describe, it, expect, beforeAll } from 'vitest';
import { getProfile, listProfiles, getAllProfiles, registerProfile } from '../src/profiles';
import { PAYMENT_GATE_PROFILE, COMMS_SEND_PROFILE } from './fixtures';

beforeAll(() => {
  registerProfile('payment-gate@0.3', PAYMENT_GATE_PROFILE);
  registerProfile('comms-send@0.3', COMMS_SEND_PROFILE);
});

describe('profiles', () => {
  describe('getProfile', () => {
    it('returns payment-gate profile', () => {
      const profile = getProfile('payment-gate@0.3');
      expect(profile).toBeDefined();
      expect(profile!.id).toBe('payment-gate@0.3');
    });

    it('returns comms-send profile', () => {
      const profile = getProfile('comms-send@0.3');
      expect(profile).toBeDefined();
      expect(profile!.id).toBe('comms-send@0.3');
    });

    it('returns undefined for unknown profile', () => {
      expect(getProfile('unknown@1.0')).toBeUndefined();
    });
  });

  describe('listProfiles', () => {
    it('lists all profile IDs', () => {
      const ids = listProfiles();
      expect(ids).toContain('payment-gate@0.3');
      expect(ids).toContain('comms-send@0.3');
    });
  });

  describe('getAllProfiles', () => {
    it('returns all profiles', () => {
      const profiles = getAllProfiles();
      expect(profiles).toHaveLength(2);
    });
  });

  describe('payment-gate@0.3', () => {
    it('has correct execution paths', () => {
      expect(PAYMENT_GATE_PROFILE.executionPaths['payment-routine']).toBeDefined();
      expect(PAYMENT_GATE_PROFILE.executionPaths['payment-routine'].requiredDomains).toEqual(['finance']);
      expect(PAYMENT_GATE_PROFILE.executionPaths['payment-large'].requiredDomains).toEqual(['finance', 'compliance']);
    });

    it('has constraint types on amount_max', () => {
      const field = PAYMENT_GATE_PROFILE.frameSchema.fields['amount_max'];
      expect(field.constraint).toBeDefined();
      expect(field.constraint!.enforceable).toContain('max');
    });

    it('has constraint types on currency', () => {
      const field = PAYMENT_GATE_PROFILE.frameSchema.fields['currency'];
      expect(field.constraint).toBeDefined();
      expect(field.constraint!.enforceable).toContain('enum');
    });

    it('has all 6 required gates', () => {
      expect(PAYMENT_GATE_PROFILE.requiredGates).toHaveLength(6);
      expect(PAYMENT_GATE_PROFILE.requiredGates).toContain('frame');
      expect(PAYMENT_GATE_PROFILE.requiredGates).toContain('problem');
      expect(PAYMENT_GATE_PROFILE.requiredGates).toContain('commitment');
      expect(PAYMENT_GATE_PROFILE.requiredGates).toContain('decision_owner');
    });

    it('has gate questions', () => {
      expect(PAYMENT_GATE_PROFILE.gateQuestions.problem.question).toBeDefined();
      expect(PAYMENT_GATE_PROFILE.gateQuestions.objective.question).toBeDefined();
      expect(PAYMENT_GATE_PROFILE.gateQuestions.tradeoffs.question).toBeDefined();
    });
  });

  describe('comms-send@0.3', () => {
    it('has correct execution paths', () => {
      expect(COMMS_SEND_PROFILE.executionPaths['send-internal']).toBeDefined();
      expect(COMMS_SEND_PROFILE.executionPaths['send-internal'].requiredDomains).toEqual(['communications']);
      expect(COMMS_SEND_PROFILE.executionPaths['send-external'].requiredDomains).toEqual(['communications', 'security']);
    });

    it('has constraint types on max_recipients', () => {
      const field = COMMS_SEND_PROFILE.frameSchema.fields['max_recipients'];
      expect(field.constraint).toBeDefined();
      expect(field.constraint!.enforceable).toContain('max');
    });

    it('has constraint types on channel', () => {
      const field = COMMS_SEND_PROFILE.frameSchema.fields['channel'];
      expect(field.constraint).toBeDefined();
      expect(field.constraint!.enforceable).toContain('enum');
    });
  });
});
