/**
 * Gate Content Hash Verification — ensures plaintext gate content matches attestation hashes.
 *
 * v0.4: single `intent` hash.
 */

import { createHash } from 'node:crypto';
import { decodeAttestationBlob } from '@hap/core';
import type { GateContent } from './gate-store';
import type { CachedAuthorization } from './attestation-cache';

/**
 * Hash a gate content string using SHA-256.
 * Returns format: sha256:<hex>
 */
export function hashGateContent(text: string): string {
  const hex = createHash('sha256').update(text, 'utf-8').digest('hex');
  return `sha256:${hex}`;
}

/**
 * Verify that gate content plaintext matches the intent hash in the attestation.
 */
export function verifyGateContentHashes(
  content: GateContent,
  auth: CachedAuthorization
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (auth.attestations.length === 0) {
    return { valid: false, errors: ['No attestations available to verify against'] };
  }

  const attestation = decodeAttestationBlob(auth.attestations[0].blob);
  const expectedHashes = attestation.payload.gate_content_hashes;

  if (!expectedHashes?.intent) {
    return { valid: false, errors: ['Attestation does not contain intent hash'] };
  }

  if (!content.intent) {
    return { valid: false, errors: ['Missing intent content'] };
  }

  const actual = hashGateContent(content.intent);
  if (actual !== expectedHashes.intent) {
    errors.push(`Hash mismatch for "intent": expected ${expectedHashes.intent}, got ${actual}`);
  }

  return { valid: errors.length === 0, errors };
}
