/**
 * Tool Proxy — HAP gating wrapper for proxied tool calls.
 *
 * Wraps downstream MCP tool calls with HAP authorization verification.
 * ALL tools require authorization — no ungated access.
 *
 * - Read-only tools (category: "read") require a matching authorization
 *   but skip execution context verification.
 * - Write tools require full execution context verification against bounds.
 */

import type { IntegrationManager, DiscoveredTool } from './integration-manager';
import type { SharedState, EnrichedAuthorization } from './shared-state';
import { SPReceiptError } from './sp-client';

/**
 * Apply a single mapping entry to produce an execution context field.
 * Handles divisor, transform, and direct copy.
 */
function applyMapping(
  m: { field: string; divisor?: number; transform?: string },
  value: unknown,
  execution: Record<string, string | number>,
): void {
  if (m.divisor) {
    const numValue = typeof value === 'number' ? value : Number(value);
    execution[m.field] = numValue / m.divisor;
    return;
  }
  const arr = Array.isArray(value) ? value.map(String) : [String(value)];
  switch (m.transform) {
    case 'length':
      execution[m.field] = arr.length;
      break;
    case 'join':
      execution[m.field] = arr.join(',');
      break;
    case 'join_domains': {
      const domains = [...new Set(arr.map(email => {
        const at = email.lastIndexOf('@');
        return at >= 0 ? email.substring(at + 1).toLowerCase() : email.toLowerCase();
      }))].sort();
      execution[m.field] = domains.join(',');
      break;
    }
    default:
      execution[m.field] = typeof value === 'number' ? value : String(value);
  }
}

/** Match a short profile name (e.g. "charge") against a full qualified ID (e.g. "github.com/.../charge@0.3") */
export function profileMatches(profileId: string, shortName: string): boolean {
  return profileId === shortName || profileId.includes('/' + shortName + '@') || profileId.endsWith('/' + shortName);
}

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

/**
 * Create a handler function for a proxied tool that gates calls through HAP.
 *
 * All tools require authorization:
 * - Read tools (category: "read") → need matching auth, no execution context checks
 * - Write tools → full execution context verification against bounds
 */
export function createGatedToolHandler(
  tool: DiscoveredTool,
  integrationManager: IntegrationManager,
  state: SharedState,
): (args: Record<string, unknown>) => Promise<ToolResult> {
  // Tools without gating config still require authorization if integration has a profile
  if (!tool.gating || !tool.gating.profile) {
    return async () => {
      return {
        content: [{
          type: 'text',
          text: `Tool "${tool.namespacedName}" has no gating configuration. All tools require authorization.`,
        }],
        isError: true,
      };
    };
  }

  const { profile, executionMapping, staticExecution, category } = tool.gating;

  // Read-only tools: require matching authorization but skip execution context checks
  if (category === 'read') {
    return async (args: Record<string, unknown>) => {
      const auths = state.getEnrichedAuthorizations();
      const matchingAuths = auths.filter(
        a => a.complete && profileMatches(a.profileId, profile!),
      );

      if (matchingAuths.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No active authorization matching profile "${profile}". ` +
              `A decision owner must grant authority via the Authority UI before this tool can be used.`,
          }],
          isError: true,
        };
      }

      // Authorization exists — proxy the read call (no execution context verification needed)
      return integrationManager.callTool(tool.integrationId, tool.originalName, args);
    };
  }

  // Write tools: full execution context verification
  return async (args: Record<string, unknown>) => {
    // Start with static values (e.g., scope: "external")
    const execution: Record<string, string | number> = { ...staticExecution };

    // Build execution context from tool args using the mapping
    for (const [argName, mapping] of Object.entries(executionMapping)) {
      const value = args[argName];
      if (value !== undefined && value !== null) {
        if (typeof mapping === 'string') {
          // Direct mapping: argName → contextField
          execution[mapping] = typeof value === 'number' ? value : String(value);
        } else if (Array.isArray(mapping)) {
          // Array mapping: one arg → multiple execution fields
          for (const m of mapping) applyMapping(m, value, execution);
        } else if ('divisor' in mapping) {
          // Divisor mapping: convert units (e.g., cents ÷ 100 → EUR)
          const numValue = typeof value === 'number' ? value : Number(value);
          execution[mapping.field] = numValue / mapping.divisor;
        } else if ('transform' in mapping) {
          // Transform mapping: array-aware transforms
          applyMapping(mapping, value, execution);
        }
      }
    }

    // Find all active authorizations matching this profile
    const auths = state.getEnrichedAuthorizations();
    const matchingAuths = auths.filter(
      a => a.complete && profileMatches(a.profileId, profile!),
    );

    if (matchingAuths.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No active authorization matching profile "${profile}". ` +
            `A decision owner must grant authority via the Authority UI before this tool can be used.`,
        }],
        isError: true,
      };
    }

    // Try each matching authorization until one passes verification
    const errors: string[] = [];
    for (const auth of matchingAuths) {
      // Pass v0.4 enriched fields (bounds/context from gate store) to gatekeeper
      const { result } = await state.gatekeeper.verifyExecution(auth.path, execution, {
        bounds: auth.bounds,
        context: auth.context,
      });

      if (!result.approved) {
      }
      if (result.approved) {
        // Check for deferred commitment domains — submit proposal instead of executing
        if (auth.deferredCommitmentDomains.length > 0) {
          try {
            const { proposal } = await state.spClient.submitProposal({
              frameHash: auth.boundsHash ?? auth.frameHash,
              profileId: auth.profileId,
              path: auth.path,
              pendingDomains: auth.deferredCommitmentDomains,
              tool: tool.namespacedName,
              toolArgs: args,
              executionContext: { ...execution },
            });
            return {
              content: [{
                type: 'text',
                text: `Awaiting commitment from domain${auth.deferredCommitmentDomains.length > 1 ? 's' : ''} ` +
                  `"${auth.deferredCommitmentDomains.join('", "')}" for tool ${tool.originalName}.\n` +
                  `Proposal ID: ${proposal.id}. Check status with check-pending-commitments(proposal_id: "${proposal.id}").`,
              }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text', text: `Failed to submit proposal: ${err instanceof Error ? err.message : String(err)}` }],
              isError: true,
            };
          }
        }

        // Request receipt from SP (pre-flight — fail closed)
        try {
          await state.spClient.postReceipt({
            attestationHash: auth.boundsHash ?? auth.frameHash,  // prefer boundsHash (v0.4)
            profileId: auth.profileId,
            path: auth.path,
            action: String(execution.action_type ?? tool.originalName),
            executionContext: { ...execution },
            amount: typeof execution.amount === 'number' ? execution.amount : undefined,
          });
        } catch (err) {
          if (err instanceof SPReceiptError && err.statusCode === 403) {
            // SP rejected — limit exceeded or revoked
            return {
              content: [{ type: 'text', text: `Blocked by SP: ${err.message}` }],
              isError: true,
            };
          }
          // SP unreachable — fail closed
          return {
            content: [{ type: 'text', text: `SP unavailable — tool call blocked. ${err instanceof Error ? err.message : ''}` }],
            isError: true,
          };
        }

        // Record execution in log for cumulative tracking
        state.executionLog.record({
          profileId: auth.profileId,
          path: auth.path,
          execution: { ...execution },
          timestamp: Math.floor(Date.now() / 1000),
        });

        // Authorization verified — proxy the call
        return integrationManager.callTool(tool.integrationId, tool.originalName, args);
      }

      // Collect rejection reasons
      const reasons = result.errors.map(e => {
        if (e.code === 'BOUND_EXCEEDED') {
          return `${auth.path}: ${e.field}: ${e.message}`;
        }
        return `${auth.path}: ${e.message}`;
      });
      errors.push(...reasons);
    }

    // All authorizations failed
    return {
      content: [{
        type: 'text',
        text: `Tool call rejected by Gatekeeper. Tried ${matchingAuths.length} authorization(s):\n` +
          errors.map(e => `  - ${e}`).join('\n'),
      }],
      isError: true,
    };
  };
}

/**
 * Build a description for a proxied tool that includes a short gating tag.
 *
 * Tags:
 * - [HAP: charge — read] — read-only, requires authorization
 * - [HAP: charge — charge, amount checked] — gated with specific checks
 * - [HAP: charge — no active authorization] — gated but no auth available
 */
export function buildProxiedToolDescription(
  tool: DiscoveredTool,
  state: SharedState,
): string {
  if (!tool.gating || !tool.gating.profile) {
    return `[HAP: no gating config] ${tool.description}`;
  }

  const profile = tool.gating.profile;
  const auths = state.getEnrichedAuthorizations();
  const hasAuth = auths.some(
    a => a.complete && profileMatches(a.profileId, profile),
  );

  if (!hasAuth) {
    return `[HAP: ${profile} — no active authorization] ${tool.description}`;
  }

  if (tool.gating.category === 'read') {
    return `[HAP: ${profile} — read] ${tool.description}`;
  }

  // Build a short tag describing what's checked
  const parts: string[] = [];
  if (tool.gating.staticExecution?.action_type) {
    parts.push(String(tool.gating.staticExecution.action_type));
  }
  const mappedFields = Object.values(tool.gating.executionMapping ?? {}).flatMap(m =>
    typeof m === 'string' ? [m] : Array.isArray(m) ? m.map(e => e.field) : [m.field],
  );
  if (mappedFields.length > 0) {
    parts.push(`${mappedFields.join(', ')} checked`);
  }

  const tag = parts.length > 0 ? parts.join(', ') : 'gated';
  return `[HAP: ${profile} — ${tag}] ${tool.description}`;
}
