# Atlas Core 0.15.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.14.0`
- AES-256-GCM encryption for stored conversation titles, messages, AI-run prompts, and answers
- A fresh 96-bit nonce for every encrypted value
- Authenticated additional data binding ciphertext to its record ID and field
- Stable versioned content envelopes carrying non-secret key identifiers
- Keyring support for decrypting historical content during controlled key rotation
- Explicit errors for unavailable keys, malformed envelopes, authentication failure, and tampering
- Transparent decryption after existing workspace and conversation authorization checks
- Backward-compatible reads of pre-encryption plaintext rows for a controlled migration
- Provider-neutral encryption beneath the AI adapter boundary
- Configuration validation and startup refusal when a provider lacks a valid encryption key

## Verification completed here

- 86 canonical tests across the full Atlas Core surface
- Ciphertext differs across encryptions and does not expose the source text
- Round-trip encryption and authorized API decryption
- Authentication failure after ciphertext tampering or record-context substitution
- Historical-key decryption after rotation to a new active key
- Raw repository records remain encrypted while model history and API results are plaintext
- Two-turn encrypted conversation continuation with exact prior-message assertions

## Explicitly not verified in this environment

- Encrypted persistence against a live PostgreSQL server
- Live model execution or provider-side handling of privileged content
- Deployment secret-manager integration or production key backup/recovery
- Bulk encryption of plaintext rows created before `0.15.0`
- Concurrent key rotation while live requests are running

## Security and product limitations still remaining

- Existing plaintext rows are readable but are not automatically rewritten; deployment requires a separately verified migration procedure
- The default environment configuration exposes one active key; production rotation must retain prior keys through an injected keyring or a future secret-manager adapter
- Encryption does not replace authorization, retention, legal hold, export, defensible deletion, audit review, or backups
- No context compaction, message pagination, streaming transport, cost budgets, write-capable AI tools, or approval workflow
- Evidence/document blobs are not yet covered by this AI-content cipher
- No ethical walls, provider privacy certification, external penetration test, or cryptographic implementation audit

## Data-safety boundary

Version `0.15.0` encrypts newly stored AI content at the application layer and fails closed when authenticated decryption fails. It is not yet approved for confidential legal production use: live PostgreSQL verification, legacy-data migration, managed key custody, retention/legal-hold controls, provider review, backups, and independent security testing remain required.
