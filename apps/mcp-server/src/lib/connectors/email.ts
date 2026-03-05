/**
 * Mock Email Connector — Phase 2 stub
 */

export interface EmailRequest {
  to: string[];
  subject: string;
  body: string;
}

export interface EmailResult {
  success: boolean;
  messageId: string;
  recipients: string[];
  timestamp: string;
}

let messageCounter = 0;

export function sendEmail(request: EmailRequest): EmailResult {
  messageCounter++;

  const result: EmailResult = {
    success: true,
    messageId: `MSG-${String(messageCounter).padStart(6, '0')}`,
    recipients: request.to,
    timestamp: new Date().toISOString(),
  };

  console.error(
    `[Email] ${result.messageId}: "${request.subject}" → ${request.to.join(', ')}`
  );

  return result;
}
