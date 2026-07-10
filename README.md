# Atlas Core

Atlas Core is the verified backend rebuild of the Atlas legal intelligence platform. Version `0.3.0` adds a deployable staging foundation to the persistence work completed in `0.2.0`.

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
pnpm migrate
pnpm start
```

## Verification

```bash
pnpm verify
```

Verification reruns all canonical tests and validates required source, migration, container, and Render configuration files. See `IMPLEMENTATION_STATUS.md` for the precise live-infrastructure boundary.
