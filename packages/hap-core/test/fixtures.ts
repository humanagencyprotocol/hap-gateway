/**
 * Test fixtures — profile data for unit tests.
 *
 * These mirror the profiles in hap-profiles/ but are kept as test fixtures
 * so tests don't depend on git fetching.
 */

import type { AgentProfile } from '../src/types';

export const PAYMENT_GATE_PROFILE: AgentProfile = {
  id: 'payment-gate@0.3',
  version: '0.3',
  description: 'Payment authorization with bounded amounts',

  frameSchema: {
    keyOrder: ['profile', 'path', 'amount_max', 'currency', 'target_env'],
    fields: {
      profile: { type: 'string', required: true },
      path: { type: 'string', required: true },
      amount_max: {
        type: 'number',
        required: true,
        description: 'Maximum transaction amount',
        constraint: { type: 'number', enforceable: ['max'] },
      },
      currency: {
        type: 'string',
        required: true,
        description: 'Permitted currency',
        constraint: { type: 'string', enforceable: ['enum'] },
      },
      target_env: {
        type: 'string',
        required: true,
        description: 'Target environment',
        constraint: { type: 'string', enforceable: ['enum'] },
      },
    },
  },

  executionContextSchema: {
    fields: {
      amount: {
        source: 'declared',
        description: 'Maximum transaction amount',
        required: true,
        constraint: { type: 'number', enforceable: ['max'] },
      },
      currency: {
        source: 'declared',
        description: 'Permitted currency',
        required: true,
        constraint: { type: 'string', enforceable: ['enum'] },
      },
      target_env: {
        source: 'declared',
        description: 'Target environment',
        required: true,
        constraint: { type: 'string', enforceable: ['enum'] },
      },
    },
  },

  executionPaths: {
    'payment-routine': {
      description: 'Routine payments within authorized bounds',
      requiredDomains: ['finance'],
    },
    'payment-large': {
      description: 'Large payments requiring dual authorization',
      requiredDomains: ['finance', 'compliance'],
      ttl: { default: 14400, max: 86400 },
    },
  },

  requiredGates: ['frame', 'problem', 'objective', 'tradeoff', 'commitment', 'decision_owner'],

  gateQuestions: {
    problem: { question: 'What problem does this agent authority address?', required: true },
    objective: { question: 'What outcome should this authority enable?', required: true },
    tradeoffs: { question: 'What risks do you accept with this authority?', required: true },
  },

  ttl: { default: 3600, max: 86400 },
  retention_minimum: 7776000,
};

export const COMMS_SEND_PROFILE: AgentProfile = {
  id: 'comms-send@0.3',
  version: '0.3',
  description: 'Email sending with bounded recipients and scope',

  frameSchema: {
    keyOrder: ['profile', 'path', 'max_recipients', 'channel'],
    fields: {
      profile: { type: 'string', required: true },
      path: { type: 'string', required: true },
      max_recipients: {
        type: 'number',
        required: true,
        description: 'Maximum number of recipients per message',
        constraint: { type: 'number', enforceable: ['max'] },
      },
      channel: {
        type: 'string',
        required: true,
        description: 'Permitted communication channel',
        constraint: { type: 'string', enforceable: ['enum'] },
      },
    },
  },

  executionContextSchema: {
    fields: {
      max_recipients: {
        source: 'declared',
        description: 'Maximum number of recipients per message',
        required: true,
        constraint: { type: 'number', enforceable: ['max'] },
      },
      channel: {
        source: 'declared',
        description: 'Permitted communication channel',
        required: true,
        constraint: { type: 'string', enforceable: ['enum'] },
      },
    },
  },

  executionPaths: {
    'send-internal': {
      description: 'Internal communications only',
      requiredDomains: ['communications'],
    },
    'send-external': {
      description: 'External communications (requires security review)',
      requiredDomains: ['communications', 'security'],
      ttl: { default: 14400, max: 86400 },
    },
  },

  requiredGates: ['frame', 'problem', 'objective', 'tradeoff', 'commitment', 'decision_owner'],

  gateQuestions: {
    problem: { question: 'What problem does this communication authority address?', required: true },
    objective: { question: 'What outcome should this authority enable?', required: true },
    tradeoffs: { question: 'What risks do you accept with this authority?', required: true },
  },

  ttl: { default: 3600, max: 86400 },
  retention_minimum: 7776000,
};
