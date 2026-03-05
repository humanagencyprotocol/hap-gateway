/**
 * Profile Registry
 */

import type { AgentProfile } from '../types';
import { PAYMENT_GATE_PROFILE } from './payment-gate';
import { COMMS_SEND_PROFILE } from './comms-send';

export { PAYMENT_GATE_PROFILE } from './payment-gate';
export { COMMS_SEND_PROFILE } from './comms-send';

const PROFILES: Record<string, AgentProfile> = {
  'payment-gate@0.3': PAYMENT_GATE_PROFILE,
  'comms-send@0.3': COMMS_SEND_PROFILE,
};

/**
 * Get a profile by ID.
 */
export function getProfile(profileId: string): AgentProfile | undefined {
  return PROFILES[profileId];
}

/**
 * List all available profile IDs.
 */
export function listProfiles(): string[] {
  return Object.keys(PROFILES);
}

/**
 * Get all profiles.
 */
export function getAllProfiles(): AgentProfile[] {
  return Object.values(PROFILES);
}
