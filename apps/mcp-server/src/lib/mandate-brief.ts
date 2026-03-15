/**
 * Mandate Brief — renders enriched authorizations into a compact text brief
 * that is set as MCP `instructions` so the agent understands its mandate.
 */

import type { EnrichedAuthorization } from './shared-state';

/** Map profile short names to human-readable tool descriptions. */
const PROFILE_TOOL_HINTS: Record<string, string> = {
  spend: 'financial tools (payments, invoices, refunds)',
  publish: 'communication tools (email, notifications)',
  ship: 'deployment tools (releases, rollbacks)',
  data: 'data tools (queries, exports)',
  provision: 'infrastructure tools (resources, configs)',
};

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

  // Tool guidance — dynamic based on active profile short names
  const toolHints: string[] = [];
  for (const auth of active) {
    // Extract short name from profile ID (e.g., "spend@0.3" → "spend")
    const shortName = auth.profileId.replace(/@.*$/, '');
    const hint = PROFILE_TOOL_HINTS[shortName];
    if (hint && !toolHints.includes(hint)) {
      toolHints.push(hint);
    }
  }

  lines.push('=== TOOLS ===');
  if (toolHints.length > 0) {
    lines.push(`Available: ${toolHints.join(', ')}. Call "list-authorizations" to refresh.`);
  } else if (active.length === 0) {
    lines.push('No active authorities. Call "list-authorizations" to check for updates.');
  }

  return lines.join('\n');
}
