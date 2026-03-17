/**
 * Consumption State — resolves cumulative usage from execution log and profile schema.
 *
 * Used by mandate-brief (compact) and list-authorizations (full detail).
 */

import type { AgentProfile, CumulativeFieldDef } from '@hap/core';
import type { ExecutionLog } from './execution-log';
import type { EnrichedAuthorization } from './shared-state';

export interface ConsumptionEntry {
  /** Human-readable label, e.g. "Daily spend" */
  label: string;
  /** Current cumulative value */
  current: number;
  /** Max limit from frame bounds, or null if no matching bound */
  limit: number | null;
  /** Time window */
  window: string;
  /** The cumulative field name in the execution context schema */
  field: string;
}

/**
 * Compute consumption state for an authorization by iterating
 * the profile's cumulative execution context fields.
 */
export function getConsumptionState(
  auth: EnrichedAuthorization,
  executionLog: ExecutionLog,
  profile: AgentProfile | undefined,
): ConsumptionEntry[] {
  if (!profile) return [];

  const entries: ConsumptionEntry[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const [fieldName, fieldDef] of Object.entries(profile.executionContextSchema.fields)) {
    if (fieldDef.source !== 'cumulative') continue;

    const cumDef = fieldDef as CumulativeFieldDef;
    const current = executionLog.sumByWindow(
      auth.profileId,
      auth.path,
      cumDef.cumulativeField,
      cumDef.window,
      now,
    );

    // Look up the corresponding _max bound in the frame
    const maxKey = `${fieldName}_max`;
    const limit = typeof auth.frame[maxKey] === 'number' ? auth.frame[maxKey] as number : null;

    entries.push({
      label: fieldDef.description,
      current,
      limit,
      window: cumDef.window,
      field: fieldName,
    });
  }

  return entries;
}

/**
 * Format consumption as a compact single line for the mandate brief.
 * e.g. "$234/$500 daily, 8/20 tx"
 */
export function formatConsumptionCompact(entries: ConsumptionEntry[]): string {
  if (entries.length === 0) return '';

  const parts: string[] = [];
  for (const entry of entries) {
    if (entry.limit === null) continue;

    // Use short labels based on field name patterns
    if (entry.field.startsWith('amount_daily')) {
      parts.push(`$${entry.current}/$${entry.limit} daily`);
    } else if (entry.field.startsWith('amount_monthly')) {
      parts.push(`$${entry.current}/$${entry.limit} monthly`);
    } else if (entry.field.startsWith('transaction_count')) {
      parts.push(`${entry.current}/${entry.limit} tx`);
    } else {
      parts.push(`${entry.current}/${entry.limit} ${entry.window}`);
    }
  }

  return parts.join(', ');
}

/**
 * Format consumption as multi-line detail for list-authorizations.
 */
export function formatConsumptionFull(entries: ConsumptionEntry[]): string {
  if (entries.length === 0) return '';

  const lines: string[] = [];
  for (const entry of entries) {
    const limitStr = entry.limit !== null ? String(entry.limit) : 'unlimited';
    // Pad label to align values
    const label = `${entry.label}:`;
    lines.push(`    ${label.padEnd(30)} ${entry.current} / ${limitStr}`);
  }

  return lines.join('\n');
}
