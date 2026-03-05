/**
 * send-email tool — Phase 2 stub
 */

import type { MCPGatekeeper } from '../lib/gatekeeper';
import { sendEmail } from '../lib/connectors/email';

export interface EmailArgs {
  authorization: string;
  to: string;
  subject: string;
  body: string;
}

export function sendEmailHandler(gatekeeper: MCPGatekeeper) {
  return async (args: EmailArgs) => {
    const { authorization, to, subject, body } = args;

    const recipients = to.split(',').map(s => s.trim());

    // Verify through Gatekeeper
    const { result } = await gatekeeper.verifyExecution(
      authorization,
      { max_recipients: recipients.length, channel: 'email' }
    );

    if (!result.approved) {
      const errorMessages = result.errors.map(e => e.message);
      return {
        content: [{
          type: 'text' as const,
          text: `Email rejected: ${errorMessages.join('; ')}`,
        }],
        isError: true,
      };
    }

    // Gatekeeper approved — execute via connector
    const emailResult = sendEmail({ to: recipients, subject, body });

    return {
      content: [{
        type: 'text' as const,
        text: `Email sent: ${emailResult.messageId}\n` +
          `Recipients: ${emailResult.recipients.join(', ')}\n` +
          `Subject: ${subject}\n` +
          `Timestamp: ${emailResult.timestamp}`,
      }],
    };
  };
}
