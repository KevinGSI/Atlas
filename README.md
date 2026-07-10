# Atlas Core

Atlas Core is the verified rebuild of the Atlas legal intelligence platform. Version `0.25.0` adds attorney verification of AI-identified facts, deadlines, duties, risks, conflicts, entities, recommendations, and matter matches directly inside “While You Were Gone.”

## Implemented

- Canonical workspaces and nested workspace objects
- Matter, client, evidence, document, person, organization, and operation dimensions
- Typed relationships and one-hop graph expansion
- Immutable timeline events and explainable matter-health scoring
- In-memory and PostgreSQL repositories
- Atomic object/timeline transactions
- Ordered, checksum-protected migrations
- Structured API errors and bounded request bodies
- Strict CORS and security response headers
- Liveness, readiness, and graceful shutdown
- Docker, Docker Compose, and Render deployment definitions
- Scrypt password hashing and signed short-lived access tokens
- Owner, admin, member, and viewer workspace roles
- Protected workspace routes and membership administration
- Version-checked object updates, soft deletion, and restoration
- Atomic timeline and before/after audit records for every mutation
- Opaque refresh tokens stored only as hashes
- One-time refresh rotation with token-family reuse detection
- Logout revocation and configurable refresh-session lifetimes
- Hashed, expiring, single-use password-reset tokens
- Anti-enumeration reset requests and an injectable email-delivery boundary
- Atomic password replacement with revocation of every existing refresh session and reset token
- Session-bound access-token claims identifying the issuing login
- Safe session inventory without token hashes or family identifiers
- User-scoped individual session revocation and global logout
- Issuing-session validation on every authenticated request
- Immediate access-token rejection after rotation, logout, global logout, password reset, or session expiration
- Rejection of legacy access tokens without a session binding
- Hashed-principal failed-login tracking without storing raw login emails
- Configurable rolling failure windows, thresholds, and timed lockouts
- Equivalent password-verification work and response sequencing for known and unknown accounts
- Atomic PostgreSQL failure counting and successful-login reset
- Provider-neutral AI orchestration with bounded prompt and tool execution
- Authenticated `POST /v1/workspaces/:workspaceId/assistant/query` endpoint
- Read-only tools for workspace search, recent matters, object retrieval, matter health, and daily priorities
- Workspace-pinned tool execution and deduplicated source-object references
- Explicit `503 AI_NOT_CONFIGURED` behavior until a real model adapter is supplied
- Provider registry with normalized capabilities and duplicate/missing-provider safeguards
- Provider-neutral state, usage, errors, messages, tool calls, and responses
- OpenAI Responses API translation isolated in one adapter with no OpenAI dependency in core orchestration
- Interchangeable injected-provider registration for future hosted or local models
- Immutable AI run records for prompt, actor, outcome, provider/model, sources, tool count, and token usage
- Sanitized failed-run records without stack traces or credentials
- Authorized `GET /v1/workspaces/:workspaceId/assistant/runs` history endpoint
- PostgreSQL triggers rejecting AI-ledger updates and deletions
- Persistent user-owned conversations inside an authorized workspace
- Append-only user and assistant messages with source references and AI run linkage
- Provider-neutral continuation using normalized prior message history
- Authenticated conversation-list and message-history endpoints
- AES-256-GCM content envelopes with unique nonces and record-bound authentication
- Encryption-key identifiers for controlled rotation and historical-key decryption
- Transparent decryption only after existing workspace and conversation authorization
- Startup refusal when an AI provider is enabled without a valid 32-byte content key
- Multi-key environment configuration for retaining historical decryption keys during rotation
- Dry-run-first, resumable migration of legacy plaintext AI content
- Exclusive-lock and all-or-nothing migration safeguards for append-only AI tables
- AI-generated task proposals that cannot mutate platform data directly
- Pending, approved, and rejected proposal lifecycle with optimistic concurrency
- Authenticated action review and decision endpoints
- Transactional approved-task creation with actor, source run, result object, and timeline linkage
- Approval-gated legal-document draft creation linked to a matter
- Approval-gated email draft creation with validated recipients
- Hard `filed: false` and `sent: false` boundaries on AI-created drafts
- Generated-content size limits and structured field validation
- Provider-neutral native intelligence adapter contract independent of chat providers
- Transactional intelligence jobs for object, timeline, and approved-action activity
- Durable pending, processing, completed, and failed job lifecycle
- Concurrent-worker-safe PostgreSQL claiming with `SKIP LOCKED`
- Bounded retries, result provenance, provider identity, and terminal failure records
- Idempotent incoming-email and attachment ingestion with canonical objects and graph links
- Replaceable mail connector, blob storage, PDF extraction, and OCR boundaries
- Capability-based intelligence-provider routing and deployable background worker
- Normalized candidate observations for entities, matter matches, facts, deadlines, duties, conflicts, risks, and recommendations
- Human acceptance/rejection before candidate knowledge becomes canonical twin state
- Deterministic workspace-scoped matter and entity resolution scoring
- Unified intelligence review inbox for candidates, actions, and processing failures
- Shared twin search used by platform APIs and the chat tool registry
- Matter health consuming accepted twin deadlines, risks, and conflicts
- OAuth 2.0 + PKCE CMS connection flow without collecting provider passwords
- Clio Manage OAuth and paginated read-only resource adapter
- MyCase Open API adapter boundary for provider-issued access
- Incremental matter, contact, accounting, task, calendar, document, and communication sync
- Stable external-record links, cursors, checksums, source timestamps, and timeline provenance
- Scheduled coexistence sync while the external CMS remains active
- Encrypted durable OAuth-token vault with production fail-closed configuration
- Event taxonomy for email, phone call, document upload, missed deadline, CMS activity, and other firm events
- Autonomous classification, extraction, resolution, risk analysis, and safe work preparation
- Missed-discovery sweep with idempotent deadline detection
- Automatic unfiled motion-to-compel draft and review-task proposals
- Per-attorney While You Were Gone awareness items and review receipts
- Noise suppression for events that produce no material finding or proposed action
- Same-origin connected phase-one homepage served at `/`
- Real Atlas authentication from the homepage without hard-coded demo credentials
- Attorney-scoped awareness retrieval and review-state updates from the browser client
- Canonical incoming and outgoing phone-call records with transcript and recording references
- Standalone document-upload cataloging with external blob metadata and pending extraction state
- Idempotent phone and document ingestion by workspace, connector, and external record ID
- Native intelligence jobs and timeline provenance created atomically with ingested records
- Awareness cards with human-readable proposal previews
- Attorney approval and rejection controls inside the connected homepage
- Version-checked decisions preventing stale or duplicate approvals
- Approved tasks become open task records; approved emails and legal documents remain drafts
- Permanent `sent: false` and `filed: false` safety boundaries on approved draft creation
- Observation previews with kind, source-derived content, confidence, and current review state
- Attorney accept/reject controls for candidate digital-twin knowledge
- Accepted findings promoted to canonical objects or matter relationships with provenance
- Rejected findings retained in the intelligence ledger without contaminating canonical firm knowledge

## Local development

Requirements: Node.js 20+, pnpm 11+, and optionally Docker.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm verify
pnpm start
```

Without `DATABASE_URL`, development uses the in-memory repository.

Open `http://localhost:3000/` to use the connected phase-one client. Enter an existing Atlas account and workspace ID. This client reads live API data; it does not substitute fictional awareness cards.

## Local PostgreSQL stack

```bash
docker compose up --build
```

This starts PostgreSQL, applies migrations, and exposes Atlas at `http://localhost:3000`.

## Health endpoints

```text
GET /live    Process liveness
GET /ready   Database-aware readiness
GET /health  Compatibility health endpoint
```

## Autonomous situational awareness

Atlas turns firm activity into intelligence jobs without waiting for a chat prompt. Incoming email, phone-call, document-upload, CMS, timeline, and missed-deadline events are classified and analyzed through the provider-neutral native-intelligence boundary. A configured provider can perform multiple related functions in one pass: extraction, matter resolution, deadline and duty detection, risk analysis, and preparation of reviewable work.

The deterministic missed-discovery playbook runs even though AI vendors remain interchangeable. It prepares an unfiled motion-to-compel draft and a review task, then places an urgent item in the responsible attorney's feed. It never files the document. The same safety boundary prevents autonomous email sending, publishing, or destructive actions.

```text
GET   /v1/workspaces/:workspaceId/home/while-you-were-gone
PATCH /v1/workspaces/:workspaceId/home/while-you-were-gone/:itemId
```

The feed returns source provenance, linked observations, proposed actions, and the current user's review status. The PATCH endpoint accepts `seen`, `reviewed`, or `dismissed`.

## Render staging deployment

1. Push this repository to GitHub.
2. In Render, create a Blueprint from the repository's `render.yaml`.
3. Set `CORS_ORIGINS` to the exact staging frontend origin.
4. Deploy. Render provisions managed PostgreSQL, runs `node scripts/migrate.js`, starts the container, and checks `/ready`.
5. Use only synthetic data until the security milestones in `IMPLEMENTATION_STATUS.md` are complete.

## Manual production-like commands

```bash
export NODE_ENV=production
export HOST=0.0.0.0
export DATABASE_URL=postgresql://user:password@host:5432/atlas
export CORS_ORIGINS=https://staging.example.com
export AUTH_TOKEN_SECRET=replace-with-at-least-32-random-characters
pnpm migrate
pnpm start
```

## Authentication

Register with `POST /v1/auth/register` or log in with `POST /v1/auth/login`. Send the returned access token on workspace requests:

```text
Authorization: Bearer <accessToken>
```

Creating a workspace atomically makes the authenticated creator its owner. Owners and admins can add memberships through `POST /v1/workspaces/:workspaceId/memberships`.

Access tokens are short-lived. Exchange each refresh token exactly once through `POST /v1/auth/refresh`; the response contains its replacement. Reusing an older token revokes the entire session family. `POST /v1/auth/logout` revokes the supplied refresh token.

Password recovery begins with `POST /v1/auth/password-reset/request`, which always returns the same accepted response whether an account exists or delivery succeeds. A configured delivery provider receives the raw token; Atlas persists only its hash. Complete recovery through `POST /v1/auth/password-reset/complete`. The successful transaction replaces the password and invalidates all reset tokens and refresh sessions for the user.

Authenticated users can inspect their login history with `GET /v1/auth/sessions`, revoke one session with `DELETE /v1/auth/sessions/:sessionId`, or revoke every refresh session with `DELETE /v1/auth/sessions`. Session responses expose status and timestamps but never stored token hashes or internal token-family identifiers.

Every protected request verifies both the access-token signature and its persisted issuing session. Rotated, revoked, expired, missing, and cross-user sessions receive `401 ACCESS_TOKEN_REVOKED`; tokens without a session claim receive `401 ACCESS_TOKEN_SESSION_REQUIRED`.

Login failures are tracked by a normalized email hash. The defaults lock a principal for 15 minutes after five failures within 15 minutes. Configure `LOGIN_FAILURE_THRESHOLD`, `LOGIN_FAILURE_WINDOW_SECONDS`, and `LOGIN_LOCK_SECONDS` as positive integers. Locked requests return `429 ACCOUNT_LOCKED` with the expiration time.

## Atlas AI orchestration

The assistant endpoint authenticates the user, checks `workspace:read`, and pins every model-requested tool to that authorized workspace. The model cannot supply or change the workspace ID. Tools either read shared twin state or create review proposals; they cannot directly send, file, publish, or perform another consequential mutation.

The runtime accepts providers implementing `complete({ messages, tools, context, state })` and `capabilities()`. Atlas selects one with `AI_PROVIDER`; `AI_MODEL` identifies the provider model. Without a selected provider, the endpoint returns `503 AI_NOT_CONFIGURED` rather than generating a scripted response or claiming AI work occurred.

For the initial OpenAI adapter, set `AI_PROVIDER=openai`, `AI_MODEL` to an explicitly selected model ID, and `OPENAI_API_KEY`. `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`. The adapter uses the Responses API, keeps remote storage disabled, preserves provider response state locally for tool rounds, and normalizes token usage and provider errors before returning control to Atlas.

Any configured AI provider also requires `AI_CONTENT_ENCRYPTION_KEY`, a base64-encoded 32-byte secret, and accepts `AI_CONTENT_ENCRYPTION_KEY_ID` (default `primary`). Generate a development key with `openssl rand -base64 32`. Keep production keys in the deployment platform's secret manager, never in Git. Losing a key makes its encrypted content unrecoverable.

For rotation, set `AI_CONTENT_ENCRYPTION_KEYS` to a JSON object containing the old and new base64 keys, and set `AI_CONTENT_ENCRYPTION_KEY_ID` to the new active ID. Atlas encrypts new values with the active key while retaining the ability to decrypt older envelopes. Key IDs cannot contain colons.

Before enabling confidential data, back up PostgreSQL and inventory legacy rows with `pnpm encrypt-ai-content`. This is a dry run. During an approved maintenance window, stop application traffic and run `pnpm encrypt-ai-content -- --apply`. The apply mode obtains an exclusive lock and commits all conversions together; rerunning safely skips encrypted values. Do not remove an old key until the inventory and backup recovery procedure prove that no retained envelope needs it.

Other providers are registered through the same `AiProviderRegistry`; legal tools and workflows do not import or reference the OpenAI adapter.

## Native intelligence and digital twin

Native intelligence runs beneath chat and direct platform workflows. Material object, timeline, ingestion, and approved-action events enqueue durable jobs. `pnpm worker:intelligence` runs the background worker. It selects interchangeable providers by declared trigger capabilities, validates normalized results, and projects candidate observations and action proposals with source, confidence, location, job, and provider provenance.

Incoming connector emails enter through `POST /v1/workspaces/:workspaceId/ingestions/email`. Attachment metadata points to an external blob reference; binary storage, malware scanning, PDF parsing, and OCR are replaceable adapters rather than database blobs or vendor-specific domain code.

Phone and standalone-document connectors use these authenticated routes:

```text
POST /v1/workspaces/:workspaceId/ingestions/phone-calls
POST /v1/workspaces/:workspaceId/ingestions/documents
```

Repeated connector deliveries return the already cataloged record and do not duplicate intelligence jobs. Phone calls queue `phone_call.received`; documents queue `attachment.received` for provider-neutral processing.

Candidates remain noncanonical until reviewed. The homepage can consume `GET /v1/workspaces/:workspaceId/intelligence/review-inbox`; authorized reviewers accept or reject observations through `POST /v1/workspaces/:workspaceId/intelligence/observations/:observationId/decision`. Accepted knowledge becomes canonical twin objects or relationships. Both ordinary screens and Atlas chat search the same accepted state through `GET /v1/workspaces/:workspaceId/intelligence/search?q=...` and the `search_twin` tool.

## CMS coexistence and transition

Atlas never asks a customer to enter a Clio or MyCase password. Start a provider authorization with `POST /v1/workspaces/:workspaceId/cms/:provider/authorize`; Atlas generates OAuth state and PKCE values, and the user signs in on the provider's own site. The provider redirects to `GET /v1/cms/oauth/callback`. Connections can be inspected, synchronized, and disconnected through the workspace CMS endpoints.

Connections are read-only by default. Incremental sync maps supported provider records into canonical Atlas objects, keeps stable external IDs and cursors, and emits timeline/intelligence events. Set `CMS_SYNC_ENABLED=true` to run continuous sync and configure `CMS_SYNC_INTERVAL_MS`. Production connectors require either an injected managed `credentialVault` or `CMS_CREDENTIAL_ENCRYPTION_KEY` containing a base64-encoded 32-byte key.

Clio requires `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET`, and optionally `CLIO_REGION`. MyCase Open API availability and endpoints must be enabled/issued for the firm; configure `MYCASE_CLIENT_ID`, `MYCASE_CLIENT_SECRET`, `MYCASE_AUTHORIZE_ENDPOINT`, `MYCASE_TOKEN_ENDPOINT`, and `MYCASE_API_BASE`. Vendor APIs, scopes, tiers, and field availability must be verified before enabling a production connection.

## AI accountability ledger

Every assistant request receives a stable `runId`. Completed runs record the answer, source objects, tool count, provider/model identity, and normalized usage. Failed runs record the prompt, actor, timestamp, provider when known, and a sanitized Atlas error code. The ledger is workspace-scoped and append-only; PostgreSQL rejects updates and deletions.

Authorized users can review recent execution records through `GET /v1/workspaces/:workspaceId/assistant/runs?limit=50`. Stored conversation titles, messages, run prompts, and answers are encrypted with AES-256-GCM whenever the encryption key is configured. Provider execution still necessarily receives decrypted prompt context in memory. Production deployments must also apply retention, export, and deletion policies consistent with legal and contractual obligations.

Conversation queries accept an optional `conversationId`; omitting it creates a new private conversation. Users can list their conversations at `GET /v1/workspaces/:workspaceId/assistant/conversations` and retrieve messages at `GET /v1/workspaces/:workspaceId/assistant/conversations/:conversationId/messages`. Conversation ownership is enforced independently of workspace membership.

## Object mutation and audit

Updates, deletion, and restoration require the object's current `version`. Stale writes return `409 VERSION_CONFLICT` instead of overwriting newer work.

```text
PATCH  /v1/workspaces/:workspaceId/objects/:objectId
DELETE /v1/workspaces/:workspaceId/objects/:objectId
POST   /v1/workspaces/:workspaceId/objects/:objectId/restore
GET    /v1/workspaces/:workspaceId/audit?objectId=:objectId
```

## Verification

```bash
pnpm verify
```

Verification reruns all canonical tests and validates required source, migration, container, and Render configuration files. See `IMPLEMENTATION_STATUS.md` for the precise live-infrastructure boundary.
