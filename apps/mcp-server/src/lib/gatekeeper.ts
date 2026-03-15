/**
 * MCP Gatekeeper Wrapper — integrates hap-core Gatekeeper with attestation cache and execution log.
 */

import { verify, type GatekeeperRequest, type GatekeeperResult, type ExecutionLogQuery } from '@hap/core';
import { AttestationCache, type CachedAuthorization } from './attestation-cache';

export class MCPGatekeeper {
  constructor(
    private cache: AttestationCache,
    private executionLog?: ExecutionLogQuery,
  ) {}

  /**
   * Verify an execution request against a cached authorization.
   *
   * @param authorizationPath - The execution path (e.g., "payment-routine")
   * @param execution - The agent's execution values
   * @returns Gatekeeper result + the authorization if found
   */
  async verifyExecution(
    authorizationPath: string,
    execution: Record<string, string | number>
  ): Promise<{
    result: GatekeeperResult;
    authorization: CachedAuthorization | null;
  }> {
    // Look up authorization in cache
    const auth = this.cache.getAuthorization(authorizationPath);

    if (!auth) {
      return {
        result: {
          approved: false,
          errors: [{
            code: 'DOMAIN_NOT_COVERED',
            message: `No active authorization for "${authorizationPath}". A decision owner must grant authority via the Authority UI.`,
          }],
        },
        authorization: null,
      };
    }

    if (!auth.complete) {
      const missing = auth.requiredDomains.filter(d => !auth.attestedDomains.includes(d));
      return {
        result: {
          approved: false,
          errors: [{
            code: 'DOMAIN_NOT_COVERED',
            message: `Authorization "${authorizationPath}" is pending. Missing domains: ${missing.join(', ')}`,
          }],
        },
        authorization: auth,
      };
    }

    // Get SP public key
    const publicKeyHex = await this.cache.getPublicKey();

    // Build Gatekeeper request
    const request: GatekeeperRequest = {
      frame: auth.frame,
      attestations: auth.attestations.map(a => a.blob),
      execution,
    };

    const result = await verify(request, publicKeyHex, undefined, this.executionLog);
    return { result, authorization: auth };
  }
}
