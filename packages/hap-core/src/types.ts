/**
 * HAP Core Types — Agent Demo
 *
 * Types for agent-oriented profiles with bounded execution.
 */

// ─── Attestation Types ───────────────────────────────────────────────────────

export interface AttestationHeader {
  typ: 'HAP-attestation';
  alg: 'EdDSA';
  kid?: string;
}

export interface ResolvedDomain {
  domain: string;
  did: string;
}

export interface AttestationPayload {
  attestation_id: string;
  version: '0.3';
  profile_id: string;
  frame_hash: string;
  execution_context_hash: string;
  resolved_domains: ResolvedDomain[];
  gate_content_hashes: Record<string, string>;
  issued_at: number;
  expires_at: number;
}

export interface Attestation {
  header: AttestationHeader;
  payload: AttestationPayload;
  signature: string;
}

// ─── Profile Types ───────────────────────────────────────────────────────────

/**
 * Field constraint type — what kind of bound a field supports.
 * - max: numeric upper bound (actual <= bound)
 * - enum: value must be in the allowed set
 */
export interface FieldConstraint {
  type: 'number' | 'string';
  enforceable: Array<'max' | 'enum'>;
}

/**
 * Frame field definition within a profile.
 */
export interface ProfileFrameField {
  type: 'string' | 'number';
  required: boolean;
  description?: string;
  constraint?: FieldConstraint;
}

/**
 * Execution context field definition (for documentation/validation).
 */
export interface ExecutionContextFieldDef {
  source: 'declared';
  description: string;
  required: boolean;
  constraint?: FieldConstraint;
}

/**
 * Gate question definition.
 */
export interface GateQuestion {
  question: string;
  required: boolean;
}

/**
 * Execution path definition within a profile.
 */
export interface ExecutionPath {
  description: string;
  requiredDomains: string[];
  ttl?: { default: number; max: number };
}

/**
 * Agent Profile — defines constraint types, execution paths, gate questions,
 * and the frame schema for bounded execution.
 */
export interface AgentProfile {
  id: string;
  version: string;
  description: string;

  frameSchema: {
    keyOrder: string[];
    fields: Record<string, ProfileFrameField>;
  };

  executionContextSchema: {
    fields: Record<string, ExecutionContextFieldDef>;
  };

  executionPaths: Record<string, ExecutionPath>;

  requiredGates: string[];

  gateQuestions: {
    problem: GateQuestion;
    objective: GateQuestion;
    tradeoffs: GateQuestion;
  };

  ttl: { default: number; max: number };
  retention_minimum: number;
}

// ─── Frame Types ─────────────────────────────────────────────────────────────

/**
 * Agent frame parameters — mixed types (strings and numbers).
 * Keys and values come from the profile's frameSchema.
 */
export type AgentFrameParams = Record<string, string | number>;

// ─── Gatekeeper Types ────────────────────────────────────────────────────────

/**
 * Request to the Gatekeeper for bounded execution verification.
 */
export interface GatekeeperRequest {
  /** The authorization frame (what was attested to) */
  frame: AgentFrameParams;
  /** Attestation blobs (base64url) for each domain */
  attestations: string[];
  /** The agent's execution values for this specific action */
  execution: Record<string, string | number>;
}

/**
 * Structured error from Gatekeeper verification.
 */
export interface GatekeeperError {
  code: 'BOUND_EXCEEDED' | 'INVALID_SIGNATURE' | 'TTL_EXPIRED' | 'FRAME_MISMATCH' | 'DOMAIN_NOT_COVERED' | 'INVALID_PROFILE' | 'MALFORMED_ATTESTATION';
  field?: string;
  message: string;
  bound?: string | number;
  actual?: string | number;
}

/**
 * Gatekeeper verification result.
 */
export type GatekeeperResult =
  | { approved: true }
  | { approved: false; errors: GatekeeperError[] };
