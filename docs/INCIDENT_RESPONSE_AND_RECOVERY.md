# Incident response and recovery readiness

This is a pre-launch operating requirement, not evidence that an Atlas security organization currently provides 24-hour incident response.

## Severity and immediate actions

1. Protect people and preserve attorney-client confidentiality.
2. Record the incident start time, reporter, affected systems, firms, data classes, and evidence locations.
3. Revoke affected user, firm, integration, API, and deployment credentials without destroying evidence.
4. Isolate compromised services, keys, queues, and storage while preserving read-only forensic copies.
5. Engage the designated incident commander, security lead, privacy/legal lead, infrastructure owner, and customer-communications owner.
6. Determine notification duties by contract and jurisdiction; do not make unsupported assurances.
7. Restore only from verified artifacts and rotate every credential within the affected trust boundary.
8. Monitor for recurrence, document lessons, and track every corrective action to closure.

## Recovery program required before confidential production use

- Approve RPO and RTO for the API, database, document storage, identity, integrations, AI worker, and communications.
- Enable encrypted point-in-time database recovery and separately controlled backup copies.
- Test restoration at least quarterly into an isolated environment and preserve timestamps, checksums, record counts, results, and approver evidence.
- Exercise account compromise, exposed integration secret, malicious file, unavailable AI provider, database-region failure, and ransomware scenarios.
- Maintain offline access to provider contacts, deployment procedures, encryption-key recovery, firm notification contacts, and legal guidance.
