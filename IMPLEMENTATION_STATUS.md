# Atlas Core 0.2.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0`
- Asynchronous service/repository boundary
- PostgreSQL repository for workspaces, objects, relationships, and timeline events
- Parameterized SQL and database-row mapping
- Dedicated pooled transaction clients with `BEGIN`, `COMMIT`, `ROLLBACK`, and release
- Atomic object creation plus `object.created` timeline event
- In-memory transaction rollback parity
- Ordered SQL migration loading
- Migration history and SHA-256 checksum enforcement
- Runtime selection through `DATABASE_URL`
- PostgreSQL connection validation before server startup
- Domain, HTTP-handler, PostgreSQL adapter, transaction, and migration tests

## Explicitly not verified in this environment

- Execution against a live PostgreSQL server
- Real database persistence across process restarts
- Real connection-pool behavior under concurrency

## Additional runtime verification

- Atlas bound an ephemeral `127.0.0.1` port successfully
- A real HTTP `GET /health` request returned status `200` and version `0.2.0`

## Not yet implemented

- Authentication, users, membership, and authorization
- Object updates, optimistic concurrency, soft deletion, restoration, and audit ledger
- Multi-hop graph traversal and full-text search
- Frontend, AI provider integration, file storage, and background jobs
- Production deployment infrastructure

## Verification boundary

PostgreSQL behavior is covered through deterministic adapter tests that inspect SQL, parameters, row mapping, transaction commit/rollback, migration order, and checksum failure. These tests do not substitute for a live PostgreSQL integration run, which remains required before calling the persistence layer production-verified.
