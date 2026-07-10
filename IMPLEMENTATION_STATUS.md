# Atlas Core 0.7.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.6.0`
- Opaque, cryptographically random password-reset tokens
- SHA-256 reset-token hashes at rest; raw reset tokens are never persisted
- Configurable reset expiration (15-minute default)
- Generic request responses for known accounts, unknown accounts, and delivery failures
- Injectable delivery boundary without claiming an email provider exists
- PostgreSQL row locking before reset consumption
- Single-use reset enforcement
- Account-wide invalidation of every outstanding reset token after success
- Atomic password replacement, reset consumption, and refresh-session revocation
- Existing passwords rejected and replacement passwords accepted after recovery
- PostgreSQL indexes for user and active-reset queries

## Verification completed here

- 54 canonical tests covering domain, HTTP, authentication, authorization, persistence, concurrency, audit, deployment, sessions, recovery, and rollback
- End-to-end HTTP password recovery and replacement-login flow
- Unknown-account, delivery-failure, expiration, single-use, parallel-token invalidation, and rollback tests
- PostgreSQL parameterization and row-lock verification
- Migration and deployment static verification

## Explicitly not verified in this environment

- Password recovery against a live PostgreSQL server
- Delivery through a real transactional email provider
- Concurrent reset requests from multiple real database connections
- Database persistence across process and PostgreSQL restarts
- Managed backup restoration

## Security and product limitations still remaining

- No email verification, MFA, user-facing session inventory, or password-change endpoint for authenticated users
- No distributed rate limiting or account lockout
- Access tokens remain valid until their short expiration after password reset or logout
- No asymmetric signing or external identity provider integration
- No encrypted evidence/file storage
- No matter-specific ethical walls
- No external penetration test

## Data-safety boundary

Version `0.7.0` establishes the recovery transaction and delivery contract, but a real email provider, live PostgreSQL execution, email verification, MFA, abuse controls, encrypted evidence storage, backup restoration, and external security testing remain required before confidential client data is approved.
