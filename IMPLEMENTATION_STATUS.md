# Atlas Core 0.6.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.5.0`
- Opaque, cryptographically random refresh tokens
- SHA-256 refresh-token hashes at rest; raw refresh tokens are never persisted
- Persisted refresh sessions linked to users and token families
- Configurable refresh-token expiration (30-day default)
- One-time refresh-token rotation
- Row locking and atomic session replacement in PostgreSQL
- Reuse detection for consumed or revoked refresh tokens
- Whole-family revocation after reuse detection
- Explicit logout/revocation endpoint
- Registration and login responses issuing access and refresh credentials
- Atomic registration and initial-session persistence
- PostgreSQL session indexes for user, family, and active-session queries

## Verification completed here

- 47 canonical tests covering domain, HTTP, authentication, authorization, persistence, concurrency, audit, deployment, sessions, and rollback
- End-to-end HTTP registration, rotation, logout, and rejected-reuse flow
- Deterministic rotation, expiration, logout, and token-family revocation tests
- PostgreSQL parameterization and row-lock verification
- Migration and deployment static verification

## Explicitly not verified in this environment

- Refresh-session behavior against a live PostgreSQL server
- Concurrent refresh requests from multiple real database connections
- Database persistence across process and PostgreSQL restarts
- Managed backup restoration

## Security and product limitations still remaining

- No password reset, email verification, MFA, or user-facing session inventory
- No distributed rate limiting or account lockout
- Access tokens remain valid until their short expiration after logout
- No asymmetric signing or external identity provider integration
- No encrypted evidence/file storage
- No matter-specific ethical walls
- No external penetration test

## Data-safety boundary

Version `0.6.0` materially strengthens session security, but live PostgreSQL execution, account recovery and verification, MFA, distributed abuse controls, encrypted evidence storage, backup restoration, and external security testing remain required before confidential client data is approved.
