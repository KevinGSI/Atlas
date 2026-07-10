# Atlas Core 0.33.0 — Canonical Awareness Enforcement Status

## Verified as implemented

- Everything verified through Atlas Core `0.32.0`
- Commit-time enforcement requiring event coverage for every canonical object mutation
- Commit-time enforcement requiring both endpoints of new graph relationships to be affected
- Equivalent enforcement in the in-memory and PostgreSQL repositories
- Automatic rollback with stable `CANONICAL_EVENT_REQUIRED` failures for orphaned mutations
- Email attachment batches covered atomically by one event linking every created document
- Accepted AI matter-match relationships now publish canonical relationship events
- Universal append-only canonical event ledger mirroring every material timeline event
- Enforced workspace-safe links from events to primary and affected canonical objects
- Correlation and causation fields for tracing chains of firm activity
- Consumer-specific idempotent delivery, replay, bounded retries, and dead-letter state
- Continuously running application dispatcher with graceful shutdown
- Graph-impact consumer discovering connected objects and queuing reanalysis exactly once
- Relationship mutations now publish canonical events affecting both connected objects
- Infrastructure-only records remain outside the legal/business event graph
- Independently registered and semantically versioned native-AI capability modules
- Trigger-scoped capability discovery and execution through a stable Core registry
- Dependency-injected capability registries for deployments and future package loaders
- Core-enforced action boundary allowing only tasks, unfiled documents, and unsent email drafts
- Existing email response, phone follow-up, document deadline, and missed-discovery behavior moved out of the event engine
- Proof that a deposition capability installs without modifying the event engine or unrelated Core code
- Duplicate-version rejection and consequential-action rejection for capability packages
- Provider-neutral scheduler lease coordinator with unique instance ownership
- PostgreSQL-backed atomic acquisition, renewal, expiration recovery, and owner-scoped release
- CMS synchronization and situational sweeps protected from concurrent multi-instance execution
- Bounded lease expiration permits another healthy instance to recover after a crash
- Provider-independent situational playbooks fill safe review work omitted by an interchangeable AI model
- Extracted email response duties deterministically produce unsent email-draft proposals
- Extracted phone callback duties deterministically produce internal task proposals
- Extracted document deadlines deterministically produce deadline-linked internal task proposals
- Explicit email response requests require an unsent email draft proposal for attorney review
- Callback and follow-up duties require an internal task proposal
- Source-supported deadlines and response dates require an internal task proposal
- Native intelligence receives the canonical trigger type in provider context
- Safe-work instructions preserve the prohibition on autonomous sending, filing, publishing, deletion, and external consequential action
- Fail-closed HTTPS staging smoke-test harness
- Connected homepage, readiness, registration, authentication, workspace, and awareness checks
- Synthetic identity and workspace creation with no reusable test credentials
- Sanitized machine-readable report excluding tokens and passwords
- Manually triggered GitHub staging workflow
- Workspace-scoped signed connector webhooks for email, calls, and documents
- Exact-body HMAC-SHA256 signatures with constant-time verification
- Timestamp freshness enforcement and five-minute replay window
- Connector identity forced from the signed URL rather than untrusted payload data
- Existing ingestion idempotency preventing duplicate intelligence work
- Manual GitHub Actions OpenAI evaluation workflow
- GitHub Secrets bindings for the OpenAI API and Atlas encryption keys
- Secret-presence checks without value disclosure
- Explicitly manual execution to prevent unintended API spend
- OpenAI selected as the initial web and worker deployment provider
- Explicit `gpt-5.6-sol` model configuration
- Unsynchronized deployment secrets for OpenAI and Atlas AI-content encryption
- Local environment template without committed secrets
- Production intelligence worker parity with application situational playbooks
- Provider-neutral legal event evaluation framework
- Four representative situational-awareness scenarios
- Required observation and action scoring with configurable threshold
- Prohibited consequential-action detection
- Malformed provider-output failure handling
- Fail-closed live provider command with JSON report
- Disposable-schema live PostgreSQL integration harness
- All 17 migrations applied in order and verified idempotent on rerun
- Live checks for 25 tables, canonical persistence, awareness receipts, transactional rollback, and immutable timeline triggers
- Fail-closed live-test command requiring an explicit database URL
- PostgreSQL 16 CI service with health checks and locked dependency installation
- Candidate observation previews inside attorney awareness cards
- Confidence, kind, evidence-derived description, and review status presentation
- Authenticated acceptance and rejection from the connected homepage
- Accepted facts, deadlines, duties, risks, conflicts, recommendations, and entities promoted to canonical twin objects
- Accepted matter matches promoted to graph relationships
- Rejected observations retained as rejected ledger entries without canonical mutation
- Reviewable task, email-draft, and legal-document proposals inside awareness cards
- Human-readable proposal previews with safe HTML escaping
- Approve and reject controls using authenticated, version-checked decisions
- Immediate decision state shown without implying that external action occurred
- Approved proposal linkage to newly created canonical draft or task records
- Hard unsent and unfiled state after approval
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
- Renewable distributed leases for multi-instance scheduler coordination
- Authenticated connection, authorization, callback, list, sync, and disconnect HTTP routes

## Verification completed here

- 150 canonical tests passed locally across the complete non-live Atlas Core surface
- 1 live PostgreSQL integration test correctly skipped because this workspace has no database URL
- Deterministic provider evaluation and unsafe/malformed provider rejection
- Live AI command environment and failure behavior verified locally
- CI workflow and fail-closed environment guard verified locally
- End-to-end candidate observation acceptance and rejection over HTTP
- Proof that acceptance creates canonical risk knowledge
- Proof that rejection creates no canonical object
- Connected-client delivery checks for observation decisions
- End-to-end awareness-to-approval HTTP workflow
- Proof that an approved motion remains a draft with `filed: false`
- Connected-client delivery checks for decision controls and endpoints
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
- Live PostgreSQL execution of migrations `0014`, `0015`, `0016`, and `0017`
- A real mailbox, telephony provider, document store, or production AI model processing an event end to end
- Deployment of the connected homepage against a public production environment
- Live local network-listener execution in this restricted workspace (`listen EPERM`)
- Execution of the new integration harness against a real PostgreSQL daemon; this workspace supplied neither `TEST_DATABASE_URL` nor a database service
- Execution of `pnpm test:ai` against a paid production model; no provider credentials were supplied here
- OpenAI API authentication and model entitlement; `OPENAI_API_KEY` is not present in this workspace
- Execution result of the GitHub OpenAI workflow; it will exist only after this commit is pushed and the workflow is manually run
- Real vendor webhook delivery; no mailbox, telephony, or document vendor credentials were supplied here
- Execution against a public staging deployment; `STAGING_BASE_URL` has not been supplied and Atlas has not yet been deployed
- A production KMS/HSM-backed vault, sustained rate-limit behavior, or large-firm migration volumes
- Two-way write-back; this release intentionally defaults to source-to-Atlas read-only coexistence

## Safety boundary

Atlas may autonomously observe, categorize, analyze, connect, prioritize, and prepare work. Consequential external actions remain proposals. Emails are not sent and legal documents are not filed or published until an authorized human approves the action through the existing review lifecycle.

## Security and transition boundary

Atlas must not ask customers to submit their Clio or MyCase password. Users authenticate on the provider's own authorization page. Atlas stores only encrypted OAuth/API credentials or a managed-vault reference. Imported records retain their source identity so users can continue working in the existing CMS while Atlas synchronizes and builds its authorized digital twin.

## Product limitations remaining

- Provider field mappings require certification against each vendor account and enabled API surface
- Deletion/tombstone reconciliation, attachment binary transfer, trust-account migration controls, and conflict-resolution UI need additional releases
- Final cutover tooling and write-back require separate explicit authorization and reconciliation policies
- Email and phone response drafting quality still depends on the configured interchangeable AI provider and connector-supplied content
- The motion-to-compel output is a reviewable draft shell, not a jurisdiction-certified filing
- The separate design demo still uses fictional data; the tracked homepage at `/` uses authenticated API data
