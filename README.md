# Atlas Core

Atlas Core is the verified backend rebuild of the Atlas legal intelligence platform. Version `0.4.0` adds authenticated users and workspace role enforcement to the deployable staging foundation.

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

Register with `POST /v1/auth/register` or log in with `POST /v1/auth/login`. Send the returned token on workspace requests:

```text
Authorization: Bearer <accessToken>
```

Creating a workspace atomically makes the authenticated creator its owner. Owners and admins can add memberships through `POST /v1/workspaces/:workspaceId/memberships`.

## Verification

```bash
pnpm verify
```

Verification reruns all canonical tests and validates required source, migration, container, and Render configuration files. See `IMPLEMENTATION_STATUS.md` for the precise live-infrastructure boundary.
