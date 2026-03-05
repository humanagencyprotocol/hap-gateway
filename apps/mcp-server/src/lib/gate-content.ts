/**
 * Gate Content Hash Verification — ensures plaintext gate content matches attestation hashes.
 *
 * The SP stores only hashes. This module verifies that the plaintext content
 * pushed to the MCP server matches what was attested to.
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
 * Verify that gate content plaintext matches the hashes in the attestation.
 * Decodes the first attestation blob and compares gate_content_hashes field by field.
 */
export function verifyGateContentHashes(
  content: GateContent,
  auth: CachedAuthorization
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (auth.attestations.length === 0) {
    return { valid: false, errors: ['No attestations available to verify against'] };
  }

  // Decode first attestation blob to get gate_content_hashes
  const attestation = decodeAttestationBlob(auth.attestations[0].blob);
  const expectedHashes = attestation.payload.gate_content_hashes;

  if (!expectedHashes) {
    return { valid: false, errors: ['Attestation does not contain gate_content_hashes'] };
  }

  for (const field of ['problem', 'objective', 'tradeoffs'] as const) {
    const expected = expectedHashes[field];
    if (!expected) {
      errors.push(`Attestation missing hash for "${field}"`);
      continue;
    }

    const actual = hashGateContent(content[field]);
    if (actual !== expected) {
      errors.push(`Hash mismatch for "${field}": expected ${expected}, got ${actual}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
