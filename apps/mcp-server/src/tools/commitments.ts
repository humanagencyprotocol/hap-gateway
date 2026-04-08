/**
 * check-pending-commitments tool — lets agents check on deferred commitment proposals.
 *
 * With proposal_id: returns status of a specific proposal. If the proposal is
 *   committed (fully approved), the original tool call is executed immediately
 *   and the proposal is marked as executed.
 * Without: returns all pending proposals across all domains.
 */

import type { SharedState } from '../lib/shared-state';
import type { IntegrationManager } from '../lib/integration-manager';
import type { SPProposal } from '../lib/sp-client';

/** Execute a committed proposal's stored tool call and mark it executed. */
async function executeCommitted(
  proposal: SPProposal,
  state: SharedState,
  integrationManager: IntegrationManager | undefined,
): Promise<{ text: string; isError?: boolean }> {
  if (!integrationManager) {
    return { text: `Proposal ${proposal.id} committed but integration manager unavailable for execution.`, isError: true };
  }

  // Parse namespaced tool name: "<integrationId>__<toolName>"
  const sep = proposal.tool.indexOf('__');
  if (sep < 0) {
    return { text: `Proposal ${proposal.id} has invalid tool name: ${proposal.tool}`, isError: true };
  }
  const integrationId = proposal.tool.slice(0, sep);
  const toolName = proposal.tool.slice(sep + 2);

  try {
    const result = await integrationManager.callTool(integrationId, toolName, proposal.toolArgs);
    const resultText = (result.content as Array<{ text: string }>)?.[0]?.text ?? JSON.stringify(result);

    // Mark the proposal as executed on the SP
    await state.spClient.updateProposalStatus(proposal.id, 'executed', result);

    return { text: `Proposal ${proposal.id} committed and executed.\nResult: ${resultText}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Proposal ${proposal.id} committed but execution failed: ${msg}`, isError: true };
  }
}

export function checkPendingCommitmentsHandler(
  state: SharedState,
  integrationManager?: IntegrationManager,
) {
  return async (args: { proposal_id?: string }) => {
    try {
      if (args.proposal_id) {
        const committed = await state.spClient.getCommittedProposals();
        const match = committed.find(p => p.id === args.proposal_id);
        if (match) {
          if (match.status === 'executed' && match.executionResult) {
            return {
              content: [{
                type: 'text' as const,
                text: `Proposal ${match.id} committed and executed.\nResult: ${JSON.stringify(match.executionResult, null, 2)}`,
              }],
            };
          }

          // Status is 'committed' — execute now
          if (match.status === 'committed') {
            const { text, isError } = await executeCommitted(match, state, integrationManager);
            return {
              content: [{ type: 'text' as const, text }],
              ...(isError ? { isError: true } : {}),
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: `Proposal ${match.id}: status=${match.status}, ` +
                `committed by: [${Object.keys(match.committedBy).join(', ')}], ` +
                `remaining: [${match.pendingDomains.filter(d => !(d in match.committedBy)).join(', ')}]`,
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Proposal ${args.proposal_id} is still pending or not found. Domain owners have not yet committed.`,
          }],
        };
      }

      // List all committed proposals (ready for execution or already executed)
      const committed = await state.spClient.getCommittedProposals();
      if (committed.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No pending commitments. All proposals are either still awaiting domain owner review, expired, or already executed.',
          }],
        };
      }

      const lines = committed.map(p =>
        `${p.id}: tool=${p.tool}, status=${p.status}, committed=[${Object.keys(p.committedBy).join(',')}]`
      );

      return {
        content: [{
          type: 'text' as const,
          text: `Proposals with commitments:\n${lines.join('\n')}`,
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to check commitments: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  };
}
