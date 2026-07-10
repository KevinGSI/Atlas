# Atlas Core 0.4.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.3.0`
- User registration with normalized unique email addresses
- Memory-hard `scrypt` password hashing with unique 128-bit salts
- Constant-time password and token signature comparison
- Signed HS256 bearer access tokens with issuance and expiration times
- Token tamper and expiration rejection
- Production enforcement of a 32-character minimum signing secret
- Workspace memberships with `owner`, `admin`, `member`, and `viewer` roles
- Permission enforcement for workspace reads, writes, and membership administration
- Atomic workspace and owner-membership creation
- Authentication on every workspace API route in the real application runtime
- PostgreSQL user and membership schema, indexes, repository methods, and constraints
- Password hashes excluded from API registration and login responses

## Verification completed here

- 37 canonical tests covering domain, HTTP, deployment, persistence, identity, tokens, and roles
- Wrong-password, token-tamper, token-expiry, missing-token, and viewer-write-denial tests
- Real-socket registration, workspace ownership, authenticated access, and `401` rejection smoke test
- Real listener, readiness, and shutdown lifecycle smoke tests inherited from `0.3.0`
- Fresh package installation, Git-bundle reconstruction, and ZIP reconstruction

## Security limitations still remaining

- No refresh-token rotation, revocation list, password reset, email verification, or MFA
- No account lockout or distributed login rate limiting
- No invitation acceptance workflow
- No matter-specific ethical-wall permissions
- No external identity provider or SSO
- No encrypted evidence/file storage
- No complete append-only audit ledger
- No external penetration test

## Data-safety boundary

Version `0.4.0` establishes a tested identity and workspace authorization foundation, but it is not yet approved for confidential client data. Refresh-token security, account recovery, auditability, evidence storage, backup restoration, and external security assessment remain mandatory production milestones.
