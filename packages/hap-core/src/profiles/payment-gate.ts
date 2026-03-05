/**
 * Payment Gate Profile v0.3
 *
 * Payment authorization with bounded amounts.
 * Constraint types: amount_max (number, max), currency (string, enum), target_env (string, enum).
 */

import type { AgentProfile } from '../types';

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
