# Security Model

## What Is Enforced

| Layer | Enforcement |
|---|---|
| **Attestation signing** | Ed25519 signatures from the external SP. No local signing keys exist. |
| **Signature verification** | Every tool call triggers full EdDSA signature verification against the SP's public key. |
| **Frame binding** | Attestations are bound to a specific frame hash. Changing any frame field invalidates the attestation. |
| **TTL enforcement** | Expired attestations are rejected. The cache auto-evicts them. |
| **Domain coverage** | Multi-domain paths (e.g., `payment-large` requires `finance` + `compliance`) block execution until all domains attest. |
| **Bounds checking** | `max` constraints (amount <= limit) and `enum` constraints (value in allowed set) are checked at runtime. |
| **Verification order** | Auth errors (signature, TTL, domain) are checked before bounds. A forged attestation never reaches bounds logic. |

## Gate Content Privacy

Plaintext gate content (what you wrote in problem/objective/tradeoffs) **never leaves your infrastructure**:

- The browser hashes gate content with SHA-256 before sending hashes to the SP
- Plaintext is sent only to the local MCP server (via the admin server) and stored at `~/.hap/gates.json`
- The MCP server verifies that the plaintext hashes match what the SP attested to
- The agent reads gate content from the local store to understand its mandate

## Internal Endpoint Protection

The MCP server exposes `/internal/*` endpoints for the admin server to push session configuration and gate content. These are restricted to loopback IP (`127.0.0.1`, `::1`) — only the co-located admin server can call them.

## Authentication

Session-based authentication via the external SP. The admin server proxies auth requests, rewrites cookies for localhost compatibility, and pushes the session cookie to the MCP server so it can make authenticated SP API calls on behalf of the logged-in user.

## What Is Real vs. What Is Mocked

| Concern | Status |
|---|---|
| Attestation signing (EdDSA) | Real — external SP |
| Gatekeeper verification | Real — full signature + bounds checking |
| Gate content hashing | Real — SHA-256 (browser + server) |
| Session authentication | Real — API key exchange with SP |
| Internal endpoint protection | Real — loopback-only middleware |
| Payment execution | **Mock** — returns `TXN-000001` style IDs |
| Email sending | **Mock** — returns `MSG-000001` style IDs |

The protocol enforcement is real. The connectors that execute after enforcement are mocks — swap them with actual payment processors or email services for production use.
