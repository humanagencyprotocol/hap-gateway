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
  // v0.4 fields merged from gate store (may override cache values)
  context?: Record<string, string | number>;
  contextHash?: string;
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

  setGateContent(
    path: string,
    frameHash: string,
    profileId: string,
    content: GateContent,
    opts?: {
      boundsHash?: string;
      contextHash?: string;
      context?: Record<string, string | number>;
    },
  ): void {
    this.gateStore.set(path, {
      frameHash,
      boundsHash: opts?.boundsHash,
      contextHash: opts?.contextHash,
      path,
      profileId,
      gateContent: content,
      context: opts?.context,
      storedAt: new Date().toISOString(),
    });
  }

  getGateContent(path: string): GateEntry | null {
    return this.gateStore.get(path);
  }

  /**
   * Join active+complete cached authorizations with gate content from the GateStore.
   * v0.4: also merges context/contextHash from gate store if not present on cached auth.
   */
  getEnrichedAuthorizations(): EnrichedAuthorization[] {
    const authorizations = this.cache.getAllAuthorizations();

    return authorizations
      .map(auth => {
        // Try multiple keys to find gate content:
        // 1. auth.path (may be profileId in v0.4, or old path name in v0.3)
        // 2. auth.profileId (v0.4: path = profileId)
        // 3. auth.boundsHash / auth.frameHash (gate content stored by hash)
        const gateEntry =
          this.gateStore.get(auth.path) ??
          this.gateStore.get(auth.profileId) ??
          (auth.boundsHash ? this.gateStore.get(auth.boundsHash) : null) ??
          (auth.frameHash ? this.gateStore.get(auth.frameHash) : null) ??
          // Search by profileId match across all gate entries
          this.gateStore.getAll().find(g => g.profileId === auth.profileId) ??
          null;

        return {
          ...auth,
          gateContent: gateEntry?.gateContent ?? null,
          context: auth.context ?? gateEntry?.context,
          contextHash: auth.contextHash ?? gateEntry?.contextHash,
        };
      })
      .filter(auth => auth.gateContent !== null);
  }
}
