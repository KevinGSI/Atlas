# Atlas Core 0.21.0 — CMS Coexistence Status

## Verified as implemented

- Everything verified through Atlas Core `0.20.0`
- Provider-neutral CMS connector registry and capability discovery
- OAuth 2.0 authorization-code flow with PKCE state, verifier, expiration, and single use
- No CMS username/password fields, endpoints, or schema columns
- Durable AES-256-GCM credential vault storing only ciphertext and opaque references
- Production refusal when a configured connector lacks a managed vault or encryption key
- Clio Manage regional OAuth endpoints, bearer access, pagination, and read-only resource configuration
- MyCase Open API adapter boundary requiring provider-issued endpoint/API access configuration
- Read-only-by-default connections and explicit disconnect/revocation
- Incremental cursors, source timestamps, checksums, stable provider record IDs, and idempotent Atlas links
- Canonical mappings for matters, contacts, accounting, tasks, calendars, documents, and communications
- Import/update timeline events and native-intelligence jobs for digital-twin learning
- Continuous scheduled synchronization with isolated per-connection failures
- Authenticated connection, authorization, callback, list, sync, and disconnect HTTP routes

## Verification completed here

- 125 canonical tests across the complete Atlas Core surface
- PKCE authorization and single-use state
- Proof that returned connections never expose access tokens
- Proof that the durable repository contains authenticated ciphertext, not token plaintext
- Incremental matter/contact/accounting import with external provenance
- Canonical object and intelligence-job creation
- Clio OAuth/token/bearer request translation using a simulated official API transport
- MyCase configuration fail-closed behavior
- Scheduler repetition and graceful shutdown
- Full native-intelligence, identity, authorization, migration, PostgreSQL adapter, and deployment regression suite

## Explicitly not live-verified here

- Clio developer application approval, real user authorization, or production API data
- MyCase Advanced Tier/Open API enablement, issued endpoints, or real API data
- Other CMS vendors not yet supplied as adapters
- Live PostgreSQL execution of migrations `0014` and `0015`
- A production KMS/HSM-backed vault, multi-instance scheduler locks, rate-limit behavior, or large-firm migration volumes
- Two-way write-back; this release intentionally defaults to source-to-Atlas read-only coexistence

## Security and transition boundary

Atlas must not ask customers to submit their Clio or MyCase password. Users authenticate on the provider's own authorization page. Atlas stores only encrypted OAuth/API credentials or a managed-vault reference. Imported records retain their source identity so users can continue working in the existing CMS while Atlas synchronizes and builds its authorized digital twin.

## Product limitations remaining

- Provider field mappings require certification against each vendor account and enabled API surface
- Deletion/tombstone reconciliation, attachment binary transfer, trust-account migration controls, and conflict-resolution UI need additional releases
- A production multi-instance scheduler should use a dedicated distributed lease
- Final cutover tooling and write-back require separate explicit authorization and reconciliation policies
