# Architecture

## Runtime Services

| Port | What it does | Package |
|---|---|---|
| **3000** | Admin — serves the UI, handles auth, proxies SP requests, manages vault and gate content | `@hap/control-plane` + `@hap/ui` (React SPA, built and served by the admin server) |
| **3030** | MCP Gateway — tool proxy with Gatekeeper verification, attestation cache, downstream MCP servers | `@hap/mcp-server` |
| — | Shared protocol logic — types, frame hashing, attestation verification, Gatekeeper, profiles | `@hap/core` |

## MCP Tools

Tools are dynamically discovered from downstream MCP servers (e.g., Stripe MCP). The Gatekeeper gates tools based on active authority profiles:

| Profile | Authority Scope | Example Tools | Gatekeeper Check |
|---|---|---|---|
| `spend@0.3` | Financial transactions | create_payment_link, create_invoice_item, create_refund | amount <= amount_max, currency in allowed set, action_type in allowed set |
| `publish@0.3` | External communications | send_email, send_batch | recipient_count <= recipient_max, channel in allowed set |
| `ship@0.3` | Deployments | deploy, rollback | target matches authorized scope |
| `data@0.3` | Data access | query, export | row_limit within bounds |
| `provision@0.3` | Infrastructure | create_instance, scale | cost within bounds |

Read-only tools (`list-authorizations`, `check-pending-attestations`) are always available.

## Profiles

**`spend@0.3`** — Financial transactions

| Path | Required Domains | Default TTL |
|---|---|---|
| `spend-routine` | finance | 24 hours |
| `spend-reviewed` | finance + compliance | 4 hours |

Bounds: `amount_max` (number, max), `currency` (string, enum), `action_type` (string, enum), `target_env` (string, enum)

**`publish@0.3`** — External communications

| Path | Required Domains | Default TTL |
|---|---|---|
| `publish-transactional` | engineering | 24 hours |
| `publish-marketing` | marketing + product | 2 hours |

Bounds: `recipient_max` (number, max), `channel` (string, enum), `audience` (string, enum), `target_env` (string, enum)

## Project Structure

```
hap-gateway/
├── apps/
│   ├── control-plane/         # Admin server (:3000) — serves UI, auth,
│   │   └── src/               #   SP proxy, vault, gate content routing
│   │       ├── index.ts       # Server setup, SP proxy, gate-content routing
│   │       ├── routes/
│   │       │   ├── auth.ts    # Login/logout via SP session
│   │       │   └── vault.ts   # Credential storage (AES-256-GCM)
│   │       └── lib/
│   │           ├── mcp-bridge.ts  # HTTP client to MCP /internal/* endpoints
│   │           └── vault.ts       # AES-256-GCM encrypted vault
│   │
│   ├── mcp-server/            # MCP Gateway (:3030) — Gatekeeper + tool proxy
│   │   ├── bin/http.ts        # Express server, SSE + Streamable HTTP transports
│   │   └── src/
│   │       ├── index.ts       # MCP server factory, tool registration
│   │       ├── tools/
│   │       │   ├── authorizations.ts  # list-authorizations tool handler
│   │       │   └── pending.ts         # check-pending-attestations tool handler
│   │       └── lib/
│   │           ├── gatekeeper.ts        # MCPGatekeeper — verification wrapper
│   │           ├── sp-client.ts         # SP HTTP client with session cookie
│   │           ├── attestation-cache.ts # In-memory cache with TTL eviction
│   │           ├── gate-store.ts        # Local gate content persistence
│   │           ├── mandate-brief.ts     # Agent system instructions builder
│   │           ├── gate-content.ts      # SHA-256 hashing + hash verification
│   │           └── shared-state.ts      # Singleton state container
│   │
│   └── ui/                    # React frontend (built → served by admin server)
│       └── src/
│           ├── App.tsx        # Routes + auth guard
│           ├── contexts/AuthContext.tsx   # Session state
│           ├── pages/
│           │   ├── LoginPage.tsx          # API key login
│           │   ├── DashboardPage.tsx      # Overview + quick actions
│           │   ├── AgentNewPage.tsx       # Step 1: profile/path selection
│           │   ├── GateWizardPage.tsx     # Steps 2-5: bounds + gate questions
│           │   ├── AgentReviewPage.tsx    # Step 6: review + commit
│           │   ├── DeployReviewPage.tsx   # Deploy gate flow (PR-based)
│           │   ├── GroupsPage.tsx         # Group management
│           │   ├── AuditPage.tsx          # Audit trail
│           │   └── OnboardingPage.tsx     # First-run setup
│           ├── components/               # Reusable UI components
│           ├── lib/
│           │   ├── sp-client.ts          # API client (all requests via /api proxy)
│           │   └── frame.ts             # Browser-side frame hashing (SubtleCrypto)
│           └── styles/design-system.css  # CSS custom properties, dark/light themes
│
├── packages/
│   └── hap-core/              # Shared protocol logic
│       └── src/
│           ├── types.ts       # Protocol types (attestation, profile, gatekeeper)
│           ├── frame.ts       # Frame canonicalization + SHA-256 hashing
│           ├── attestation.ts # Blob encoding/decoding, EdDSA verification
│           ├── gatekeeper.ts  # §8.6 verification: signature, frame, TTL, domains, bounds
│           └── profiles/      # Profile definitions
│
├── docs/                      # Detailed documentation
├── Dockerfile                 # Two-stage build, tini for PID 1
├── docker-compose.yml         # Single-service deployment
├── entrypoint.sh              # Starts MCP server + Control Plane
└── pnpm-workspace.yaml
```

## Protocol Compliance

This gateway implements [HAP v0.3](https://humanagencyprotocol.org/review).

| Spec Section | Implementation |
|---|---|
| §4 Profiles | `spend@0.3`, `publish@0.3`, `ship@0.3`, `data@0.3`, `provision@0.3` with field constraints |
| §5 Frames | Canonical frame hashing (SHA-256 of key-ordered fields) |
| §6 Attestations | Ed25519 signatures, TTL enforcement, gate content hashes |
| §7 Domains | Role-based attestations with per-path required domain lists |
| §8 Gatekeeper | Stateless verification + runtime bounds enforcement |
| §8.6.4 | Auth errors checked before bounds (verification order) |
| §17.1 AI Constraints | Agent operates within human-defined bounds; cannot self-authorize |
