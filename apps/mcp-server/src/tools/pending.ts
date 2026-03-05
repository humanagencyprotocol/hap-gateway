/**
 * check-pending-attestations tool — checks for attestations needing owner approval.
 */

import type { AttestationCache } from '../lib/attestation-cache';

export interface PendingArgs {
  domain: string;
}

export function checkPendingHandler(cache: AttestationCache) {
  return async (args: PendingArgs) => {
    const { domain } = args;

    try {
      const pending = await cache.getPendingAttestations(domain);

      if (pending.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No pending attestations for domain "${domain}".`,
          }],
        };
      }

      const lines = [`Pending attestations needing your domain (${domain}):`];
      for (const item of pending) {
        const boundsDesc = Object.entries(item.frame)
          .filter(([key]) => key !== 'profile' && key !== 'path')
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');

        const attested = item.attested_domains.join(', ');
        const missing = item.missing_domains.join(', ');
        const remaining = item.remaining_seconds
          ? `${Math.round(item.remaining_seconds / 60)} min remaining`
          : 'unknown';

        lines.push(
          `  ${item.profile_id} / ${item.path}: ${boundsDesc}` +
          `\n    Attested: ${attested} | Missing: ${missing} | ${remaining}`
        );
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to check pending attestations: ${error}`,
        }],
        isError: true,
      };
    }
  };
}
