/**
 * Shared State — singleton that lives at the HTTP server level, reused across MCP connections.
 *
 * Holds one SPClient, one AttestationCache, and one GateStore.
 */

import { SPClient } from './sp-client';
import { AttestationCache, type CachedAuthorization } from './attestation-cache';
import { GateStore, type GateContent, type GateEntry } from './gate-store';
import { ExecutionLog } from './execution-log';
import { MCPGatekeeper } from './gatekeeper';

export interface EnrichedAuthorization extends CachedAuthorization {
  gateContent: GateContent | null;
}

export class SharedState {
  readonly spClient: SPClient;
  readonly cache: AttestationCache;
  readonly gateStore: GateStore;
  readonly executionLog: ExecutionLog;
  readonly gatekeeper: MCPGatekeeper;

  constructor(spUrl: string, gateStorePath?: string) {
    this.spClient = new SPClient(spUrl);
    this.cache = new AttestationCache(this.spClient);
    this.gateStore = new GateStore(gateStorePath);
    this.executionLog = new ExecutionLog(gateStorePath);
    this.gatekeeper = new MCPGatekeeper(this.cache, this.executionLog);
  }

  setGateContent(path: string, frameHash: string, profileId: string, content: GateContent): void {
    this.gateStore.set(path, {
      frameHash,
      path,
      profileId,
      gateContent: content,
      storedAt: new Date().toISOString(),
    });
  }

  getGateContent(path: string): GateEntry | null {
    return this.gateStore.get(path);
  }

  /**
   * Join active+complete cached authorizations with gate content from the GateStore.
   */
  getEnrichedAuthorizations(): EnrichedAuthorization[] {
    const authorizations = this.cache.getAllAuthorizations();

    return authorizations.map(auth => {
      const gateEntry = this.gateStore.get(auth.path);
      return {
        ...auth,
        gateContent: gateEntry?.gateContent ?? null,
      };
    });
  }
}
