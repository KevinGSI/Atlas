# Atlas Core 0.10.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.9.0`
- Failed-login tracking by SHA-256 normalized-email hash rather than raw email
- Equivalent scrypt password-verification work for known and unknown accounts
- Configurable rolling failure window, failure threshold, and lock duration
- Timed lockout with stable `429 ACCOUNT_LOCKED` responses
- Identical invalid-credentials-to-lockout sequence for known and unknown principals
- Automatic lockout expiration and fresh failure window
- Successful-login clearing of accumulated failures
- Atomic PostgreSQL upsert preventing lost concurrent failure increments
- Partial PostgreSQL index for locked principals

## Verification completed here

- 65 canonical tests covering domain, HTTP, authentication, authorization, persistence, concurrency, audit, deployment, sessions, recovery, abuse controls, and rollback
- Known-account and unknown-account response-sequence equivalence
- Timed lockout, post-expiration success, and successful-login reset tests
- End-to-end HTTP `429 ACCOUNT_LOCKED` response and expiration metadata
- PostgreSQL atomic upsert, hashed principal, and clearing-query verification

## Explicitly not verified in this environment

- Login throttling against a live PostgreSQL server
- Concurrent failures across multiple real application instances
- Database persistence across process and PostgreSQL restarts
- Delivery through a real transactional email provider
- Managed backup restoration

## Security and product limitations still remaining

- Throttling is principal-based; no distributed IP/network-level rate limiter exists
- No email verification, MFA, or authenticated password-change endpoint
- No asymmetric signing or external identity provider integration
- No encrypted evidence/file storage
- No matter-specific ethical walls
- No external penetration test

## Data-safety boundary

Version `0.10.0` adds persistent credential-abuse controls, but live PostgreSQL concurrency testing, network-level distributed rate limiting, a real email provider, email verification, MFA, encrypted evidence storage, backup restoration, and external security testing remain required before confidential client data is approved.
