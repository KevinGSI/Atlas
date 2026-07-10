# Atlas Core 0.1.0 — Implementation Status

## Verified as implemented

- Executable Node.js HTTP API
- In-memory repository with workspace isolation checks
- Workspace creation and retrieval
- Canonical nested object creation, retrieval, listing, and filtering
- Parent-object validation
- Relationship creation, self-link rejection, and duplicate prevention
- One-hop graph expansion
- Timeline creation, filtering, ordering, and confidence validation
- Automatic `object.created` timeline events
- Explainable matter-health calculation
- Structured API errors
- PostgreSQL schema for workspaces, objects, relationships, and timeline events
- Domain tests and in-process HTTP handler integration tests
- Release verification script

## Explicitly not implemented

- PostgreSQL runtime adapter or live database integration test
- Authentication, users, membership, and authorization
- Object update, optimistic concurrency, soft deletion, restoration, and audit ledger
- Multi-hop graph traversal and full-text search
- Frontend application
- AI provider integration
- File/blob storage
- Background jobs, offline sync, and collaborative editing
- Production deployment infrastructure

## Verification boundary

The SQL migration is statically verified for the expected four tables but has not been executed against PostgreSQL in this environment because Docker/PostgreSQL are unavailable. The HTTP request handler is verified in-process with the in-memory repository; this sandbox prohibits binding a network listener, so live socket startup is not claimed as tested here.

This repository intentionally starts at `v0.1.0`. No earlier implementation history is claimed.
