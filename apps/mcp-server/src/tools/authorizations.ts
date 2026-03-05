/**
 * list-authorizations tool — shows what the agent is authorized to do,
 * including gate content (problem/objective/tradeoffs) when available.
 */

import type { SharedState } from '../lib/shared-state';

export function listAuthorizationsHandler(state: SharedState) {
  return async () => {
    const authorizations = state.getEnrichedAuthorizations();
    const now = Math.floor(Date.now() / 1000);

    if (authorizations.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: 'No active authorizations. A decision owner must grant authority via the Authority UI.',
        }],
      };
    }

    const active: string[] = [];
    const pending: string[] = [];

    for (const auth of authorizations) {
      const earliestExpiry = Math.min(...auth.attestations.map(a => a.expiresAt));
      const remainingMin = Math.max(0, Math.round((earliestExpiry - now) / 60));

      const boundsDesc = Object.entries(auth.frame)
        .filter(([key]) => key !== 'profile' && key !== 'path')
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      if (auth.complete) {
        const lines = [`  ${auth.path}: ${boundsDesc}, ${remainingMin} min remaining`];

        if (auth.gateContent) {
          lines.push(`    Problem: ${auth.gateContent.problem}`);
          lines.push(`    Objective: ${auth.gateContent.objective}`);
          lines.push(`    Tradeoffs: ${auth.gateContent.tradeoffs}`);
        }

        active.push(lines.join('\n'));
      } else {
        const missing = auth.requiredDomains.filter(d => !auth.attestedDomains.includes(d));
        pending.push(
          `  ${auth.path}: ${boundsDesc} — needs ${missing.join(', ')} attestation, ${remainingMin} min remaining`
        );
      }
    }

    const output: string[] = [];
    if (active.length > 0) {
      output.push('Active authorizations:');
      output.push(...active);
    }
    if (pending.length > 0) {
      if (output.length > 0) output.push('');
      output.push('Pending (missing owners):');
      output.push(...pending);
    }

    return {
      content: [{
        type: 'text' as const,
        text: output.join('\n'),
      }],
    };
  };
}
