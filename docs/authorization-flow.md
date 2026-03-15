# Authorization Flow

## The Six-Step Gate Wizard

1. **Profile & Path** — Select what kind of action (spend, publish) and scope (routine, reviewed)
2. **Bounds** — Set field constraints: `amount_max: 100`, `currency: USD`, `action_type: charge`
3. **Problem** — Why is this authorization needed?
4. **Objective** — What should the agent achieve?
5. **Tradeoffs** — What risks are you accepting?
6. **Commit** — Review everything, sign the attestation

The SP signs the attestation with its Ed25519 key. Gate content hashes (never plaintext) are embedded in the attestation.

## What the Agent Sees

When an agent connects, it receives a mandate brief describing its authorities:

```
You are an agent operating under the Human Agency Protocol (HAP).
You have bounded authorities granted by human decision owners.

=== ACTIVE AUTHORITIES ===

[spend-routine] spend@0.3 (28 min remaining)
  Bounds: amount_max: 100, currency: USD, action_type: charge
  Problem: Monthly supplier invoices need timely processing.
  Objective: Pay approved invoices within terms without manual review.
  Tradeoffs: Rounding < 2 USD acceptable. Late payments not acceptable.
```

Tools without active authorizations are hidden. When an authorization expires, the tool disappears from the agent's available tools in real time.

## Create Your First Authorization

1. Open the UI and log in with your API key
2. Click **Agent Authorization** in the sidebar
3. Select profile `spend@0.3` and path `spend-routine`
4. Set bounds: `amount_max: 100`, `currency: USD`, `action_type: charge`
5. Answer the three gate questions (problem, objective, tradeoffs)
6. Review and commit — the attestation is signed and the MCP server is notified

The agent can now make payments up to $100 USD for the next 24 hours.
