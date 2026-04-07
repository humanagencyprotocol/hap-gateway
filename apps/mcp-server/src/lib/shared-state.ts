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

    if (authorizations.length > 0) {
      const allGates = this.gateStore.getAll();
      console.error(`[EnrichDebug] ${authorizations.length} auth(s), ${allGates.length} gate(s)`);
      for (const a of authorizations) {
        console.error(`[EnrichDebug] Auth: path="${a.path}" profileId="${a.profileId}" boundsHash="${a.boundsHash}" complete=${a.complete}`);
      }
      for (const g of allGates) {
        console.error(`[EnrichDebug] Gate: path="${g.path}" profileId="${g.profileId}" boundsHash="${g.boundsHash}"`);
      }
    }

    return authorizations
      .map(auth => {
        const gateEntry =
          this.gateStore.get(auth.path) ??
          this.gateStore.get(auth.profileId) ??
          (auth.boundsHash ? this.gateStore.get(auth.boundsHash) : null) ??
          (auth.frameHash ? this.gateStore.get(auth.frameHash) : null) ??
          this.gateStore.getAll().find(g => g.profileId === auth.profileId) ??
          null;

        if (!gateEntry) {
          console.error(`[EnrichDebug] NO MATCH for auth path="${auth.path}" profileId="${auth.profileId}"`);
        }

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
