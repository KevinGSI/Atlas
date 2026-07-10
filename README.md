# Atlas Core

Atlas Core is a clean, verified rebuild of the Atlas legal intelligence platform. Version `0.2.0` adds the first PostgreSQL runtime adapter to the verified `0.1.0` baseline.

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
- PostgreSQL repository with parameterized queries and transaction support
- Ordered migration runner with SHA-256 checksum protection
- Atomic object and timeline-event creation
- Runtime repository selection through `DATABASE_URL`

## Requirements

- Node.js 20 or newer and `npm install`
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

The verification command reruns the complete tests and checks release-critical files, the package version, the PostgreSQL dependency, and all four initial database tables.

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

Start PostgreSQL with `docker compose up -d postgres`, run `npm install`, and launch with `DATABASE_URL=postgresql://atlas:atlas@localhost:5432/atlas npm start`. Atlas validates the connection and applies ordered migrations before listening. Without `DATABASE_URL`, it uses the in-memory repository.
