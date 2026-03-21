/**
 * MCP Gatekeeper Wrapper — integrates hap-core Gatekeeper with attestation cache and execution log.
 */

import { verify, type GatekeeperRequest, type GatekeeperResult, type ExecutionLogQuery } from '@hap/core';
import { AttestationCache, type CachedAuthorization } from './attestation-cache';

/** Minimal subset of CachedAuthorization / EnrichedAuthorization needed for context override. */
interface AuthContextOverride {
  bounds?: Record<string, string | number>;
  context?: Record<string, string | number>;
}

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
   * @param override - Optional v0.4 fields (bounds, context) from the enriched auth / gate store,
   *                   used when the context is not present on the SP-cached auth itself.
   * @returns Gatekeeper result + the authorization if found
   */
  async verifyExecution(
    authorizationPath: string,
    execution: Record<string, string | number>,
    override?: AuthContextOverride,
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

    // Build Gatekeeper request.
    // v0.4: prefer bounds over frame; use context from override (gate store) or cached auth.
    const resolvedBounds = override?.bounds ?? auth.bounds ?? auth.frame;
    const resolvedContext = override?.context ?? auth.context;

    // Ensure profile and path are present — the core gatekeeper needs them to resolve
    // the profile, but v0.4 bounds objects from the SP may not include them.
    const frame = { ...resolvedBounds, profile: auth.profileId, path: auth.path };

    const request: GatekeeperRequest = {
      frame,
      attestations: auth.attestations.map(a => a.blob),
      execution,
      ...(resolvedContext ? { context: resolvedContext } : {}),
    };

    const result = await verify(request, publicKeyHex, undefined, this.executionLog);
    return { result, authorization: auth };
  }
}
