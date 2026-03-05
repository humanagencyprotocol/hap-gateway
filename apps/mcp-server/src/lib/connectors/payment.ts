/**
 * Mock Payment Connector
 *
 * Simulates a payment service. In production, this would integrate
 * with a real payment API using credentials from the Vault.
 */

export interface PaymentRequest {
  amount: number;
  currency: string;
  recipient: string;
  memo?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  amount: number;
  currency: string;
  recipient: string;
  timestamp: string;
}

let transactionCounter = 0;

export function executePayment(request: PaymentRequest): PaymentResult {
  transactionCounter++;

  const result: PaymentResult = {
    success: true,
    transactionId: `TXN-${String(transactionCounter).padStart(6, '0')}`,
    amount: request.amount,
    currency: request.currency,
    recipient: request.recipient,
    timestamp: new Date().toISOString(),
  };

  console.error(
    `[Payment] ${result.transactionId}: ${request.amount} ${request.currency} → ${request.recipient}` +
    (request.memo ? ` (${request.memo})` : '')
  );

  return result;
}
