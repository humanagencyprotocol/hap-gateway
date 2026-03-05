/**
 * HAP MCP Server — Tool provider for the agent with embedded Gatekeeper.
 *
 * Registers tools: list-authorizations, make-payment, send-email, check-pending-attestations.
 * Builds a mandate brief from enriched authorizations and sets it as MCP instructions.
 * Tool descriptions are updated dynamically to reflect current authorization bounds.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SharedState, type EnrichedAuthorization } from './lib/shared-state';
import { buildMandateBrief } from './lib/mandate-brief';
import { listAuthorizationsHandler } from './tools/authorizations';
import { makePaymentHandler } from './tools/payment';
import { sendEmailHandler } from './tools/email';
import { checkPendingHandler } from './tools/pending';

// ─── Dynamic tool descriptions ──────────────────────────────────────────────

function describeAuthorization(auth: EnrichedAuthorization): string {
  const now = Math.floor(Date.now() / 1000);
  const earliestExpiry = Math.min(...auth.attestations.map(a => a.expiresAt));
  const remainingMin = Math.max(0, Math.round((earliestExpiry - now) / 60));

  const bounds = Object.entries(auth.frame)
    .filter(([key]) => key !== 'profile' && key !== 'path')
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  let desc = `- ${auth.path}: ${bounds} (${remainingMin} min remaining)`;
  if (auth.gateContent) {
    desc += `\n    Purpose: ${auth.gateContent.objective}`;
  }
  return desc;
}

function buildPaymentDescription(auths: EnrichedAuthorization[]): string {
  const paymentAuths = auths.filter(a => a.complete && a.profileId.startsWith('payment-gate'));
  const pendingAuths = auths.filter(a => !a.complete && a.profileId.startsWith('payment-gate'));

  if (paymentAuths.length === 0) {
    return 'Make a payment to a recipient. No active payment authorizations.';
  }

  const lines = ['Make a payment to a recipient. Available authorizations:'];
  for (const auth of paymentAuths) {
    lines.push('  ' + describeAuthorization(auth));
  }
  for (const auth of pendingAuths) {
    const missing = auth.requiredDomains.filter(d => !auth.attestedDomains.includes(d));
    lines.push(`  - ${auth.path}: pending (needs ${missing.join(', ')})`);
  }
  lines.push('Pass the authorization name as the "authorization" parameter.');
  return lines.join('\n');
}

function buildEmailDescription(auths: EnrichedAuthorization[]): string {
  const commsAuths = auths.filter(a => a.complete && a.profileId.startsWith('comms-send'));
  const pendingAuths = auths.filter(a => !a.complete && a.profileId.startsWith('comms-send'));

  if (commsAuths.length === 0) {
    return 'Send an email. No active communications authorizations.';
  }

  const lines = ['Send an email. Available authorizations:'];
  for (const auth of commsAuths) {
    lines.push('  ' + describeAuthorization(auth));
  }
  for (const auth of pendingAuths) {
    const missing = auth.requiredDomains.filter(d => !auth.attestedDomains.includes(d));
    lines.push(`  - ${auth.path}: pending (needs ${missing.join(', ')})`);
  }
  lines.push('Pass the authorization name as the "authorization" parameter.');
  return lines.join('\n');
}

// ─── Server factory ─────────────────────────────────────────────────────────

export function createMcpServer(state: SharedState) {
  const { gatekeeper, cache } = state;

  // Build mandate brief from current enriched authorizations
  const enriched = state.getEnrichedAuthorizations();
  const instructions = buildMandateBrief(enriched);

  const server = new McpServer(
    { name: 'hap-agent', version: '0.1.0' },
    { instructions },
  );

  // ─── list-authorizations ─────────────────────────────────────────────────

  server.registerTool(
    'list-authorizations',
    {
      description: 'List what you are currently authorized to do. Shows active and pending attestations with bounds, intent, and remaining TTL. Call this to refresh your understanding of available authorities.',
    },
    listAuthorizationsHandler(state)
  );

  // ─── make-payment ────────────────────────────────────────────────────────

  const makePayment: RegisteredTool = server.registerTool(
    'make-payment',
    {
      description: 'Make a payment to a recipient. Requires an active payment authorization.',
      inputSchema: {
        authorization: z.string().describe('Which authorization to use (e.g., "payment-routine")'),
        amount: z.number().describe('Payment amount'),
        currency: z.string().describe('Currency code (e.g., "EUR")'),
        recipient: z.string().describe('Payment recipient identifier'),
        memo: z.string().optional().describe('Optional payment memo'),
      },
    },
    makePaymentHandler(gatekeeper)
  );

  // ─── send-email ──────────────────────────────────────────────────────────

  const sendEmail: RegisteredTool = server.registerTool(
    'send-email',
    {
      description: 'Send an email. Requires an active communications authorization.',
      inputSchema: {
        authorization: z.string().describe('Which authorization to use (e.g., "send-internal")'),
        to: z.string().describe('Recipient email address(es), comma-separated'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body'),
      },
    },
    sendEmailHandler(gatekeeper)
  );

  // ─── check-pending-attestations ──────────────────────────────────────────

  server.registerTool(
    'check-pending-attestations',
    {
      description: 'Check if any attestations are waiting for your owner\'s approval.',
      inputSchema: {
        domain: z.string().describe('The owner\'s domain (e.g., "compliance")'),
      },
    },
    checkPendingHandler(cache)
  );

  // ─── Dynamic tool visibility + descriptions ──────────────────────────────

  function refreshTools() {
    const auths = state.getEnrichedAuthorizations();
    const hasPayment = auths.some(a => a.complete && a.profileId.startsWith('payment-gate'));
    const hasComms = auths.some(a => a.complete && a.profileId.startsWith('comms-send'));

    // Update descriptions with current authorization context
    makePayment.update({ description: buildPaymentDescription(auths) });
    sendEmail.update({ description: buildEmailDescription(auths) });

    // Enable/disable based on active authorizations
    if (hasPayment) makePayment.enable(); else makePayment.disable();
    if (hasComms) sendEmail.enable(); else sendEmail.disable();

    server.sendToolListChanged();
  }

  // Set initial tool visibility + descriptions
  refreshTools();

  return { server, gatekeeper, refreshTools };
}
