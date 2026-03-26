/**
 * check-pending-commitments tool — lets agents check on deferred commitment proposals.
 *
 * With proposal_id: returns status of a specific proposal.
 * Without: returns all pending proposals across all domains.
 */

import type { SharedState } from '../lib/shared-state';

export function checkPendingCommitmentsHandler(state: SharedState) {
  return async (args: { proposal_id?: string }) => {
    try {
      if (args.proposal_id) {
        // Check specific proposal — we don't have a direct lookup endpoint,
        // so scan committed proposals. For pending, the agent just waits.
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
