/**
 * Thread aggregator — merges pending proposals and execution receipts into
 * a single reverse-chronological list of ThreadItems for the Action Thread
 * (gateway homepage).
 *
 * This module is intentionally pure: no network, no SP client, no React.
 * `SpClient.getThread()` composes this with the existing proposal + receipt
 * fetch methods. Unit tests exercise the pure function directly.
 */

import type { Proposal, ExecutionReceipt } from './sp-client';

export type CommitmentMode = 'review' | 'automatic';

export interface ProposalThreadItem {
  kind: 'proposal';
  id: string;
  sortTimestamp: number;
  commitmentMode: CommitmentMode;
  profileId: string;
  proposal: Proposal;
}

export interface ReceiptThreadItem {
  kind: 'receipt';
  id: string;
  sortTimestamp: number;
  commitmentMode: CommitmentMode;
  profileId: string;
  receipt: ExecutionReceipt;
}

export type ThreadItem = ProposalThreadItem | ReceiptThreadItem;

export interface ThreadFilter {
  status?: 'pending' | 'all';
  profile?: string;
  includeAutonomous?: boolean;
  limit?: number;
}

/**
 * A receipt was produced via a committed proposal when it carries a
 * `proposalId`. Bare receipts (no proposalId) came from automatic-mode
 * tool calls that never passed through human review.
 */
function receiptCommitmentMode(receipt: ExecutionReceipt): CommitmentMode {
  return (receipt as ExecutionReceipt & { proposalId?: string }).proposalId
    ? 'review'
    : 'automatic';
}

export function aggregateThread(
  proposals: Proposal[],
  receipts: ExecutionReceipt[],
  filter: ThreadFilter = {},
): ThreadItem[] {
  const status = filter.status ?? 'pending';
  const includeAutonomous = filter.includeAutonomous ?? false;

  const items: ThreadItem[] = [];

  for (const p of proposals) {
    if (status === 'pending' && p.status !== 'pending') continue;
    if (filter.profile && p.profileId !== filter.profile) continue;
    items.push({
      kind: 'proposal',
      id: p.id,
      sortTimestamp: p.createdAt,
      commitmentMode: 'review',
      profileId: p.profileId,
      proposal: p,
    });
  }

  if (status === 'all') {
    for (const r of receipts) {
      const mode = receiptCommitmentMode(r);
      if (!includeAutonomous && mode === 'automatic') continue;
      if (filter.profile && r.profileId !== filter.profile) continue;
      items.push({
        kind: 'receipt',
        id: r.id,
        sortTimestamp: r.timestamp,
        commitmentMode: mode,
        profileId: r.profileId,
        receipt: r,
      });
    }
  }

  items.sort((a, b) => b.sortTimestamp - a.sortTimestamp);

  if (typeof filter.limit === 'number' && filter.limit > 0) {
    return items.slice(0, filter.limit);
  }
  return items;
}
