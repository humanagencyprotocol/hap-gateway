/**
 * Mandate Brief — renders enriched authorizations into a compact text brief
 * that is set as MCP `instructions` so the agent understands its mandate.
 */

import type { EnrichedAuthorization } from './shared-state';

/**
 * Build the mandate brief text from enriched authorizations.
 * Returns null if there are no active authorizations.
 */
export function buildMandateBrief(authorizations: EnrichedAuthorization[]): string {
  const lines: string[] = [
    'You are an agent operating under the Human Agency Protocol (HAP).',
    'You have bounded authorities granted by human decision owners.',
    'You MUST stay within these bounds — the Gatekeeper will reject actions that exceed them.',
  ];

  const active = authorizations.filter(a => a.complete);
  const pending = authorizations.filter(a => !a.complete);
  const now = Math.floor(Date.now() / 1000);

  if (active.length > 0) {
    lines.push('');
    lines.push('=== ACTIVE AUTHORITIES ===');
    lines.push('');

    for (const auth of active) {
      const earliestExpiry = Math.min(...auth.attestations.map(a => a.expiresAt));
      const remainingMin = Math.max(0, Math.round((earliestExpiry - now) / 60));

      const boundsDesc = Object.entries(auth.frame)
        .filter(([key]) => key !== 'profile' && key !== 'path')
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      lines.push(`[${auth.path}] ${auth.profileId} (${remainingMin} min remaining)`);
      lines.push(`  Bounds: ${boundsDesc}`);

      if (auth.gateContent) {
        lines.push(`  Problem: ${auth.gateContent.problem}`);
        lines.push(`  Objective: ${auth.gateContent.objective}`);
        lines.push(`  Tradeoffs: ${auth.gateContent.tradeoffs}`);
      }

      lines.push('');
    }
  }

  if (pending.length > 0) {
    lines.push('=== PENDING (awaiting attestations) ===');
    lines.push('');

    for (const auth of pending) {
      const missing = auth.requiredDomains.filter(d => !auth.attestedDomains.includes(d));
      lines.push(`[${auth.path}] ${auth.profileId} — needs: ${missing.join(', ')}`);
    }

    lines.push('');
  }

  // Tool guidance
  const hasPayment = active.some(a => a.profileId.startsWith('payment-gate'));
  const hasComms = active.some(a => a.profileId.startsWith('comms-send'));

  const toolHints: string[] = [];
  if (hasPayment) toolHints.push('"make-payment" for payment actions');
  if (hasComms) toolHints.push('"send-email" for communication actions');

  lines.push('=== TOOLS ===');
  if (toolHints.length > 0) {
    lines.push(`Use ${toolHints.join(', ')}. Call "list-authorizations" to refresh.`);
  } else if (active.length === 0) {
    lines.push('No active authorities. Call "list-authorizations" to check for updates.');
  }

  return lines.join('\n');
}
