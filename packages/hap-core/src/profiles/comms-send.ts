/**
 * Communications Send Profile v0.3
 *
 * Email sending with bounded recipients and scope.
 * Constraint types: max_recipients (number, max), channel (string, enum).
 */

import type { AgentProfile } from '../types';

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
