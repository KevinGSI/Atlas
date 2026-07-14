# Firm user management

Atlas exposes firm user administration from **Account Info → Manage Users**. The page is backed by the same identity, membership, subscription, session, MFA, and security-event services used by the rest of the application; it is not a demo-only directory.

## Administrator capabilities

Firm owners and administrators can:

- view active and deactivated users in their own firm;
- see each user's firm role, access status, MFA status, active-session count, last-session date, and account-added date;
- create one-time, expiring invitations for available subscription seats;
- cancel a pending invitation so its link can no longer be accepted;
- change an ordinary user's firm role;
- remove firm access without erasing the user's work or the firm's audit history; and
- restore previously removed firm access.

Role changes and access removal revoke the affected user's Atlas sessions. The user must sign in again after an authorized administrator restores access. Material changes create append-only firm security events.

## Permission and privacy boundaries

- All management operations are authorized on the server and scoped to one workspace. An administrator in one firm cannot list or change another firm's users.
- Only a firm owner may assign or manage an administrator. Managed users cannot be promoted to owner through this interface.
- The owner account, the acting administrator's own access, and peer-administrator access are protected from unsafe changes.
- “Remove firm access” is reversible deactivation, not destructive account deletion. Canonical case history, authorship, audit records, and security evidence remain intact.
- A firm administrator may manage firm role and access settings but cannot read or change another person's global Atlas identity credentials.
- Password hashes, passwords, MFA secrets, recovery codes, refresh tokens, session-token hashes, and connected-provider credentials never appear in the directory response or interface.

Permanent personal-account erasure, employment-record retention, litigation holds, and customer-termination deletion require a separate, counsel-approved privacy and records-retention workflow. They are intentionally not represented by the firm access control.
