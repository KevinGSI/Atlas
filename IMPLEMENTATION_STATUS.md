# Atlas Core 0.9.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.8.0`
- Persisted issuing-session validation on every protected request
- Immediate access-token rejection after individual session revocation
- Immediate rejection after global logout or password-reset session revocation
- Immediate rejection of the previous access token after refresh rotation
- Refresh-session expiration enforcement during access authentication
- Rejection of access tokens without a session identifier
- Cross-user and missing-session normalization to a stable security response
- Stable `401 ACCESS_TOKEN_REVOKED` and `401 ACCESS_TOKEN_SESSION_REQUIRED` errors
- PostgreSQL session validation constrained by user and session ID

## Verification completed here

- 61 canonical tests covering domain, HTTP, authentication, authorization, persistence, concurrency, audit, deployment, sessions, recovery, and rollback
- End-to-end immediate rejection after individual and global logout
- Rotated, revoked, refresh-expired, missing-binding, and valid-session authentication tests
- Existing workspace authorization and recovery flows rerun under session enforcement
- PostgreSQL user-and-session query scoping verification

## Explicitly not verified in this environment

- Immediate revocation against a live PostgreSQL server
- Concurrent authentication and revocation across multiple application instances
- Database persistence across process and PostgreSQL restarts
- Delivery through a real transactional email provider
- Managed backup restoration

## Security and product limitations still remaining

- Every authenticated request now performs a database session lookup; no safe distributed cache has been implemented
- No email verification, MFA, or authenticated password-change endpoint
- No distributed rate limiting or account lockout
- No asymmetric signing or external identity provider integration
- No encrypted evidence/file storage
- No matter-specific ethical walls
- No external penetration test

## Data-safety boundary

Version `0.9.0` closes the known delayed access-token revocation gap, but live PostgreSQL execution, multi-instance concurrency testing, a real email provider, email verification, MFA, abuse controls, encrypted evidence storage, backup restoration, and external security testing remain required before confidential client data is approved.
