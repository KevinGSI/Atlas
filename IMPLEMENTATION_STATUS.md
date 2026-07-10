# Atlas Core 0.23.0 — Event Ingestion Status

## Verified as implemented

- Everything verified through Atlas Core `0.22.1`
- Authenticated phone-call and standalone-document ingestion routes
- Canonical call records with direction, parties, transcript, summary, duration, and external recording reference
- Canonical uploaded-document records with blob reference, checksum, media type, size, and extraction status
- Atomic timeline, intelligence-job, and ingestion-ledger persistence
- Duplicate delivery suppression across phone and document connectors
- Autonomous phone-call awareness with extracted duties and proposed callback work
- Application-served phase-one homepage with functional Atlas login
- Same-origin authenticated API client with no hard-coded demo identity
- Attorney-scoped `While You Were Gone` loading and review decisions
- Browser-facing error states for authentication and API failures
- Container packaging of the tracked frontend assets
- Native event taxonomy for incoming email, phone calls, document uploads, missed deadlines, CMS activity, and other firm activity
- Provider-neutral tandem analysis for classification, entity extraction, matter matching, facts, deadlines, duties, conflicts, risks, recommendations, and safe proposed work
- Material-event playbooks independent of any one AI provider
- Scheduled, idempotent detection of missed deadlines
- A deterministic missed-discovery playbook preparing an unfiled motion-to-compel draft and attorney review task
- Per-attorney `While You Were Gone` awareness records with unseen, seen, reviewed, and dismissed state
- Awareness items linked to source events, observations, proposed actions, and resulting drafts
- Noise suppression when an event produces no material finding or proposed work
- Hard approval boundary: situational automation cannot send email, file a motion, publish content, or delete records
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

- 136 canonical tests across the complete Atlas Core surface
- Phone and document validation with transactional rollback
- Phone and document idempotency and native-job routing
- Authenticated HTTP ingestion for both event types
- End-to-end phone ingestion through native intelligence into attorney awareness
- Connected homepage asset delivery with restrictive security headers
- Authenticated awareness retrieval and review through the HTTP boundary
- PostgreSQL attorney-scoping and receipt-upsert query verification
- Autonomous missed-deadline detection and duplicate suppression
- Provider-neutral job processing with deterministic situational playbooks
- Creation of an urgent awareness item, review task, and unfiled motion draft
- Per-user awareness review-state persistence
- Email, phone-call, and document-upload categorization
- Suppression of nonmaterial generic activity
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
- Live PostgreSQL execution of migrations `0014`, `0015`, and `0016`
- A real mailbox, telephony provider, document store, or production AI model processing an event end to end
- Deployment of the connected homepage against a public production environment
- Live local network-listener execution in this restricted workspace (`listen EPERM`)
- A production KMS/HSM-backed vault, multi-instance scheduler locks, rate-limit behavior, or large-firm migration volumes
- Two-way write-back; this release intentionally defaults to source-to-Atlas read-only coexistence

## Safety boundary

Atlas may autonomously observe, categorize, analyze, connect, prioritize, and prepare work. Consequential external actions remain proposals. Emails are not sent and legal documents are not filed or published until an authorized human approves the action through the existing review lifecycle.

## Security and transition boundary

Atlas must not ask customers to submit their Clio or MyCase password. Users authenticate on the provider's own authorization page. Atlas stores only encrypted OAuth/API credentials or a managed-vault reference. Imported records retain their source identity so users can continue working in the existing CMS while Atlas synchronizes and builds its authorized digital twin.

## Product limitations remaining

- Provider field mappings require certification against each vendor account and enabled API surface
- Deletion/tombstone reconciliation, attachment binary transfer, trust-account migration controls, and conflict-resolution UI need additional releases
- A production multi-instance scheduler should use a dedicated distributed lease
- Final cutover tooling and write-back require separate explicit authorization and reconciliation policies
- Email and phone response drafting quality still depends on the configured interchangeable AI provider and connector-supplied content
- The motion-to-compel output is a reviewable draft shell, not a jurisdiction-certified filing
- The separate design demo still uses fictional data; the tracked homepage at `/` uses authenticated API data
