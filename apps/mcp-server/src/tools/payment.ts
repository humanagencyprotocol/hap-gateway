/**
 * make-payment tool — execute a payment through the Gatekeeper.
 */

import type { MCPGatekeeper } from '../lib/gatekeeper';
import { executePayment } from '../lib/connectors/payment';

export interface PaymentArgs {
  authorization: string;
  amount: number;
  currency: string;
  recipient: string;
  memo?: string;
}

export function makePaymentHandler(gatekeeper: MCPGatekeeper) {
  return async (args: PaymentArgs) => {
    const { authorization, amount, currency, recipient, memo } = args;

    // Verify through Gatekeeper
    const { result, authorization: auth } = await gatekeeper.verifyExecution(
      authorization,
      { amount, currency, target_env: 'production' }
    );

    if (!result.approved) {
      const errorMessages = result.errors.map(e => {
        if (e.code === 'BOUND_EXCEEDED') {
          return `${e.field}: ${e.message}`;
        }
        return e.message;
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Payment rejected: ${errorMessages.join('; ')}`,
        }],
        isError: true,
      };
    }

    // Gatekeeper approved — execute via connector
    const txResult = executePayment({ amount, currency, recipient, memo });

    return {
      content: [{
        type: 'text' as const,
        text: `Payment confirmed: ${txResult.transactionId}\n` +
          `Amount: ${txResult.amount} ${txResult.currency}\n` +
          `Recipient: ${txResult.recipient}\n` +
          `Timestamp: ${txResult.timestamp}`,
      }],
    };
  };
}
