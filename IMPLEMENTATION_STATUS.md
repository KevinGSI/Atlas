# Atlas Core 0.8.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.7.0`
- Session identifiers embedded in newly issued signed access tokens
- Authenticated session inventory ordered newest-first
- Active, rotated, expired, and revoked session status
- Current-session identification
- Safe public session views excluding token hashes and token-family identifiers
- Individual session revocation constrained by both user and session ID
- Cross-account session lookup and revocation prevention
- Account-wide refresh-session revocation (global logout)
- PostgreSQL user-scoped session queries using the existing indexed session table
- HTTP endpoints for session list, individual revocation, and global revocation

## Verification completed here

- 59 canonical tests covering domain, HTTP, authentication, authorization, persistence, concurrency, audit, deployment, sessions, recovery, and rollback
- End-to-end HTTP session inventory, individual device logout, and global logout flow
- Cross-user isolation and safe-response-field tests
- Session-bound access-token claim verification
- PostgreSQL query scoping and ordering verification

## Explicitly not verified in this environment

- Session inventory and revocation against a live PostgreSQL server
- Concurrent revocation from multiple real database connections
- Database persistence across process and PostgreSQL restarts
- Delivery through a real transactional email provider
- Managed backup restoration

## Security and product limitations still remaining

- Revoked sessions cannot refresh, but already-issued access tokens remain valid until their short expiration
- No email verification, MFA, or authenticated password-change endpoint
- No distributed rate limiting or account lockout
- No asymmetric signing or external identity provider integration
- No encrypted evidence/file storage
- No matter-specific ethical walls
- No external penetration test

## Data-safety boundary

Version `0.8.0` gives users direct control over refresh sessions, but immediate access-token revocation, live PostgreSQL execution, a real email provider, email verification, MFA, abuse controls, encrypted evidence storage, backup restoration, and external security testing remain required before confidential client data is approved.
