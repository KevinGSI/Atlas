# Atlas Core

Atlas Core is a clean, verified rebuild of the Atlas legal intelligence platform. Version `0.1.0` is the first implementation whose source and tests exist in this workspace.

## Implemented vertical slice

- Canonical workspaces and nested workspace objects
- Matter, client, evidence, document, person, organization, and operation dimensions
- Typed, duplicate-safe object relationships
- Immutable timeline events with confidence and visibility metadata
- One-hop relationship graph expansion
- Explainable matter-health scoring
- Structured JSON errors
- PostgreSQL 16 initial schema
- Dependency-free HTTP runtime and automated tests

## Requirements

- Node.js 20 or newer
- Docker only if you want to start PostgreSQL (the runtime adapter is not part of `0.1.0`)

## Run

```bash
npm start
```

The API listens on `http://127.0.0.1:3000` by default. Check it with `GET /health`.

## Test and verify

```bash
npm test
npm run verify
```

The verification command reruns the complete tests and checks release-critical files, the package version, and all four initial database tables.

## API routes

```text
GET  /health
POST /v1/workspaces
GET  /v1/workspaces/:workspaceId
POST /v1/workspaces/:workspaceId/objects
GET  /v1/workspaces/:workspaceId/objects
GET  /v1/workspaces/:workspaceId/objects/:objectId
POST /v1/workspaces/:workspaceId/relationships
GET  /v1/workspaces/:workspaceId/objects/:objectId/graph
POST /v1/workspaces/:workspaceId/events
GET  /v1/workspaces/:workspaceId/events
GET  /v1/workspaces/:workspaceId/matters/:matterId/health
```

## PostgreSQL schema

Start PostgreSQL with `docker compose up -d postgres`, then apply `db/migrations/0001_initial.sql` using your preferred migration runner. The current API intentionally uses the in-memory repository; see `IMPLEMENTATION_STATUS.md` for the exact boundary.
