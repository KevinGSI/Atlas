# Atlas Core 0.16.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.15.0`
- JSON keyring configuration containing active and historical AES-256-GCM keys
- Explicit active-key selection with key-ID validation
- New writes use the active key while retained keys decrypt historical envelopes
- Dry-run inventory of plaintext conversation titles, messages, prompts, and answers
- Explicit `--apply` requirement before any legacy-data mutation
- One-transaction legacy encryption under a PostgreSQL advisory and exclusive table lock
- Parameterized compare-and-update statements protecting against unexpected row changes
- Temporary append-only trigger suspension contained inside the migration transaction
- Automatic rollback of content and trigger state after any failure
- Idempotent reruns that skip versioned encrypted envelopes

## Verification completed here

- 90 canonical tests across the full Atlas Core surface
- Multi-key configuration, active-key validation, invalid JSON, and invalid key-ID tests
- Legacy-row inventory with encrypted-row exclusion
- Exact encrypted update counts and envelope assertions
- Exclusive-lock, commit, and forced-failure rollback assertions
- Clean regression verification of authentication, authorization, AI orchestration, persistence adapters, and deployment definitions

## Explicitly not verified in this environment

- Migration execution against live PostgreSQL data
- Lock duration and operational impact on a production-sized dataset
- Managed secret-store retrieval, key escrow, backup restoration, or disaster recovery
- Live concurrent traffic shutdown during migration
- Provider-side handling of decrypted privileged content

## Security and product limitations still remaining

- The migration requires a planned maintenance window, verified database backup, table-owner permission, and post-run validation
- Environment JSON is a deployment interface, not a managed KMS/HSM integration
- Evidence/document blobs are not yet covered by the AI-content cipher
- Encryption does not implement retention, legal hold, export, defensible deletion, or ethical walls
- No context compaction, message pagination, streaming transport, cost budgets, write-capable AI tools, or approval workflow
- No provider privacy certification, external penetration test, or independent cryptographic audit

## Data-safety boundary

Version `0.16.0` supplies tested key rotation and a transactionally safe migration mechanism, but it has not run against live PostgreSQL here. It is not approved for confidential legal production use until migration rehearsals, managed key custody, backup recovery, retention/legal-hold controls, provider review, and independent security testing are completed.
