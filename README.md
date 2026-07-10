# Atlas Core

Atlas Core is the verified backend rebuild of the Atlas legal intelligence platform. Version `0.7.0` adds secure, single-use password recovery and credential-wide session revocation.

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

## Local development

Requirements: Node.js 20+, pnpm 11+, and optionally Docker.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm verify
pnpm start
```

Without `DATABASE_URL`, development uses the in-memory repository.

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
