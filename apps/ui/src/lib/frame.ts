/**
 * Frame hash computation for the Authority UI.
 *
 * Uses SubtleCrypto (browser) instead of Node crypto.
 */

import type { AgentProfile, AgentFrameParams } from '@hap/core';

/**
 * Compute SHA-256 hash in the browser.
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute frame hash client-side using the same canonical form as hap-core.
 */
export async function computeFrameHashBrowser(
  params: AgentFrameParams,
  profile: AgentProfile
): Promise<string> {
  const lines = profile.frameSchema.keyOrder.map(
    (key) => `${key}=${String(params[key])}`
  );
  const canonical = lines.join('\n');
  const hash = await sha256(canonical);
  return `sha256:${hash}`;
}

/**
 * Hash gate content (text) for gate_content_hashes.
 */
export async function hashGateContent(text: string): Promise<string> {
  const hash = await sha256(text);
  return `sha256:${hash}`;
}
